# Pub-crawl

En lille app til mig og mine venner til J-dag fredag den 6. november 2026. Den skal hjælpe os med at følge ruten og holde styr på aftenen.

## Funktioner

1. **Rute på kort**: alle pubs på et kort som en rute, vi kan gå efter. Vi kan selv tilføje, fjerne og flytte pubs undervejs. "Pubs her" finder pubs og barer omkring kortet (OpenStreetMap), og man kan søge eller sætte en pub selv.
2. **Statistik**: hvor meget og hvad hver af os har drukket, i genstande, pr. drik og pr. pub.
3. **Holdet**: man starter en tur og deler et link eller en kode på 6 tegn. Alle på turen kan se hinandens drinks.
4. **Live-position**: man kan selv slå deling til. Kun dem på turen kan se den, og den slettes, når man slår det fra.
5. **Timer pr. pub**: starter, når I trykker "Vi er her". Den kan forlænges med 10 minutter og vibrerer, når tiden er gået.
6. **Udfordringer**: en tilfældig opgave, hver gang I ankommer til en pub.

## Teknik

- **Next.js 16** som webapp. Vennerne åbner et link og kan lægge den på hjemmeskærmen.
- **Supabase** med anonyme brugere, Row Level Security og Realtime, så alle ser ændringer med det samme.
- **Leaflet** med kort fra OpenStreetMap og CARTO.

Bemærk: en webapp kan kun dele positionen, mens den er åben. På iPhone stopper det, når skærmen slukker eller appen ligger i baggrunden.

## Kom i gang

1. Opret et Supabase-projekt, og kør `supabase/migrations/0001_init.sql` i SQL Editor.
2. Slå anonyme logins til under **Authentication → Sign In / Providers → Allow anonymous sign-ins**.
3. Lav `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<projekt>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

4. `pnpm install` og `pnpm dev`.
