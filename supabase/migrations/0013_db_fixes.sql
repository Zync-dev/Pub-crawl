-- Rettelser fundet af databasetestene (tests/db).
--
-- Når arrangøren forlader turen, stod turen tilbage med en arrangør, der ikke var på holdet:
-- en låst rute kunne aldrig låses op igen, ingen kunne lave ny kode eller nyt live-link, og den,
-- der var gået, kunne stadig låse ruten og fjerne folk. Nu går rollen videre til den, der har været
-- længst på holdet. Er der ingen tilbage, sker der ingenting.

create function public.hand_over_arranger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next uuid;
begin
  -- Kun når man selv går. Sletninger uden bruger (service role, cascade fra auth.users) røres ikke.
  if auth.uid() is null or auth.uid() is distinct from old.user_id then
    return old;
  end if;
  perform 1 from public.crawls c
  where c.id = old.crawl_id and c.created_by = old.user_id
  for update;
  if not found then
    return old;
  end if;
  select m.user_id into v_next
  from public.members m
  where m.crawl_id = old.crawl_id
  order by m.joined_at, m.user_id
  limit 1;
  if v_next is not null then
    update public.crawls set created_by = v_next
    where id = old.crawl_id and created_by = old.user_id;
  end if;
  return old;
end;
$$;

revoke execute on function public.hand_over_arranger() from public, anon, authenticated;

create trigger members_hand_over_arranger
  after delete on public.members
  for each row execute function public.hand_over_arranger();
