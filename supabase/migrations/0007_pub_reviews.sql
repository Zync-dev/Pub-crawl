-- Stjerner og billeder: hver deltager giver pubberne 1-5 stjerner og tager billeder undervejs.
-- Billederne ligger i en privat bucket. Kun holdet kan se dem, og man kan kun slette sine egne.

-- Stjerner

create table public.stop_ratings (
  stop_id uuid not null,
  crawl_id uuid not null,
  user_id uuid not null default auth.uid(),
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (stop_id, user_id),
  foreign key (stop_id, crawl_id) references public.stops (id, crawl_id) on delete cascade,
  foreign key (crawl_id, user_id) references public.members (crawl_id, user_id) on delete cascade
);
create index stop_ratings_stop_idx on public.stop_ratings (stop_id, crawl_id);
create index stop_ratings_member_idx on public.stop_ratings (crawl_id, user_id);

create function public.stop_ratings_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger stop_ratings_touch
  before update on public.stop_ratings
  for each row execute function public.stop_ratings_touch();

-- Sætter eller ændrer ens egen stjerne. Kører som brugeren selv, så RLS gælder.
create function public.rate_stop(p_stop uuid, p_stars int)
returns public.stop_ratings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s_crawl uuid;
  r public.stop_ratings;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'invalid_stars';
  end if;
  select crawl_id into s_crawl from public.stops where id = p_stop;
  if not found then
    raise exception 'stop_not_found';
  end if;
  insert into public.stop_ratings (stop_id, crawl_id, user_id, stars)
  values (p_stop, s_crawl, auth.uid(), p_stars)
  on conflict (stop_id, user_id) do update set stars = excluded.stars
  returning * into r;
  return r;
end;
$$;

revoke execute on function public.stop_ratings_touch() from public, anon, authenticated;
revoke execute on function public.rate_stop(uuid, int) from public, anon;
grant execute on function public.rate_stop(uuid, int) to authenticated;

alter table public.stop_ratings enable row level security;
revoke all on public.stop_ratings from anon, authenticated;
grant select, insert, delete on public.stop_ratings to authenticated;
grant update (stars) on public.stop_ratings to authenticated;

create policy stop_ratings_select on public.stop_ratings for select to authenticated
  using (public.is_member(crawl_id));
create policy stop_ratings_insert on public.stop_ratings for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(crawl_id));
create policy stop_ratings_update on public.stop_ratings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_member(crawl_id));
create policy stop_ratings_delete on public.stop_ratings for delete to authenticated
  using (user_id = (select auth.uid()));

-- Billeder: filen ligger i storage under {crawl_id}/{stop_id eller "ude"}/{id}.jpg, rækken her peger på den.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 4194304, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Første mappe i stien er turens id. Tjekker formatet før castet, så skæve stier bare afvises.
create function public.photo_path_member(p_name text)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  folder text := split_part(p_name, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_member(folder::uuid);
end;
$$;

revoke execute on function public.photo_path_member(text) from public, anon;
grant execute on function public.photo_path_member(text) to authenticated;

create policy pub_reviews_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.photo_path_member(name));
create policy pub_reviews_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|ude)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$'
    and public.photo_path_member(name)
  );
create policy pub_reviews_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and owner_id = (select auth.uid())::text);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null,
  stop_id uuid,
  user_id uuid not null default auth.uid(),
  path text not null unique check (split_part(path, '/', 1) = crawl_id::text),
  width integer check (width between 1 and 10000),
  height integer check (height between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key (crawl_id, user_id) references public.members (crawl_id, user_id) on delete cascade,
  foreign key (stop_id, crawl_id) references public.stops (id, crawl_id) on delete set null (stop_id)
);
create index photos_crawl_idx on public.photos (crawl_id, created_at);
create index photos_member_idx on public.photos (crawl_id, user_id);
create index photos_stop_idx on public.photos (stop_id, crawl_id);

alter table public.photos enable row level security;
revoke all on public.photos from anon, authenticated;
grant select, insert, delete on public.photos to authenticated;

create policy photos_select on public.photos for select to authenticated
  using (public.is_member(crawl_id));
-- Rækken må kun pege på en fil, man selv har lagt op.
create policy photos_insert on public.photos for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_member(crawl_id)
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'photos' and o.name = photos.path and o.owner_id = (select auth.uid())::text
    )
  );
create policy photos_delete on public.photos for delete to authenticated
  using (user_id = (select auth.uid()));

-- Live-opdateringer

alter publication supabase_realtime add table public.stop_ratings, public.photos;
