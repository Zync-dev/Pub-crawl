-- Pub-crawl: ture, deltagere, pubs på ruten og drinks.
-- Alle logger ind anonymt (Supabase anonymous sign-ins) og ser kun de ture, de er med i.

create table public.crawls (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  name text not null check (char_length(name) between 1 and 40),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  current_stop_id uuid,
  arrived_at timestamptz,
  challenge text check (char_length(challenge) <= 300),
  created_at timestamptz not null default now()
);

create table public.members (
  crawl_id uuid not null references public.crawls on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  color smallint not null default 0 check (color between 0 and 9),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy real,
  located_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (crawl_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references public.crawls on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  position integer not null default 0,
  minutes smallint not null default 30 check (minutes between 5 and 240),
  visited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, crawl_id)
);
create index stops_crawl_idx on public.stops (crawl_id, position);

alter table public.crawls
  add constraint crawls_current_stop_fk
  foreign key (current_stop_id, id) references public.stops (id, crawl_id)
  on delete set null (current_stop_id);

create table public.drinks (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null,
  user_id uuid not null default auth.uid(),
  stop_id uuid,
  kind text not null check (kind in ('beer', 'draft', 'jbeer', 'cider', 'wine', 'drink', 'shot', 'water')),
  units numeric(3, 1) not null check (units between 0 and 5),
  created_at timestamptz not null default now(),
  foreign key (crawl_id, user_id) references public.members (crawl_id, user_id) on delete cascade,
  foreign key (stop_id, crawl_id) references public.stops (id, crawl_id) on delete set null (stop_id)
);
create index drinks_crawl_idx on public.drinks (crawl_id, created_at);

-- Medlemskab

create function public.is_member(p_crawl uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members where crawl_id = p_crawl and user_id = auth.uid()
  );
$$;

create function public.new_crawl_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create function public.create_crawl(p_name text, p_member_name text)
returns public.crawls
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.crawls;
  tries int := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if (select count(*) from public.crawls where created_by = auth.uid()) >= 20 then
    raise exception 'too_many_crawls';
  end if;
  loop
    begin
      insert into public.crawls (code, name, created_by)
      values (public.new_crawl_code(), trim(p_name), auth.uid())
      returning * into c;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then
        raise;
      end if;
    end;
  end loop;
  insert into public.members (crawl_id, user_id, name, color)
  values (c.id, auth.uid(), trim(p_member_name), 0);
  return c;
end;
$$;

create function public.join_crawl(p_code text, p_member_name text)
returns public.crawls
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.crawls;
  member_count int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into c from public.crawls where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'crawl_not_found';
  end if;
  select count(*) into member_count from public.members where crawl_id = c.id;
  if member_count >= 30 and not public.is_member(c.id) then
    raise exception 'crawl_full';
  end if;
  insert into public.members (crawl_id, user_id, name, color)
  values (c.id, auth.uid(), trim(p_member_name), member_count % 10)
  on conflict (crawl_id, user_id) do update set name = excluded.name;
  return c;
end;
$$;

-- Viser kun navnet og antallet af deltagere, så invitationen kan sige, hvad man siger ja til.
create function public.crawl_preview(p_code text)
returns table (name text, member_count int)
language sql
stable
security definer
set search_path = public
as $$
  select c.name, (select count(*)::int from public.members m where m.crawl_id = c.id)
  from public.crawls c
  where c.code = upper(trim(p_code));
$$;

revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.new_crawl_code() from public, anon, authenticated;
revoke execute on function public.create_crawl(text, text) from public, anon;
revoke execute on function public.join_crawl(text, text) from public, anon;
revoke execute on function public.crawl_preview(text) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.create_crawl(text, text) to authenticated;
grant execute on function public.join_crawl(text, text) to authenticated;
grant execute on function public.crawl_preview(text) to authenticated;

-- Rettigheder

alter table public.crawls enable row level security;
alter table public.members enable row level security;
alter table public.stops enable row level security;
alter table public.drinks enable row level security;

revoke all on public.crawls, public.members, public.stops, public.drinks from anon, authenticated;

grant select on public.crawls to authenticated;
grant update (name, current_stop_id, arrived_at, challenge) on public.crawls to authenticated;
create policy crawls_select on public.crawls for select to authenticated
  using (public.is_member(id));
create policy crawls_update on public.crawls for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

grant select, delete on public.members to authenticated;
grant update (name, lat, lng, accuracy, located_at) on public.members to authenticated;
create policy members_select on public.members for select to authenticated
  using (public.is_member(crawl_id));
create policy members_update on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_delete on public.members for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.stops to authenticated;
grant update (name, lat, lng, position, minutes, visited_at) on public.stops to authenticated;
create policy stops_select on public.stops for select to authenticated
  using (public.is_member(crawl_id));
create policy stops_insert on public.stops for insert to authenticated
  with check (public.is_member(crawl_id));
create policy stops_update on public.stops for update to authenticated
  using (public.is_member(crawl_id)) with check (public.is_member(crawl_id));
create policy stops_delete on public.stops for delete to authenticated
  using (public.is_member(crawl_id));

grant select, insert, delete on public.drinks to authenticated;
create policy drinks_select on public.drinks for select to authenticated
  using (public.is_member(crawl_id));
create policy drinks_insert on public.drinks for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(crawl_id));
create policy drinks_delete on public.drinks for delete to authenticated
  using (user_id = auth.uid());

-- Live-opdateringer

alter publication supabase_realtime add table public.crawls, public.members, public.stops, public.drinks;
