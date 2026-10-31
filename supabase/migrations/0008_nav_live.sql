-- "Sent på den?": et offentligt live-link til turen, så nogen, der kommer senere, kan finde holdet.
-- Linket viser kun ruten, hvor holdet er nu, og hvor mange de er. Aldrig navne, positioner eller drinks.

-- 22 url-sikre tegn fra en tilfældig uuid (122 tilfældige bit). gen_random_uuid er indbygget, så
-- vi behøver ikke pgcrypto.
create function public.new_share_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(uuid_send(gen_random_uuid()), 'base64'), '='), '+/', '-_');
$$;

-- Standardværdien køres med den indsættendes rettigheder. Alle ture oprettes i dag via
-- create_crawl, men authenticated får lov, så en fremtidig indsættelse ikke fejler.
revoke execute on function public.new_share_token() from public, anon;
grant execute on function public.new_share_token() to authenticated;

-- En flygtig standardværdi beregnes for hver eksisterende række, så alle ture får hver sit link.
alter table public.crawls
  add column share_token text not null default public.new_share_token()
    constraint crawls_share_token_key unique
    constraint crawls_share_token_format check (share_token ~ '^[A-Za-z0-9_-]{22}$');

-- Medlemmer kan allerede læse hele rækken (grant select on crawls), og dermed linket.
-- Kolonnen får ingen update-rettighed. Et nyt link laves kun med rotate_share_token.

-- Det, siden /se/[token] må vise. Returnerer null, hvis linket ikke findes (eller er skiftet).
create function public.crawl_public(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', c.name,
    'current_stop_id', c.current_stop_id,
    'arrived_at', c.arrived_at,
    'member_count', (select count(*)::int from public.members m where m.crawl_id = c.id),
    'stops', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'lat', s.lat,
            'lng', s.lng,
            'position', s.position,
            'minutes', s.minutes,
            'visited_at', s.visited_at
          )
          order by s.position, s.created_at
        )
        from public.stops s
        where s.crawl_id = c.id
      ),
      '[]'::jsonb
    )
  )
  from public.crawls c
  where p_token ~ '^[A-Za-z0-9_-]{22}$' and c.share_token = p_token;
$$;

-- Kun arrangøren kan lave et nyt link. Det gamle holder op med at virke med det samme.
create function public.rotate_share_token(p_crawl uuid)
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
  where id = p_crawl and created_by = auth.uid()
  returning share_token into token;
  if token is null then
    raise exception 'not_creator';
  end if;
  return token;
end;
$$;

revoke execute on function public.crawl_public(text) from public;
revoke execute on function public.rotate_share_token(uuid) from public, anon;
grant execute on function public.crawl_public(text) to anon, authenticated;
grant execute on function public.rotate_share_token(uuid) to authenticated;
