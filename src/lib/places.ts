import type { LatLng, NearbyPlace } from "./types";

export type Bounds = { south: number; west: number; north: number; east: number };

type NominatimRow = {
  place_id: number;
  name: string;
  display_name: string;
  lat: string;
  lon: string;
  category?: string;
  type: string;
};

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const BAR_TYPES = new Set(["pub", "bar", "biergarten", "nightclub"]);

// OpenStreetMaps typer er engelske. Dem, man møder på en pubtur, får et dansk navn.
const KIND_LABELS: Record<string, string> = {
  pub: "Pub",
  bar: "Bar",
  nightclub: "Natklub",
  biergarten: "Ølhave",
  restaurant: "Restaurant",
  cafe: "Café",
  fast_food: "Fastfood",
  hotel: "Hotel",
  house: "Adresse",
  building: "Adresse",
  apartments: "Adresse",
  yes: "Adresse",
};

function addressParts(displayName: string) {
  return displayName
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

// Adresser har intet navn, og display_name starter med husnummeret ("3, Vesterbrogade, ...").
export function placeName(r: Pick<NominatimRow, "name" | "display_name">) {
  if (r.name) return r.name;
  const [first = "", second] = addressParts(r.display_name);
  return /^\d+\s?[a-zæøå]?$/i.test(first) && second ? `${second} ${first}` : first;
}

// Typen på dansk, ellers et kort sted (gade og bydel) fra display_name i stedet for et engelsk ord.
export function placeKind(r: Pick<NominatimRow, "name" | "display_name" | "type">) {
  const label = KIND_LABELS[r.type];
  if (label) return label;
  const parts = addressParts(r.display_name);
  // Det første led er navnet (eller husnummeret), så stedet står bagefter.
  const rest = parts.slice(/^\d/.test(parts[0] ?? "") ? 2 : 1, 3);
  return rest.join(", ") || "Sted";
}

function toPlace(r: NominatimRow): NearbyPlace {
  return {
    id: `n${r.place_id}`,
    name: placeName(r),
    lat: Number(r.lat),
    lng: Number(r.lon),
    kind: placeKind(r),
  };
}

function viewbox(b: Bounds) {
  return `${b.west},${b.north},${b.east},${b.south}`;
}

export function boundsAround(at: LatLng, d = 0.08): Bounds {
  return { south: at.lat - d, north: at.lat + d, west: at.lng - d, east: at.lng + d };
}

// Søgning i OpenStreetMap via Nominatim. Kun ved tryk på Søg, ikke mens man skriver (deres regler).
export async function searchPlaces(query: string, near: Bounds): Promise<NearbyPlace[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "8",
    countrycodes: "dk",
    "accept-language": "da",
    viewbox: viewbox(near),
  });
  const res = await fetch(`${NOMINATIM}?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("search_failed");
  return ((await res.json()) as NominatimRow[]).map(toPlace);
}

// Nominatim tillader én forespørgsel i sekundet.
const NOMINATIM_GAP_MS = 1_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Pubs og barer i kortudsnittet. Nominatim først, fordi Overpass ofte er overbelastet.
export async function nearbyBars(bounds: Bounds): Promise<NearbyPlace[]> {
  const found = new Map<string, NearbyPlace>();
  // Hver for sig og med et sekund imellem. Fejler den ene, bruges det, den anden fandt.
  for (const [i, q] of ["pub", "bar"].entries()) {
    if (i > 0) await wait(NOMINATIM_GAP_MS);
    try {
      const params = new URLSearchParams({
        q,
        format: "jsonv2",
        limit: "40",
        bounded: "1",
        viewbox: viewbox(bounds),
        "accept-language": "da",
      });
      const res = await fetch(`${NOMINATIM}?${params}`, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error("nominatim_failed");
      for (const row of (await res.json()) as NominatimRow[]) {
        if (row.category && row.category !== "amenity") continue;
        if (!BAR_TYPES.has(row.type) || !row.name) continue;
        found.set(`${row.name}|${Number(row.lat).toFixed(4)}`, toPlace(row));
      }
    } catch {
      // Den anden søgning eller Overpass tager over.
    }
  }
  if (found.size) return [...found.values()];
  return overpassBars(bounds);
}

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// Spørger alle Overpass-servere på én gang og bruger det første svar.
async function overpassBars(b: Bounds): Promise<NearbyPlace[]> {
  const query = `[out:json][timeout:15];
nwr["amenity"~"^(pub|bar|biergarten)$"]["name"](${b.south},${b.west},${b.north},${b.east});
out center 60;`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const json = await Promise.any(
      OVERPASS.map(async (url) => {
        const res = await fetch(url, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`overpass_${res.status}`);
        return (await res.json()) as {
          elements: {
            type: string;
            id: number;
            lat?: number;
            lon?: number;
            center?: { lat: number; lon: number };
            tags?: Record<string, string>;
          }[];
        };
      }),
    );
    return json.elements
      .map((el) => ({
        id: `${el.type}${el.id}`,
        name: el.tags?.name ?? "Bar",
        lat: el.lat ?? el.center?.lat ?? 0,
        lng: el.lon ?? el.center?.lon ?? 0,
        kind: KIND_LABELS[el.tags?.amenity ?? "bar"] ?? "Bar",
      }))
      .filter((p) => p.lat !== 0);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
