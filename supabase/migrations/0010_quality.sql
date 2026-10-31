-- Fejlrapporter fra telefonerne. Klienten må kun indsætte, aldrig læse. Rapporterne læses i Supabase.
-- Højst 30 rapporter pr. bruger i timen, håndhævet her i databasen.

create table public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  crawl_code text check (crawl_code ~ '^[A-Z0-9]{6}$'),
  message text not null check (char_length(message) between 1 and 1000),
  stack text check (char_length(stack) <= 4000),
  url text check (char_length(url) <= 2000),
  user_agent text check (char_length(user_agent) <= 500),
  created_at timestamptz not null default now()
);
create index client_errors_user_idx on public.client_errors (user_id, created_at);
create index client_errors_created_idx on public.client_errors (created_at);

-- Sætter afsender og tid på serveren, afkorter stakken og tæller rapporterne i den seneste time.
create function public.client_errors_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  new.user_id := auth.uid();
  new.created_at := now();
  new.stack := left(new.stack, 4000);
  -- Én ad gangen pr. bruger, så samtidige rapporter ikke kan snyde tællingen.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client_errors:' || new.user_id::text, 0));
  select count(*) into recent
  from public.client_errors
  where user_id = new.user_id and created_at > now() - interval '1 hour';
  if recent >= 30 then
    raise exception 'too_many_errors';
  end if;
  return new;
end;
$$;

revoke execute on function public.client_errors_before_insert() from public, anon, authenticated;

create trigger client_errors_before_insert
  before insert on public.client_errors
  for each row execute function public.client_errors_before_insert();

alter table public.client_errors enable row level security;

revoke all on public.client_errors from anon, authenticated;
-- Kun de felter, klienten selv kender. user_id og created_at sætter databasen.
grant insert (crawl_code, message, stack, url, user_agent) on public.client_errors to authenticated;
create policy client_errors_insert on public.client_errors for insert to authenticated
  with check (user_id = (select auth.uid()));
