-- Aftenens regnskab: hvornår holdet gik fra hver pub.
-- Ankomsten står allerede i stops.visited_at. Afgangen skrives her af databasen selv,
-- når crawls.current_stop_id skifter (Videre, Fortryd eller Tjek ind et nyt sted).
-- Klienten får ingen update-ret på kolonnen, og intet eksisterende ændres.

alter table public.stops add column if not exists left_at timestamptz;

comment on column public.stops.left_at is
  'Hvornår holdet gik fra pubben. Sættes af crawls_recap_track_departure. Null, mens I er der eller ikke er gået endnu.';

create or replace function public.recap_track_departure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Regnskabet må aldrig stå i vejen for Videre, så fejl her slugeres.
  begin
    -- Den pub, holdet forlader, får sin afgangstid.
    if old.current_stop_id is not null then
      update public.stops
      set left_at = now()
      where id = old.current_stop_id and crawl_id = new.id;
    end if;
    -- Den pub, holdet (igen) er på, har ingen afgang endnu, fx efter Fortryd på Videre.
    if new.current_stop_id is not null then
      update public.stops
      set left_at = null
      where id = new.current_stop_id and crawl_id = new.id and left_at is not null;
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke execute on function public.recap_track_departure() from public, anon, authenticated;

drop trigger if exists crawls_recap_track_departure on public.crawls;
create trigger crawls_recap_track_departure
  after update of current_stop_id on public.crawls
  for each row
  when (old.current_stop_id is distinct from new.current_stop_id)
  execute function public.recap_track_departure();
