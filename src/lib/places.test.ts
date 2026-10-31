import { describe, expect, it, vi } from "vitest";
import { boundsAround, nearbyBars, searchPlaces } from "./places";

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), init),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const row = (place_id: number, name: string, type: string, lat = "55.6761", lon = "12.5683", category = "amenity") => ({
  place_id,
  name,
  display_name: `${name}, Vesterbro, København`,
  lat,
  lon,
  category,
  type,
});

const bounds = boundsAround({ lat: 55.6761, lng: 12.5683 }, 0.01);

describe("boundsAround", () => {
  it("lægger en firkant om punktet", () => {
    expect(boundsAround({ lat: 55, lng: 12 }, 0.1)).toEqual({ south: 54.9, north: 55.1, west: 11.9, east: 12.1 });
  });
});

describe("searchPlaces", () => {
  it("spørger Nominatim i Danmark og laver rækkerne om til steder", async () => {
    const fetch = mockFetch(() => json([row(1, "Charlie Scott's", "pub"), { ...row(2, "", "bar"), display_name: "Bar 7, Nørrebro" }]));
    const places = await searchPlaces("charlie", bounds);
    const url = new URL(fetch.mock.calls[0][0] as string);
    expect(url.host).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("q")).toBe("charlie");
    expect(url.searchParams.get("countrycodes")).toBe("dk");
    expect(url.searchParams.get("viewbox")).toBe(`${bounds.west},${bounds.north},${bounds.east},${bounds.south}`);
    expect(places).toEqual([
      { id: "n1", name: "Charlie Scott's", lat: 55.6761, lng: 12.5683, kind: "pub" },
      { id: "n2", name: "Bar 7", lat: 55.6761, lng: 12.5683, kind: "bar" },
    ]);
  });

  it("kaster, når Nominatim svarer med fejl", async () => {
    mockFetch(() => json({}, 503));
    await expect(searchPlaces("x", bounds)).rejects.toThrow("search_failed");
  });
});

describe("nearbyBars", () => {
  it("beholder kun navngivne pubs og barer og fjerner dubletter", async () => {
    const fetch = mockFetch((url) =>
      url.searchParams.get("q") === "pub"
        ? json([row(1, "Mikkeller", "pub"), row(2, "Kiosken", "convenience"), row(3, "", "pub")])
        : json([
            row(4, "Mikkeller", "bar", "55.67612"),
            row(5, "Lidkoeb", "bar", "55.6700"),
            row(6, "Sporvejen", "bar", "55.6800", "12.5700", "shop"),
          ]),
    );
    const bars = await nearbyBars(bounds);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bars.map((b) => b.name).sort()).toEqual(["Lidkoeb", "Mikkeller"]);
  });

  it("falder tilbage til Overpass, når Nominatim intet finder", async () => {
    const fetch = mockFetch((url, init) => {
      if (url.host === "nominatim.openstreetmap.org") return json([]);
      expect(init?.method).toBe("POST");
      return json({
        elements: [
          { type: "node", id: 10, lat: 55.68, lon: 12.57, tags: { name: "Bodega", amenity: "pub" } },
          { type: "way", id: 11, center: { lat: 55.69, lon: 12.58 }, tags: { amenity: "biergarten" } },
          { type: "relation", id: 12, tags: { name: "Uden sted" } },
        ],
      });
    });
    const bars = await nearbyBars(bounds);
    expect(bars).toEqual([
      { id: "node10", name: "Bodega", lat: 55.68, lng: 12.57, kind: "pub" },
      { id: "way11", name: "Bar", lat: 55.69, lng: 12.58, kind: "biergarten" },
    ]);
    expect(fetch.mock.calls.some(([u]) => String(u).includes("overpass"))).toBe(true);
  });

  it("bruger den Overpass-server, der svarer, når Nominatim fejler", async () => {
    mockFetch((url) => {
      if (url.host === "nominatim.openstreetmap.org") throw new TypeError("offline");
      if (url.host === "overpass-api.de") return json({}, 504);
      return json({ elements: [{ type: "node", id: 1, lat: 55.7, lon: 12.6, tags: { name: "Hviids", amenity: "pub" } }] });
    });
    const bars = await nearbyBars(bounds);
    expect(bars[0]).toMatchObject({ name: "Hviids", id: "node1" });
  });

  it("kaster, når alle servere fejler", async () => {
    mockFetch(() => json({}, 500));
    await expect(nearbyBars(bounds)).rejects.toBeInstanceOf(AggregateError);
  });
});
