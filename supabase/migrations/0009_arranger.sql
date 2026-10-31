-- Arrangørens værktøjer: lås ruten, fjern en deltager, ny kode og giv rollen videre.
-- Arrangøren er crawls.created_by. Positioner slettes automatisk efter 6 timer.

-- Låst rute: kun arrangøren må tilføje, omdøbe, flytte, ændre minutter og slette pubs.
-- Alle kan stadig tjekke ind (stops.visited_at og turens current_stop_id/arrived_at/challenge).
alter table public.crawls add column if not exists route_locked boolean not null default false;

-- Kolonnen får ingen update-rettighed. Den ændres kun gennem set_route_locked.

create function public.guard_locked_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crawl uuid;
  v_locked boolean;
  v_owner uuid;
begin
  -- Service role, cron og SQL Editor har ingen bruger og må alt.
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    v_crawl := old.crawl_id;
  else
    v_crawl := new.crawl_id;
  end if;
  -- At tjekke ind ændrer kun visited_at, og det må alle.
  if tg_op = 'UPDATE'
    and new.crawl_id = old.crawl_id
    and new.name is not distinct from old.name
    and new.lat is not distinct from old.lat
    and new.lng is not distinct from old.lng
    and new.position is not distinct from old.position
    and new.minutes is not distinct from old.minutes then
    return new;
  end if;
  -- Findes turen ikke (fx når den slettes med cascade), er der intet at låse.
  select c.route_locked, c.created_by into v_locked, v_owner
  from public.crawls c where c.id = v_crawl;
  if coalesce(v_locked, false) and v_owner is distinct from auth.uid() then
    raise exception 'route_locked' using errcode = '42501', hint = 'Ruten er låst af arrangøren.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.guard_locked_route() from public, anon, authenticated;

create trigger stops_guard_locked_route
  before insert or update or delete on public.stops
  for each row execute function public.guard_locked_route();

-- Arrangørens funktioner. Alle tjekker, at den, der kalder, er arrangør på turen.

create function public.set_route_locked(p_crawl uuid, p_locked boolean)
returns public.crawls
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.crawls;
begin
  update public.crawls set route_locked = coalesce(p_locked, false)
  where id = p_crawl and created_by = auth.uid()
  returning * into c;
  if not found then
    raise exception 'not_arranger' using errcode = '42501';
  end if;
  return c;
end;
$$;

-- Fjerner en deltager. Deres drinks forsvinder med (cascade fra members).
create function public.remove_member(p_crawl uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.crawls where id = p_crawl and created_by = auth.uid() for update;
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
end;
$$;

-- Ny kode, så fjernede deltagere ikke kan hoppe med igen med den gamle.
create function public.rotate_code(p_crawl uuid)
returns public.crawls
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.crawls;
  tries int := 0;
begin
  perform 1 from public.crawls where id = p_crawl and created_by = auth.uid() for update;
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

-- Giver arrangørrollen videre til en anden på holdet.
create function public.transfer_arranger(p_crawl uuid, p_user uuid)
returns public.crawls
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.crawls;
begin
  perform 1 from public.crawls where id = p_crawl and created_by = auth.uid() for update;
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

revoke execute on function public.set_route_locked(uuid, boolean) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.rotate_code(uuid) from public, anon;
revoke execute on function public.transfer_arranger(uuid, uuid) from public, anon;
grant execute on function public.set_route_locked(uuid, boolean) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.rotate_code(uuid) to authenticated;
grant execute on function public.transfer_arranger(uuid, uuid) to authenticated;

-- Positioner slettes automatisk efter 6 timer.

create function public.clear_old_positions()
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
     or (located_at is null and (lat is not null or lng is not null or accuracy is not null));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Kun cron (postgres) kører den.
revoke execute on function public.clear_old_positions() from public, anon, authenticated;

-- Supabase Cron (pg_cron) installeres i pg_catalog ifølge Supabases vejledning.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('pub-crawl-clear-positions', '17 * * * *', 'select public.clear_old_positions()');
