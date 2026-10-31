-- Rettelser fra gennemgangen af offline, push og fejlrapporter.
--
-- 1. Beskeder til holdet skrives nu af databasen (crew_push). Før kunne alle på holdet sende en hvilken som
--    helst titel og tekst, fx en falsk "Holdet går videre til …", også når ruten var låst. Nu siger appen kun,
--    hvad der er sket (kind og key), og databasen tjekker, at det faktisk er sket:
--      timer     tiden ved den nuværende pub er gået (key = pub:deadline i ms), og højst 15 minutter siden
--      move      holdet har lige forladt pubben i key (pub:ankomst i ms)
--      rollcall  et åbent opråb, som afsenderen selv har startet (key = opråbets id)
--      round     en omgang, som afsenderen selv har lagt ind for under to minutter siden (key = omgangens id)
--    Der er et loft på 20 beskeder i minuttet pr. tur og 6 pr. afsender, talt én ad gangen, så samtidige
--    kald ikke kan snyde tællingen. push_targets kan ikke længere kaldes direkte, så ingen kan bruge en
--    nøgle til en kommende besked op på forhånd.
-- 2. Fejlrapporter: et samlet loft på 2000 i timen, og rapporter ældre end 14 dage slettes hver nat.

create function public.crew_push(p_crawl uuid, p_kind text, p_key text)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_crawl public.crawls;
  v_stop public.stops;
  v_next public.stops;
  v_deadline timestamptz;
  v_title text;
  v_body text := '';
  v_name text;
  v_inserted int;
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_member(p_crawl) then
    raise exception 'not_member';
  end if;
  if p_kind is null or p_key is null or char_length(p_key) not between 1 and 200 then
    raise exception 'invalid_notification';
  end if;
  select * into v_crawl from public.crawls c where c.id = p_crawl;
  if not found then
    raise exception 'not_member';
  end if;

  if p_kind = 'timer' then
    select * into v_stop from public.stops s where s.id = v_crawl.current_stop_id and s.crawl_id = p_crawl;
    if not found or v_crawl.arrived_at is null then
      raise exception 'invalid_notification';
    end if;
    v_deadline := v_crawl.arrived_at + make_interval(mins => v_stop.minutes);
    if p_key <> v_stop.id::text || ':' || floor(extract(epoch from v_deadline) * 1000)::bigint::text then
      raise exception 'invalid_notification';
    end if;
    -- Lidt slæk, fordi telefonernes ure ikke går helt ens. Appen prøver igen ved not_due.
    if now() < v_deadline - interval '30 seconds' then
      raise exception 'not_due';
    end if;
    if now() > v_deadline + interval '15 minutes' then
      raise exception 'invalid_notification';
    end if;
    v_title := 'Sidste omgang på ' || v_stop.name;
    v_body := 'Tiden er gået. Drik op, så går vi videre.';

  elsif p_kind = 'move' then
    if p_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]{1,16}$' then
      raise exception 'invalid_notification';
    end if;
    select * into v_stop from public.stops s
    where s.id = split_part(p_key, ':', 1)::uuid and s.crawl_id = p_crawl and s.visited_at is not null;
    -- Holdet skal have forladt pubben, og det skal være den seneste, de har været på. En pub, holdet
    -- lige er tjekket ind på (hvis nogen nåede det, før beskeden blev sendt), tæller ikke med.
    if not found or v_crawl.current_stop_id is not distinct from v_stop.id then
      raise exception 'invalid_notification';
    end if;
    if exists (
      select 1 from public.stops s
      where s.crawl_id = p_crawl
        and s.id <> v_stop.id
        and s.id is distinct from v_crawl.current_stop_id
        and s.visited_at > v_stop.visited_at
    ) then
      raise exception 'invalid_notification';
    end if;
    -- Næste pub er den første efter denne på ruten, som holdet ikke har været på (som i appen).
    select * into v_next from public.stops s
    where s.crawl_id = p_crawl
      and s.position > v_stop.position
      and (s.visited_at is null or s.id is not distinct from v_crawl.current_stop_id)
    order by s.position, s.created_at
    limit 1;
    if found then
      v_title := 'Holdet går videre til ' || v_next.name;
      v_body := 'Tjek ind, når du er der.';
    else
      v_title := 'Holdet går videre';
      v_body := 'Ruten er gået. ' || v_stop.name || ' var sidste pub.';
    end if;

  elsif p_kind = 'rollcall' then
    if p_key !~* c_uuid or not exists (
      select 1 from public.roll_calls r
      where r.id = p_key::uuid
        and r.crawl_id = p_crawl
        and r.started_by = v_uid
        and r.closed_at is null
        and r.created_at > now() - interval '20 minutes'
    ) then
      raise exception 'invalid_notification';
    end if;
    v_title := 'Er alle med?';
    v_body := 'Tryk Jeg er med, når du er med.';

  elsif p_kind = 'round' then
    if p_key !~* c_uuid then
      raise exception 'invalid_notification';
    end if;
    select m.name into v_name
    from public.rounds r
    join public.members m on m.crawl_id = r.crawl_id and m.user_id = r.buyer_id
    where r.id = p_key::uuid
      and r.crawl_id = p_crawl
      and r.created_by = v_uid
      and r.created_at > now() - interval '2 minutes';
    if not found then
      raise exception 'invalid_notification';
    end if;
    v_title := 'Omgangen er på ' || v_name;

  else
    raise exception 'invalid_notification';
  end if;

  -- Ét kald ad gangen pr. tur, så samtidige kald ikke kan snyde loftet.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('push:' || p_crawl::text, 0));
  if (
    select count(*) from public.notifications_sent n
    where n.crawl_id = p_crawl and n.created_at > now() - interval '1 minute'
  ) >= 20 or (
    select count(*) from public.notifications_sent n
    where n.crawl_id = p_crawl and n.sent_by = v_uid and n.created_at > now() - interval '1 minute'
  ) >= 6 then
    raise exception 'rate_limited';
  end if;

  insert into public.notifications_sent (crawl_id, kind, key, sent_by)
  values (p_crawl, p_kind, p_key, v_uid)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return;
  end if;

  -- Den, der sender, får ikke sin egen besked, undtagen ved 'timer', som alle skal have.
  return query
    select s.endpoint, s.p256dh, s.auth, v_title, v_body, '/t/' || v_crawl.code
    from public.push_subscriptions s
    join public.members m on m.user_id = s.user_id and m.crawl_id = p_crawl
    where p_kind = 'timer' or s.user_id <> v_uid;
end;
$$;

revoke execute on function public.crew_push(uuid, text, text) from public, anon;
grant execute on function public.crew_push(uuid, text, text) to authenticated;

-- /api/push bruger nu crew_push. push_targets bliver kun kaldt indefra.
revoke execute on function public.push_targets(uuid, text, text) from authenticated;

-- Fejlrapporter: samme regler som i 0010 plus et samlet loft, så en strøm af nye anonyme brugere
-- ikke kan fylde databasen.
create or replace function public.client_errors_before_insert()
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
  select count(*) into recent
  from public.client_errors
  where created_at > now() - interval '1 hour';
  if recent >= 2000 then
    raise exception 'too_many_errors';
  end if;
  return new;
end;
$$;

revoke execute on function public.client_errors_before_insert() from public, anon, authenticated;

create function public.purge_old_client_errors()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.client_errors where created_at < now() - interval '14 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Kun cron (postgres) kører den.
revoke execute on function public.purge_old_client_errors() from public, anon, authenticated;

select cron.schedule('pub-crawl-purge-client-errors', '43 4 * * *', 'select public.purge_old_client_errors()');
