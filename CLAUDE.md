# Pub Crawl

En webapp til Lukas og vennerne til J-dag fredag den 6. november 2026. Next.js 16 (App Router, `cacheComponents`), Supabase (anonyme brugere, RLS, Realtime), Leaflet. Se @AGENTS.md, før du skriver Next.js-kode.

## Kommandoer

`pnpm dev`, `pnpm build`, `pnpm lint`, `npx tsc --noEmit` (kør `npx next typegen` først, hvis `PageProps`/`LayoutProps` mangler).

## Sprog og tone

- Al tekst i appen er dansk. Tonen er "en ven med planen": kort, varm, lidt pubceremoni ("omgang", "sidste omgang", "drik op", "én til her", "holdet"). Aldrig corporate, aldrig nuttet.
- Linjer under ca. 12 ord, for de læses efter et par øl.
- Tider skrives 24-timers med kolon (21:15). "·" er skilletegn.
- Ingen emojis nogen steder. Ikoner er Lucide.

## Designsystem ("Last Orders")

- Regler: `src/design/README.md`. Tokens og `pc-*`-klasser: `src/design/pub-crawl.css`. React-komponenter: `src/components/ds` (Button, IconButton, Badge, Card, Input, Switch, Avatar, StopCard, Tabs, TabBar, Dialog, Toast, Logo, Header, SectionTitle, Spinner).
- Brug komponenterne og tokens (`var(--green-800)`, Tailwind-klasser som `bg-cream-100`, `text-oxblood-700`) frem for rå hex og nye farver.
- `Icon` tager et navn fra listen i `ds/icon.tsx` eller en Lucide-komponent direkte. Nye funktioner sender komponenten (`<Icon name={Dices} />`, `icon={Dices}`) og retter ikke i listen.
- Bevægelse: kun fade og 10px løft på 140–220 ms (`pc-enter`, `pc-fade-in`, `pc-pop`, `pc-grow` i `globals.css`). Ingen bounce. Spinneren er den eneste løkke. `prefers-reduced-motion` respekteres globalt.
- Bekræftelser og tekstfelter går gennem `useAsk()` (`confirm`, `prompt`, `toast`) i `src/components/ask.tsx`, aldrig `window.confirm`/`prompt`.

## Arkitektur

- `src/components/crawl-app.tsx`: faner (Nu, Ruten, Stillingen, Holdet), header og `useActions` (alle skrivninger til turens kernetabeller).
- `src/lib/use-crawl.ts`: henter `crawls`, `members`, `stops` og `drinks` og holder dem opdateret med Realtime.
- Nye funktioner med egne tabeller laver deres egen hook i en ny fil med egen Realtime-kanal (`supabase.channel(\`<navn>:${crawlId}\`)`) og egne typer i en ny fil. Ret ikke i `use-crawl.ts` og `lib/types.ts`, medmindre det er nødvendigt.
- Next bevarer sider med React `<Activity>`. Effekter ryddes op og køres igen, når man vender tilbage. Alt, der opretter noget imperativt (kort, watchers, kanaler), skal oprette i effekten og rydde op i dens cleanup.
- Kortet (`map-view.tsx`) styrer Leaflet direkte, ikke react-leaflet.

## Database

- Supabase-projektet hedder `pub-crawl` (ref `ntfggmusstnjftucsdss`). Migrationer ligger i `supabase/migrations` med fortløbende numre.
- Alle tabeller har RLS. Medlemskab tjekkes med `public.is_member(crawl_id)`. Skrivninger, der kræver særlige regler, går gennem `security definer`-funktioner med `set search_path = public` (eller `''`), og `execute` gives kun til `authenticated`.
- `crawls` har kolonnevise update-rettigheder. Nye kolonner, som klienten må opdatere, skal have deres egen `grant update (...)`.
- Nye tabeller, der skal opdateres live, tilføjes til `supabase_realtime`.
- Kør Supabases sikkerhedstjek (`get_advisors`), efter at en migration er kørt.

## Test i browserpanelet

Når browserpanelet er skjult, fryser `requestAnimationFrame`. Så viser React aldrig Suspense-indholdet, og siden ser ud til at hænge på "Henter turen". Tag et skærmbillede for at tvinge en ramme frem. Next blokerer 127.0.0.1 i dev, så brug localhost.
