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

function toPlace(r: NominatimRow): NearbyPlace {
  return {
    id: `n${r.place_id}`,
    name: r.name || r.display_name.split(",")[0],
    lat: Number(r.lat),
    lng: Number(r.lon),
    kind: r.type,
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

// Pubs og barer i kortudsnittet. Nominatim først, fordi Overpass ofte er overbelastet.
export async function nearbyBars(bounds: Bounds): Promise<NearbyPlace[]> {
  try {
    const found = new Map<string, NearbyPlace>();
    // Hver for sig, så vi holder os under én forespørgsel i sekundet.
    for (const q of ["pub", "bar"]) {
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
    }
    if (found.size) return [...found.values()];
  } catch {
    // Så prøver vi Overpass.
  }
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
        kind: el.tags?.amenity ?? "bar",
      }))
      .filter((p) => p.lat !== 0);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
