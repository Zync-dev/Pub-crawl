import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPublicCrawl,
  formatCopenhagenTime,
  isShareToken,
  liveLinkPath,
  liveStatus,
  type PublicCrawl,
  type PublicStop,
} from "./live-link";

const TOKEN = "Ab3_-defGHIjklMNOpqr12";

afterEach(() => {
  vi.unstubAllEnvs();
});

function pub(id: string, position: number, visited_at: string | null = null): PublicStop {
  return { id, name: `Pub ${id}`, lat: 55.67, lng: 12.56, position, minutes: 30, visited_at };
}

function crawl(patch: Partial<PublicCrawl> = {}): PublicCrawl {
  return { name: "J-dag", current_stop_id: null, arrived_at: null, member_count: 4, stops: [], ...patch };
}

describe("isShareToken og liveLinkPath", () => {
  it("godtager kun 22 url-sikre tegn", () => {
    expect(TOKEN).toHaveLength(22);
    expect(isShareToken(TOKEN)).toBe(true);
    expect(isShareToken(TOKEN.slice(1))).toBe(false);
    expect(isShareToken(`${TOKEN}x`)).toBe(false);
    expect(isShareToken("Ab3+/defGHIjklMNOpqr12")).toBe(false);
    expect(isShareToken("../../rest/v1/crawlsxx")).toBe(false);
    expect(isShareToken("")).toBe(false);
  });

  it("bygger stien til live-siden", () => {
    expect(liveLinkPath(TOKEN)).toBe(`/se/${TOKEN}`);
  });
});

describe("formatCopenhagenTime", () => {
  it("skriver dansk vintertid med kolon", () => {
    expect(formatCopenhagenTime("2026-11-06T20:15:00.000Z")).toBe("21:15");
    expect(formatCopenhagenTime("2026-11-06T23:05:00.123456+00:00")).toBe("00:05");
  });

  it("skriver dansk sommertid", () => {
    expect(formatCopenhagenTime("2026-07-01T19:05:00Z")).toBe("21:05");
  });
});

describe("liveStatus", () => {
  const stops = [pub("a", 0, "2026-11-06T19:00:00Z"), pub("b", 1, "2026-11-06T20:00:00Z"), pub("c", 2), pub("d", 3)];

  it("viser den nuværende pub og den næste, der ikke er besøgt", () => {
    const status = liveStatus(crawl({ current_stop_id: "b", stops }));
    expect(status.current?.id).toBe("b");
    expect(status.next?.id).toBe("c");
    expect(status.started).toBe(true);
  });

  it("springer besøgte pubber over efter den nuværende", () => {
    const list = [pub("a", 0, "x"), pub("b", 1, "x"), pub("c", 2, "x"), pub("d", 3)];
    expect(liveStatus(crawl({ current_stop_id: "a", stops: list })).next?.id).toBe("d");
  });

  it("har ingen næste på den sidste pub", () => {
    const status = liveStatus(crawl({ current_stop_id: "d", stops: [...stops.slice(0, 3), pub("d", 3, "x")] }));
    expect(status.current?.id).toBe("d");
    expect(status.next).toBeNull();
  });

  it("peger på den første ubesøgte pub, når holdet er på vej", () => {
    const status = liveStatus(crawl({ stops }));
    expect(status.current).toBeNull();
    expect(status.next?.id).toBe("c");
  });

  it("er ikke startet, før nogen pub er besøgt", () => {
    const status = liveStatus(crawl({ stops: [pub("a", 0), pub("b", 1)] }));
    expect(status).toEqual({ current: null, next: expect.objectContaining({ id: "a" }), started: false });
  });

  it("klarer en tom rute og en nuværende pub, der er fjernet", () => {
    expect(liveStatus(crawl())).toEqual({ current: null, next: null, started: false });
    expect(liveStatus(crawl({ current_stop_id: "gone", stops })).next?.id).toBe("c");
  });
});

describe("fetchPublicCrawl", () => {
  function env() {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  }

  it("spørger ikke serveren om et ugyldigt link", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPublicCrawl("nope")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("kalder crawl_public uden login og giver turen tilbage", async () => {
    env();
    const body = crawl({ name: "J-dag 2026" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPublicCrawl(TOKEN)).resolves.toEqual(body);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1/rpc/crawl_public");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ p_token: TOKEN });
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("sb_publishable_test");
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("giver null for et link, der ikke findes længere", async () => {
    env();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("null", { status: 200 })));
    await expect(fetchPublicCrawl(TOKEN)).resolves.toBeNull();
  });

  it("kaster ved serverfejl og manglende opsætning", async () => {
    env();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(fetchPublicCrawl(TOKEN)).rejects.toThrow("crawl_public 500");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(fetchPublicCrawl(TOKEN)).rejects.toThrow();
  });
});
