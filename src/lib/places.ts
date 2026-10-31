import type { LatLng, NearbyPlace } from "./types";

// Søgning i OpenStreetMap via Nominatim. Kun ved tryk på Søg, ikke mens man skriver (deres regler).
export async function searchPlaces(query: string, near: LatLng): Promise<NearbyPlace[]> {
  const d = 0.08;
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "8",
    countrycodes: "dk",
    "accept-language": "da",
    viewbox: `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`,
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error("search_failed");
  const rows = (await res.json()) as {
    place_id: number;
    name: string;
    display_name: string;
    lat: string;
    lon: string;
    type: string;
  }[];
  return rows.map((r) => ({
    id: `n${r.place_id}`,
    name: r.name || r.display_name.split(",")[0],
    lat: Number(r.lat),
    lng: Number(r.lon),
    kind: r.type,
  }));
}

// Pubs og barer omkring et punkt via Overpass.
export async function nearbyBars(at: LatLng, radius = 900): Promise<NearbyPlace[]> {
  const query = `[out:json][timeout:15];
nwr["amenity"~"^(pub|bar|biergarten)$"]["name"](around:${radius},${at.lat},${at.lng});
out center 60;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error("overpass_failed");
  const json = (await res.json()) as {
    elements: {
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }[];
  };
  return json.elements
    .map((el) => ({
      id: `${el.type}${el.id}`,
      name: el.tags?.name ?? "Bar",
      lat: el.lat ?? el.center?.lat ?? 0,
      lng: el.lon ?? el.center?.lon ?? 0,
      kind: el.tags?.amenity ?? "bar",
    }))
    .filter((p) => p.lat !== 0);
}
