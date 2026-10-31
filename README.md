# Pub-crawl

En lille app til mig og mine venner til J-dag fredag den 6. november 2026. Den skal hjælpe os med at følge ruten og holde styr på aftenen.

## Funktioner

1. **Rute på kort**: alle pubs på et kort som en rute, vi kan gå efter. Vi kan selv tilføje, fjerne og flytte pubs undervejs.
2. **Statistik**: hvor meget og hvad hver af os har drukket.
3. **Venner**: vi kan tilføje hinanden og se hinandens statistik.
4. **Live-position** (hvis muligt): se på kortet, hvor de andre er.
5. **Timer pr. pub**: starter, når vi ankommer, så vi ikke bliver hængende for længe samme sted.
6. **Aktiviteter**: et lille spil, der giver os en opgave, når vi kommer til en ny pub.

## Forslag til teknik

Ikke besluttet endnu.

- **Webapp (PWA)** frem for en app i App Store/Google Play. Vennerne åbner bare et link og kan lægge den på hjemmeskærmen. Der er ingen review eller builds at vente på.
- **Next.js** på Vercel.
- **Supabase** til konti, venner, ruter, drinks og live-positioner (Realtime).
- **Leaflet + OpenStreetMap** til kortet (gratis).

Bemærk: en webapp kan kun dele positionen, mens den er åben. På iPhone stopper det, når skærmen slukker eller appen ligger i baggrunden.

## Kom i gang

_Kommer, når projektet er sat op._
