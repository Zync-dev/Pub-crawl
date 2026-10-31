-- Rettelser efter gennemgangen af database og sikkerhed (oktober 2026).
-- Alt her er nyt eller create or replace. Ingen tidligere migration er rettet.

-- ---------------------------------------------------------------------------------------------
-- 1. Push: modtagernes nøgler når aldrig en browser.
--
-- push_targets gav endpoint og nøgler for hele holdet til enhver på holdet, og save_push_subscription
-- lod hvem som helst overtage et endpoint. Nu kaldes push_targets og drop_push_endpoints kun af
-- /api/push med serverens hemmelige nøgle (service_role). Ruten tjekker brugerens adgangsnøgle
-- først og giver brugerens id med, og funktionerne tjekker selv, at brugeren er på turen.
-- ---------------------------------------------------------------------------------------------

-- Kun push-tjenesternes egne adresser, så /api/push ikke kan bruges til at sende kald til fremmede
-- servere. Samme liste står i src/lib/push-endpoint.ts.
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_host check (
    endpoint ~* '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)/'
  );

-- Et endpoint skifter kun ejer, hvis den, der gemmer, også kender nøglerne. Det gør en ny anonym
-- bruger på samme telefon (samme abonnement), men ingen andre, nu hvor nøglerne ikke deles.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now()
    where push_subscriptions.user_id = auth.uid()
      or (push_subscriptions.p256dh = excluded.p256dh and push_subscriptions.auth = excluded.auth);
  -- Højst fem apparater pr. bruger. De ældste ryger.
  delete from public.push_subscriptions
  where user_id = auth.uid()
    and id not in (
      select id from public.push_subscriptions
      where user_id = auth.uid()
      order by created_at desc
      limit 5
    );
end;
$$;

drop function public.push_targets(uuid, text, text);

-- Registrerer beskeden og giver kun modtagerne tilbage, hvis den ikke er sendt før.
-- p_user er afsenderen, som /api/push har tjekket. Den, der sender, får ikke sin egen besked,
-- undtagen ved 'timer', som alle skal have.
create function public.push_targets(p_crawl uuid, p_kind text, p_key text, p_user uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted int;
begin
  if p_user is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.members m where m.crawl_id = p_crawl and m.user_id = p_user) then
    raise exception 'not_member';
  end if;
  if p_kind is null or p_kind !~ '^[a-z_]{1,20}$' or p_key is null or char_length(p_key) not between 1 and 200 then
    raise exception 'invalid_notification';
  end if;
  -- Et loft, så ingen kan sende en strøm af beskeder til holdet.
  if (
    select count(*) from public.notifications_sent n
    where n.crawl_id = p_crawl and n.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'rate_limited';
  end if;

  insert into public.notifications_sent (crawl_id, kind, key, sent_by)
  values (p_crawl, p_kind, p_key, p_user)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return;
  end if;

  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.members m on m.user_id = s.user_id and m.crawl_id = p_crawl
    where p_kind = 'timer' or s.user_id <> p_user;
end;
$$;

-- Fjerner endpoints, som push-tjenesten siger er døde (404/410). Kun abonnementer hos holdet.
create or replace function public.drop_push_endpoints(p_crawl uuid, p_endpoints text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  if p_endpoints is null or cardinality(p_endpoints) = 0 then
    return 0;
  end if;
  if cardinality(p_endpoints) > 50 then
    raise exception 'too_many_endpoints';
  end if;
  delete from public.push_subscriptions s
  where s.endpoint = any (p_endpoints)
    and s.user_id in (select m.user_id from public.members m where m.crawl_id = p_crawl);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.push_targets(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.drop_push_endpoints(uuid, text[]) from public, anon, authenticated;
grant execute on function public.push_targets(uuid, text, text, uuid) to service_role;
grant execute on function public.drop_push_endpoints(uuid, text[]) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. Koden kan ikke gættes: højst 10 forkerte koder pr. bruger og 500 i alt på 10 minutter.
--
-- crawl_preview og join_crawl tæller forkerte koder. Over loftet afvises også en rigtig kode,
-- ellers ville svaret stadig afsløre, om koden findes.
-- ---------------------------------------------------------------------------------------------

create table public.code_misses (
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index code_misses_user_idx on public.code_misses (user_id, created_at);
create index code_misses_created_idx on public.code_misses (created_at);

-- Kun funktionerne nedenfor skriver og læser tabellen.
alter table public.code_misses enable row level security;
revoke all on public.code_misses from anon, authenticated;

create function public.code_guard()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  -- Én ad gangen pr. bruger, så samtidige forsøg ikke kan snyde tællingen.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('code_misses:' || auth.uid()::text, 0));
  if (
    select count(*) from public.code_misses
    where user_id = auth.uid() and created_at > now() - interval '10 minutes'
  ) >= 10
  or (
    select count(*) from public.code_misses
    where created_at > now() - interval '10 minutes'
  ) >= 500 then
    raise exception 'rate_limited' using hint = 'For mange forkerte koder. Prøv igen om lidt.';
  end if;
end;
$$;

create function public.code_missed()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.code_misses (user_id) values (auth.uid());
  delete from public.code_misses where created_at < now() - interval '1 day';
$$;

revoke execute on function public.code_guard() from public, anon, authenticated;
revoke execute on function public.code_missed() from public, anon, authenticated;

-- Viser kun navnet og antallet af deltagere, så invitationen kan sige, hvad man siger ja til.
-- Ikke længere stable, fordi en forkert kode skrives ned.
create or replace function public.crawl_preview(p_code text)
returns table (name text, member_count int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_name text;
begin
  perform public.code_guard();
  select c.id, c.name into v_id, v_name from public.crawls c where c.code = upper(trim(p_code));
  if v_id is null then
    perform public.code_missed();
    return;
  end if;
  return query
    select v_name, (select count(*)::int from public.members m where m.crawl_id = v_id);
end;
$$;

-- En forkert kode giver en tom række (id er null) i stedet for en fejl. En fejl ville rulle
-- tællingen tilbage. Er arrangøren ikke længere på holdet (gik, før nogen kom med), overtager
-- den, der kommer med.
create or replace function public.join_crawl(p_code text, p_member_name text)
returns public.crawls
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.crawls;
  member_count int;
begin
  perform public.code_guard();
  select * into c from public.crawls where code = upper(trim(p_code)) for update;
  if not found then
    perform public.code_missed();
    return null;
  end if;
  select count(*) into member_count from public.members where crawl_id = c.id;
  if member_count >= 30 and not public.is_member(c.id) then
    raise exception 'crawl_full';
  end if;
  insert into public.members (crawl_id, user_id, name, color)
  values (c.id, auth.uid(), trim(p_member_name), member_count % 10)
  on conflict (crawl_id, user_id) do update set name = excluded.name;
  if not exists (select 1 from public.members m where m.crawl_id = c.id and m.user_id = c.created_by) then
    update public.crawls set created_by = auth.uid() where id = c.id returning * into c;
  end if;
  return c;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Arrangøren skal være på holdet, og en fjernet deltager mister live-linket.
-- ---------------------------------------------------------------------------------------------

create or replace function public.set_route_locked(p_crawl uuid, p_locked boolean)
returns public.crawls
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.crawls;
begin
  update public.crawls set route_locked = coalesce(p_locked, false)
  where id = p_crawl and created_by = auth.uid() and public.is_member(p_crawl)
  returning * into c;
  if not found then
    raise exception 'not_arranger' using errcode = '42501';
  end if;
  return c;
end;
$$;

-- Fjerner en deltager. Deres drinks forsvinder med (cascade fra members), og det samme gør de
-- udfordringer, de selv har trukket. Turen får et nyt live-link, fordi den fjernede kendte det.
-- Holdet får det nye link via Realtime.
create or replace function public.remove_member(p_crawl uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.crawls
  where id = p_crawl and created_by = auth.uid() and public.is_member(p_crawl)
  for update;
  if not found then
    raise exception 'not_arranger' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot_remove_self';
  end if;
  delete from public.members where crawl_id = p_crawl and user_id = p_user;
  if not found then
    raise exception 'member_not_found';
  end if;
  delete from public.challenges where crawl_id = p_crawl and created_by = p_user;
  update public.crawls set share_token = public.new_share_token() where id = p_crawl;
end;
$$;

create or replace function public.rotate_code(p_crawl uuid)
returns public.crawls
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.crawls;
  tries int := 0;
begin
  perform 1 from public.crawls
  where id = p_crawl and created_by = auth.uid() and public.is_member(p_crawl)
  for update;
  if not found then
    raise exception 'not_arranger' using errcode = '42501';
  end if;
  loop
    begin
      update public.crawls set code = public.new_crawl_code()
      where id = p_crawl
      returning * into c;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then
        raise;
      end if;
    end;
  end loop;
  return c;
end;
$$;

create or replace function public.transfer_arranger(p_crawl uuid, p_user uuid)
returns public.crawls
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.crawls;
begin
  perform 1 from public.crawls
  where id = p_crawl and created_by = auth.uid() and public.is_member(p_crawl)
  for update;
  if not found then
    raise exception 'not_arranger' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'already_arranger';
  end if;
  if not exists (select 1 from public.members where crawl_id = p_crawl and user_id = p_user) then
    raise exception 'member_not_found';
  end if;
  update public.crawls set created_by = p_user where id = p_crawl returning * into c;
  return c;
end;
$$;

create or replace function public.rotate_share_token(p_crawl uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  token text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update public.crawls
  set share_token = public.new_share_token()
  where id = p_crawl and created_by = auth.uid() and public.is_member(p_crawl)
  returning share_token into token;
  if token is null then
    raise exception 'not_creator';
  end if;
  return token;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Realtime: en sletning afslører ikke længere turens og brugerens id.
--
-- Realtime sender den slettede rækkes primærnøgle til alle, der lytter på tabellen, uden RLS.
-- Tabellerne får en tilfældig id som primærnøgle, og de gamle nøgler bliver unikke krav.
-- ---------------------------------------------------------------------------------------------

alter table public.members add column id uuid not null default gen_random_uuid();
-- Fjerner også de seks fremmednøgler, der peger på (crawl_id, user_id). De laves igen nedenfor.
alter table public.members drop constraint members_pkey cascade;
alter table public.members add constraint members_pkey primary key (id);
alter table public.members add constraint members_crawl_id_user_id_key unique (crawl_id, user_id);

alter table public.drinks
  add constraint drinks_crawl_id_user_id_fkey
  foreign key (crawl_id, user_id) references public.members (crawl_id, user_id) on delete cascade;
alter table public.roll_call_answers
  add constraint roll_call_answers_crawl_id_user_id_fkey
  foreign key (crawl_id, user_id) references public.members (crawl_id, user_id) on delete cascade;
alter table public.stop_ratings
  add constraint stop_ratings_crawl_id_user_id_fkey
  foreign key (crawl_id, user_id) references public.members (crawl_id, user_id) on delete cascade;
alter table public.photos
  add constraint photos_crawl_id_user_id_fkey
  foreign key (crawl_id, user_id) references public.members (crawl_id, user_id) on delete cascade;
alter table public.rounds
  add constraint rounds_crawl_id_buyer_id_fkey
  foreign key (crawl_id, buyer_id) references public.members (crawl_id, user_id) on delete cascade;
alter table public.challenge_votes
  add constraint challenge_votes_crawl_id_user_id_fkey
  foreign key (crawl_id, user_id) references public.members (crawl_id, user_id) on delete cascade;

alter table public.stop_ratings add column id uuid not null default gen_random_uuid();
alter table public.stop_ratings drop constraint stop_ratings_pkey;
alter table public.stop_ratings add constraint stop_ratings_pkey primary key (id);
alter table public.stop_ratings add constraint stop_ratings_stop_id_user_id_key unique (stop_id, user_id);

alter table public.challenge_votes add column id uuid not null default gen_random_uuid();
alter table public.challenge_votes drop constraint challenge_votes_pkey;
alter table public.challenge_votes add constraint challenge_votes_pkey primary key (id);
alter table public.challenge_votes add constraint challenge_votes_challenge_id_user_id_key unique (challenge_id, user_id);

alter table public.roll_call_answers add column id uuid not null default gen_random_uuid();
alter table public.roll_call_answers drop constraint roll_call_answers_pkey;
alter table public.roll_call_answers add constraint roll_call_answers_pkey primary key (id);
alter table public.roll_call_answers add constraint roll_call_answers_roll_call_id_user_id_key unique (roll_call_id, user_id);

-- ---------------------------------------------------------------------------------------------
-- 5. Billeder: en fil uden række ses kun af den, der lagde den op.
--
-- Før kunne holdet se alle filer i turens mappe, også dem, hvis række var slettet (billedet var
-- slettet i appen, eller den, der tog det, er gået). Den, der lægger op, skal kunne se sin fil,
-- før rækken findes.
-- ---------------------------------------------------------------------------------------------

-- security definer, så policyen på storage.objects ikke læser photos med RLS. Ellers ville
-- photos_insert (som læser storage.objects) og denne policy gå i ring.
create function public.photo_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.photo_path_member(p_name)
    and exists (select 1 from public.photos p where p.path = p_name);
$$;

revoke execute on function public.photo_visible(text) from public, anon;
grant execute on function public.photo_visible(text) to authenticated;

drop policy pub_reviews_photos_select on storage.objects;
create policy pub_reviews_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and public.photo_path_member(name)
    and (owner_id = (select auth.uid())::text or public.photo_visible(name))
  );

-- ---------------------------------------------------------------------------------------------
-- 6. Positioner: tiden sættes af databasen, ikke af telefonens ur.
--
-- located_at kom fra telefonen. Gik uret forkert (fx en dag frem), slettede cron aldrig positionen.
-- Nu sætter databasen tiden, når en position skrives. Klienten må stadig sende feltet, så ældre
-- versioner af appen virker, men værdien overskrives.
-- ---------------------------------------------------------------------------------------------

create function public.members_stamp_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Cron, service role og SQL Editor har ingen bruger og røres ikke.
  if auth.uid() is null then
    return new;
  end if;
  if new.lat is null or new.lng is null then
    new.lat := null;
    new.lng := null;
    new.accuracy := null;
    new.located_at := null;
  elsif new.lat is distinct from old.lat
    or new.lng is distinct from old.lng
    or new.accuracy is distinct from old.accuracy
    or new.located_at is distinct from old.located_at then
    new.located_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.members_stamp_location() from public, anon, authenticated;

create trigger members_stamp_location
  before update on public.members
  for each row execute function public.members_stamp_location();

-- Rydder også tider i fremtiden, som kan ligge fra før denne migration.
create or replace function public.clear_old_positions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.members
  set lat = null, lng = null, accuracy = null, located_at = null
  where located_at < now() - interval '6 hours'
     or located_at > now() + interval '10 minutes'
     or (located_at is null and (lat is not null or lng is not null or accuracy is not null));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.clear_old_positions() from public, anon, authenticated;

-- Hvert kvarter i stedet for hver time, så en position højst står 6 timer og et kvarter.
select cron.schedule('pub-crawl-clear-positions', '*/15 * * * *', 'select public.clear_old_positions()');

-- ---------------------------------------------------------------------------------------------
-- 7. Udfordringer har en afsender, et loft og kan slettes.
--
-- Rækker fra før denne migration har ingen afsender (null).
-- ---------------------------------------------------------------------------------------------

alter table public.challenges add column created_by uuid default auth.uid();
create index challenges_created_by_idx on public.challenges (crawl_id, created_by);

-- Kun de felter, klienten selv kender. id, created_by og created_at sætter databasen.
revoke insert on public.challenges from authenticated;
grant insert (crawl_id, stop_id, text, target_user_id) on public.challenges to authenticated;
grant delete on public.challenges to authenticated;

drop policy challenges_insert on public.challenges;
create policy challenges_insert on public.challenges for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_member(crawl_id)
    and (
      target_user_id is null
      or exists (
        select 1 from public.members m
        where m.crawl_id = challenges.crawl_id and m.user_id = challenges.target_user_id
      )
    )
  );

-- Den, der trak udfordringen, og arrangøren kan slette den. Stemmerne går med (cascade).
create policy challenges_delete on public.challenges for delete to authenticated
  using (
    public.is_member(crawl_id)
    and (
      created_by = (select auth.uid())
      or exists (select 1 from public.crawls c where c.id = challenges.crawl_id and c.created_by = (select auth.uid()))
    )
  );

-- Højst 300 udfordringer pr. tur. Låsen gør, at samtidige indsættelser ikke kan snyde tællingen.
create function public.challenges_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('challenges:' || new.crawl_id::text, 0));
  if (select count(*) from public.challenges where crawl_id = new.crawl_id) >= 300 then
    raise exception 'too_many_challenges';
  end if;
  return new;
end;
$$;

revoke execute on function public.challenges_before_insert() from public, anon, authenticated;

create trigger challenges_before_insert
  before insert on public.challenges
  for each row execute function public.challenges_before_insert();
