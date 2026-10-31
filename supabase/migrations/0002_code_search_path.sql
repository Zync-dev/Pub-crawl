-- Supabases sikkerhedstjek: funktionen skal have en fast search_path.
alter function public.new_crawl_code() set search_path = '';
