-- Omgange: hvem har givet en omgang, og hvis tur er det så?
-- Alle på holdet kan skrive en omgang på hvem som helst på holdet. Kun den, der skrev den, kan fortryde den.

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references public.crawls on delete cascade,
  stop_id uuid,
  buyer_id uuid not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  -- Den, der giver, skal være på holdet. Går man hjem, forsvinder ens omgange med, ligesom drinks.
  foreign key (crawl_id, buyer_id) references public.members (crawl_id, user_id) on delete cascade,
  foreign key (stop_id, crawl_id) references public.stops (id, crawl_id) on delete set null (stop_id)
);
create index rounds_crawl_idx on public.rounds (crawl_id, created_at);
create index rounds_buyer_idx on public.rounds (crawl_id, buyer_id);
create index rounds_stop_idx on public.rounds (stop_id, crawl_id);

alter table public.rounds enable row level security;

revoke all on public.rounds from anon, authenticated;
grant select, delete on public.rounds to authenticated;
-- id, created_by og created_at sættes altid af databasen.
grant insert (crawl_id, stop_id, buyer_id) on public.rounds to authenticated;

create policy rounds_select on public.rounds for select to authenticated
  using (public.is_member(crawl_id));
create policy rounds_insert on public.rounds for insert to authenticated
  with check (created_by = auth.uid() and public.is_member(crawl_id));
create policy rounds_delete on public.rounds for delete to authenticated
  using (created_by = auth.uid() and public.is_member(crawl_id));

alter publication supabase_realtime add table public.rounds;
