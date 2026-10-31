-- Udfordringspoint: hver trukket udfordring bliver en række, og holdet stemmer om, den blev klaret.
-- Spillene under Spil (Hvem skal …?, terninger, plat eller krone) bruger kun Realtime broadcast og har ingen tabel.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references public.crawls on delete cascade,
  stop_id uuid,
  text text not null check (char_length(text) between 1 and 300),
  -- null betyder en udfordring for hele holdet.
  target_user_id uuid,
  created_at timestamptz not null default now(),
  unique (id, crawl_id),
  foreign key (stop_id, crawl_id) references public.stops (id, crawl_id) on delete set null (stop_id)
);
create index challenges_crawl_idx on public.challenges (crawl_id, created_at);

create table public.challenge_votes (
  challenge_id uuid not null,
  crawl_id uuid not null,
  user_id uuid not null,
  done boolean not null,
  voted_at timestamptz not null default now(),
  primary key (challenge_id, user_id),
  foreign key (challenge_id, crawl_id) references public.challenges (id, crawl_id) on delete cascade,
  foreign key (crawl_id, user_id) references public.members (crawl_id, user_id) on delete cascade
);
create index challenge_votes_crawl_idx on public.challenge_votes (crawl_id);
create index challenge_votes_member_idx on public.challenge_votes (crawl_id, user_id);

-- Den udfordring, der vises under Nu. crawls.challenge bliver ved med at have teksten.
alter table public.crawls add column current_challenge_id uuid;
alter table public.crawls
  add constraint crawls_current_challenge_fk
  foreign key (current_challenge_id, id) references public.challenges (id, crawl_id)
  on delete set null (current_challenge_id);
create index crawls_current_challenge_idx on public.crawls (current_challenge_id);
grant update (current_challenge_id) on public.crawls to authenticated;

-- Rettigheder

alter table public.challenges enable row level security;
alter table public.challenge_votes enable row level security;

revoke all on public.challenges, public.challenge_votes from anon, authenticated;

grant select, insert on public.challenges to authenticated;
create policy challenges_select on public.challenges for select to authenticated
  using (public.is_member(crawl_id));
-- Den, udfordringen er til, skal være på holdet.
create policy challenges_insert on public.challenges for insert to authenticated
  with check (
    public.is_member(crawl_id)
    and (
      target_user_id is null
      or exists (
        select 1 from public.members m
        where m.crawl_id = challenges.crawl_id and m.user_id = challenges.target_user_id
      )
    )
  );

-- Stemmer læses direkte, men skrives kun gennem vote_challenge.
grant select on public.challenge_votes to authenticated;
create policy challenge_votes_select on public.challenge_votes for select to authenticated
  using (public.is_member(crawl_id));

create function public.vote_challenge(p_challenge uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crawl uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_done is null then
    raise exception 'invalid_vote';
  end if;
  select crawl_id into v_crawl from public.challenges where id = p_challenge;
  if not found or not public.is_member(v_crawl) then
    raise exception 'challenge_not_found';
  end if;
  insert into public.challenge_votes (challenge_id, crawl_id, user_id, done)
  values (p_challenge, v_crawl, auth.uid(), p_done)
  on conflict (challenge_id, user_id) do update set done = excluded.done, voted_at = now();
end;
$$;

revoke execute on function public.vote_challenge(uuid, boolean) from public, anon;
grant execute on function public.vote_challenge(uuid, boolean) to authenticated;

-- Live-opdateringer

alter publication supabase_realtime add table public.challenges, public.challenge_votes;
