-- Push-beskeder til holdet: hvert apparats abonnement og en log, så den samme besked kun sendes én gang.
-- Beskederne sendes fra /api/push med web-push. Databasen afgør, hvem der skal have dem.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 12 and 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.notifications_sent (
  crawl_id uuid not null references public.crawls on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{1,20}$'),
  key text not null check (char_length(key) between 1 and 200),
  sent_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (crawl_id, kind, key)
);
create index notifications_sent_crawl_idx on public.notifications_sent (crawl_id, created_at);

alter table public.push_subscriptions enable row level security;
alter table public.notifications_sent enable row level security;
revoke all on public.push_subscriptions, public.notifications_sent from anon, authenticated;

-- Man ser og styrer kun sine egne apparater.
grant select, insert, delete on public.push_subscriptions to authenticated;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- Loggen skrives kun af push_targets. Holdet må læse den for sin egen tur.
grant select on public.notifications_sent to authenticated;
create policy notifications_sent_select on public.notifications_sent for select to authenticated
  using (public.is_member(crawl_id));

-- Gemmer apparatets abonnement. Et endpoint hører til den, der sidst slog beskeder til på apparatet,
-- så en ny anonym bruger på samme telefon overtager det i stedet for at fejle på unique.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
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
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
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

-- Registrerer beskeden og giver kun modtagerne tilbage, hvis den ikke er sendt før.
-- Den, der sender, får ikke sin egen besked, undtagen ved 'timer', som alle skal have.
create function public.push_targets(p_crawl uuid, p_kind text, p_key text)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_member(p_crawl) then
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
  values (p_crawl, p_kind, p_key, auth.uid())
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return;
  end if;

  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.members m on m.user_id = s.user_id and m.crawl_id = p_crawl
    where p_kind = 'timer' or s.user_id <> auth.uid();
end;
$$;

-- Fjerner endpoints, som push-tjenesten siger er døde (404/410).
-- Kun abonnementer hos medlemmer af en tur, man selv er med på.
create function public.drop_push_endpoints(p_crawl uuid, p_endpoints text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_member(p_crawl) then
    raise exception 'not_member';
  end if;
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

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
revoke execute on function public.push_targets(uuid, text, text) from public, anon;
revoke execute on function public.drop_push_endpoints(uuid, text[]) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.push_targets(uuid, text, text) to authenticated;
grant execute on function public.drop_push_endpoints(uuid, text[]) to authenticated;
