-- Er alle med? Et navneopråb, når holdet går videre, så ingen bliver glemt på pubben.
-- Højst ét åbent opråb pr. tur. Det lukker af sig selv, når alle har svaret, og regnes for lukket efter 20 minutter.
-- Alle skrivninger går gennem funktionerne nedenfor. Klienten kan kun læse tabellerne.

create table public.roll_calls (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references public.crawls on delete cascade,
  started_by uuid not null default auth.uid() references auth.users on delete cascade,
  from_stop_id uuid,
  to_stop_id uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  foreign key (from_stop_id, crawl_id) references public.stops (id, crawl_id) on delete set null (from_stop_id),
  foreign key (to_stop_id, crawl_id) references public.stops (id, crawl_id) on delete set null (to_stop_id)
);
create unique index roll_calls_one_open_idx on public.roll_calls (crawl_id) where closed_at is null;
create index roll_calls_crawl_idx on public.roll_calls (crawl_id, created_at desc);
create index roll_calls_started_by_idx on public.roll_calls (started_by);
create index roll_calls_from_stop_idx on public.roll_calls (from_stop_id, crawl_id);
create index roll_calls_to_stop_idx on public.roll_calls (to_stop_id, crawl_id);

-- crawl_id gemmes også her, så Realtime kan filtrere svarene på turen.
create table public.roll_call_answers (
  roll_call_id uuid not null references public.roll_calls on delete cascade,
  user_id uuid not null,
  crawl_id uuid not null,
  answered_at timestamptz not null default now(),
  primary key (roll_call_id, user_id),
  foreign key (crawl_id, user_id) references public.members (crawl_id, user_id) on delete cascade
);
create index roll_call_answers_crawl_idx on public.roll_call_answers (crawl_id, answered_at);

-- Hjælper: lukker et åbent opråb, hvis alle nuværende deltagere har svaret.
create function public.roll_call_close_if_complete(p_roll_call uuid)
returns void
language sql
set search_path = ''
as $$
  update public.roll_calls r
  set closed_at = now()
  where r.id = p_roll_call
    and r.closed_at is null
    and not exists (
      select 1 from public.members m
      where m.crawl_id = r.crawl_id
        and not exists (
          select 1 from public.roll_call_answers a
          where a.roll_call_id = r.id and a.user_id = m.user_id
        )
    );
$$;

-- Starter et opråb. Er der allerede et åbent (fx fordi to trykkede Videre på samme tid), gives det tilbage.
-- Den, der starter, er selvfølgelig med.
create function public.start_roll_call(p_crawl uuid, p_from_stop uuid default null, p_to_stop uuid default null)
returns public.roll_calls
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.roll_calls;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_member(p_crawl) then
    raise exception 'not_member';
  end if;
  -- Et gammelt opråb, der aldrig blev lukket, lukkes ved udløbet.
  update public.roll_calls
  set closed_at = created_at + interval '20 minutes'
  where crawl_id = p_crawl and closed_at is null and created_at <= now() - interval '20 minutes';

  select * into r from public.roll_calls where crawl_id = p_crawl and closed_at is null;
  if found then
    return r;
  end if;
  if (select count(*) from public.roll_calls where crawl_id = p_crawl) >= 300 then
    raise exception 'too_many_roll_calls';
  end if;
  begin
    insert into public.roll_calls (crawl_id, started_by, from_stop_id, to_stop_id)
    values (p_crawl, auth.uid(), p_from_stop, p_to_stop)
    returning * into r;
  exception when unique_violation then
    select * into r from public.roll_calls where crawl_id = p_crawl and closed_at is null;
    return r;
  end;
  insert into public.roll_call_answers (roll_call_id, user_id, crawl_id)
  values (r.id, auth.uid(), p_crawl);
  perform public.roll_call_close_if_complete(r.id);
  select * into r from public.roll_calls where id = r.id;
  return r;
end;
$$;

-- "Jeg er med". Man kan kun svare for sig selv, og kun mens opråbet er åbent.
create function public.answer_roll_call(p_roll_call uuid)
returns public.roll_calls
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.roll_calls;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  -- Låsen gør, at to samtidige svar ikke begge overser, at alle nu er med.
  select * into r from public.roll_calls where id = p_roll_call for update;
  if not found or not public.is_member(r.crawl_id) then
    raise exception 'roll_call_not_found';
  end if;
  if r.closed_at is not null or r.created_at <= now() - interval '20 minutes' then
    raise exception 'roll_call_closed';
  end if;
  insert into public.roll_call_answers (roll_call_id, user_id, crawl_id)
  values (r.id, auth.uid(), r.crawl_id)
  on conflict (roll_call_id, user_id) do nothing;
  perform public.roll_call_close_if_complete(r.id);
  select * into r from public.roll_calls where id = p_roll_call;
  return r;
end;
$$;

-- Lukker opråbet. Alle på holdet må lukke (appen viser knappen for den, der startede).
-- Lukker også, hvis nogen er gået hjem, og resten allerede har svaret.
create function public.close_roll_call(p_roll_call uuid)
returns public.roll_calls
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.roll_calls;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into r from public.roll_calls where id = p_roll_call for update;
  if not found or not public.is_member(r.crawl_id) then
    raise exception 'roll_call_not_found';
  end if;
  if r.closed_at is null then
    update public.roll_calls
    set closed_at = least(now(), created_at + interval '20 minutes')
    where id = p_roll_call
    returning * into r;
  end if;
  return r;
end;
$$;

revoke execute on function public.roll_call_close_if_complete(uuid) from public, anon, authenticated;
revoke execute on function public.start_roll_call(uuid, uuid, uuid) from public, anon;
revoke execute on function public.answer_roll_call(uuid) from public, anon;
revoke execute on function public.close_roll_call(uuid) from public, anon;
grant execute on function public.start_roll_call(uuid, uuid, uuid) to authenticated;
grant execute on function public.answer_roll_call(uuid) to authenticated;
grant execute on function public.close_roll_call(uuid) to authenticated;

-- Rettigheder: kun læsning for holdet.

alter table public.roll_calls enable row level security;
alter table public.roll_call_answers enable row level security;

revoke all on public.roll_calls, public.roll_call_answers from anon, authenticated;
grant select on public.roll_calls, public.roll_call_answers to authenticated;

create policy roll_calls_select on public.roll_calls for select to authenticated
  using (public.is_member(crawl_id));
create policy roll_call_answers_select on public.roll_call_answers for select to authenticated
  using (public.is_member(crawl_id));

-- Live-opdateringer

alter publication supabase_realtime add table public.roll_calls, public.roll_call_answers;
