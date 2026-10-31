# Pub-crawl

En lille app til mig og mine venner til J-dag fredag den 6. november 2026. Den skal hjælpe os med at følge ruten og holde styr på aftenen.

## Funktioner

1. **Rute på kort**: alle pubs på et kort som en rute, vi kan gå efter. Vi kan selv tilføje, fjerne og flytte pubs undervejs. "Pubs her" finder pubs og barer omkring kortet (OpenStreetMap), og man kan søge eller sætte en pub selv.
2. **Statistik**: hvor meget og hvad hver af os har drukket, i genstande, pr. drik og pr. pub.
3. **Holdet**: man starter en tur og deler et link eller en kode på 6 tegn. Alle på turen kan se hinandens drinks.
4. **Live-position**: man kan selv slå deling til. Kun dem på turen kan se den, og den slettes, når man slår det fra.
5. **Timer pr. pub**: starter, når I trykker "Tjek ind". Den kan forlænges med 10 minutter og vibrerer, når tiden er gået.
6. **Udfordringer**: en tilfældig opgave, hver gang I ankommer til en pub.

## Teknik

- **Next.js 16** som webapp. Vennerne åbner et link og kan lægge den på hjemmeskærmen.
- **Supabase** med anonyme brugere, Row Level Security og Realtime, så alle ser ændringer med det samme.
- **Leaflet** med kort fra OpenStreetMap.
- **Design:** Pub Crawl Design System ("Last Orders": racing-grøn, bladguld, dobbelte guldstreger, DM Serif Display og Libre Franklin). Farver og komponentklasser ligger i `src/design/pub-crawl.css`, reglerne i `src/design/README.md`, og React-komponenterne i `src/components/ds`. Ikonerne er Lucide, og der bruges ingen emojis.

Bemærk: en webapp kan kun dele positionen, mens den er åben. På iPhone stopper det, når skærmen slukker eller appen ligger i baggrunden.

## Kom i gang

1. Opret et Supabase-projekt, og kør `supabase/migrations/0001_init.sql` i SQL Editor.
2. Slå anonyme logins til under **Authentication → Sign In / Providers → Allow anonymous sign-ins**.
3. Lav `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<projekt>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

4. Til push-beskeder: lav VAPID-nøgler med `npx web-push generate-vapid-keys --json`, og tilføj dem til `.env.local` (og til Vercel):

   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>
   VAPID_PRIVATE_KEY=<privateKey>
   VAPID_SUBJECT=mailto:<din mail>
   ```

   /api/push spørger databasen med Supabase-projektets hemmelige nøgle (Project Settings → API Keys → Secret keys), så ingen browser ser de andres push-nøgler. Tilføj den også:

   ```
   SUPABASE_SECRET_KEY=sb_secret_...
   ```

   De private nøgler må aldrig ligge i koden eller i en `NEXT_PUBLIC_`-variabel. Uden nøglerne virker appen som før, bare uden beskeder.

5. `pnpm install` og `pnpm dev`.

## Hjemmeskærm og beskeder

- `public/sw.js` er en service worker, der kun viser push-beskeder. Den gemmer ingen sider.
- Under Holdet → Indstillinger slår man "Giv besked på telefonen" til. På iPhone virker det først, når appen ligger på hjemmeskærmen (iOS 16.4 eller nyere).
- Beskeder sendes fra `POST /api/push` med brugerens egen adgangsnøgle. Databasefunktionen `push_targets` tjekker medlemskab og sørger for, at den samme besked kun sendes én gang (`notifications_sent`).

## Test

- `pnpm test` kører enhedstestene i `src/lib` med Vitest (statistik, afstande, timer, udfordringer, drinks, pub-søgning med en falsk `fetch`, navn og seneste ture med et falsk `localStorage`, fejlrapporteren). Ingen netværk.
- `pnpm test:db` tester rettighederne mod Supabase-projektet i `.env.local`. Den logger tre anonyme brugere ind, opretter en tur ved navn "Test db" og tjekker, at deltagere kan læse, men ikke slette eller skrive drinks på andre, at en udenforstående intet ser, og at `join_crawl` og `crawl_preview` opfører sig. Bagefter forlader den turen. Kræver netværk og anonyme logins, og hver kørsel bruger tre af Supabases anonyme logins. Push-funktionerne testes kun, når `SUPABASE_SECRET_KEY` står i `.env.local`.

## Fejl og besøgstal

- Fejl på telefonerne (fejlsiderne og uopfangede fejl) sendes til tabellen `client_errors` i produktion. Den kan kun læses i Supabase. Højst 30 rapporter pr. bruger i timen.
- Besøgstal kommer fra Vercel Analytics. Slå det til under projektets **Analytics** i Vercel.
