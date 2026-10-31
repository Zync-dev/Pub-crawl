-- Rettelser fra gennemgangen af omgange og spil.
--
-- 1. give_round: to telefoner, der trykker "Jonas giver" samtidig, skrev to omgange. Nu skriver
--    funktionen kun én, hvis den samme har fået en omgang inden for det sidste minut, og giver den
--    eksisterende tilbage (existed = true). Appen spørger så "En til?" og kalder med p_force.
-- 2. Spilresultaterne (terninger, mønt, "Hvem skal …?") går over den private broadcast-kanal
--    game-results:<crawl_id>. Kun holdet må lytte og sende. Før kunne alle med den offentlige nøgle
--    og turens id læse med og sende falske resultater på den offentlige kanal games:<crawl_id>.

-- 1. Omgange uden dobbelte

create function public.give_round(p_crawl uuid, p_buyer uuid, p_stop uuid default null, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rounds;
begin
  if auth.uid() is null or not public.is_member(p_crawl) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  -- To samtidige kald for den samme giver venter på hinanden, så det andet ser det første.
  perform pg_advisory_xact_lock(hashtextextended('give_round:' || p_crawl::text || ':' || p_buyer::text, 0));
  if not coalesce(p_force, false) then
    select * into r
    from public.rounds
    where crawl_id = p_crawl
      and buyer_id = p_buyer
      and created_at > now() - interval '60 seconds'
    order by created_at desc
    limit 1;
    if found then
      return jsonb_build_object('round', to_jsonb(r), 'existed', true);
    end if;
  end if;
  -- Giveren skal være på holdet, og pubben skal høre til turen. Det sikrer fremmednøglerne.
  insert into public.rounds (crawl_id, stop_id, buyer_id, created_by)
  values (p_crawl, p_stop, p_buyer, auth.uid())
  returning * into r;
  return jsonb_build_object('round', to_jsonb(r), 'existed', false);
end;
$$;

revoke execute on function public.give_round(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.give_round(uuid, uuid, uuid, boolean) to authenticated;

-- 2. Privat kanal til spilresultater

-- Er emnet "<prefix>:<crawl_id>", og er man på den tur? Id'et tjekkes, før det laves om til uuid.
create function public.crawl_topic_member(p_topic text, p_prefix text)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_id text := split_part(p_topic, ':', 2);
begin
  if p_topic is null or p_topic <> p_prefix || ':' || v_id then
    return false;
  end if;
  if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_member(v_id::uuid);
end;
$$;

revoke execute on function public.crawl_topic_member(text, text) from public, anon;
grant execute on function public.crawl_topic_member(text, text) to authenticated;

create policy game_results_select on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.crawl_topic_member((select realtime.topic()), 'game-results')
  );

create policy game_results_insert on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.crawl_topic_member((select realtime.topic()), 'game-results')
  );
