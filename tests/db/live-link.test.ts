// "Sent på den?" (0008): crawl_public for alle med linket og rotate_share_token for arrangøren.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Stop } from "@/lib/types";
import { addStop, anon, crawlRow, denied, leave, newCrawl, ok, users, type TestCrawl, type TestUser } from "./helpers";

let a: TestUser, c: TestUser, o: TestUser;
let crawl: TestCrawl;
let stop: Stop;

function publicView(token: string | null) {
  return anon().rpc("crawl_public", { p_token: token });
}

beforeAll(async () => {
  ({ a, c, o } = users());
  crawl = await newCrawl(c, a);
  stop = ok(await addStop(c, crawl.id, "Test pub"));
  ok(await a.c.from("crawls").update({ current_stop_id: stop.id, arrived_at: new Date().toISOString() }).eq("id", crawl.id));
  ok(await a.c.from("drinks").insert({ crawl_id: crawl.id, stop_id: stop.id, kind: "beer", units: 1 }));
});

afterAll(async () => {
  await leave(crawl, a, c);
});

describe("crawl_public uden login", () => {
  it("giver kun navn, nuværende pub, ankomst, antal og ruten", async () => {
    const view = ok(await publicView(crawl.share_token)) as Record<string, unknown>;
    expect(Object.keys(view).sort()).toEqual(["arrived_at", "current_stop_id", "member_count", "name", "stops"]);
    expect(view.name).toBe("Test db");
    expect(view.current_stop_id).toBe(stop.id);
    expect(view.member_count).toBe(2);
    const stops = view.stops as Record<string, unknown>[];
    expect(stops).toHaveLength(1);
    expect(Object.keys(stops[0]).sort()).toEqual(["id", "lat", "lng", "minutes", "name", "position", "visited_at"]);
  });

  it("afslører hverken kode, link, navne eller drinks", async () => {
    const text = JSON.stringify(ok(await publicView(crawl.share_token)));
    for (const secret of [crawl.code, crawl.share_token, c.name, a.name, a.id, c.id, "beer"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("giver null for et forkert eller skævt link", async () => {
    const wrong = crawl.share_token.startsWith("A") ? `B${crawl.share_token.slice(1)}` : `A${crawl.share_token.slice(1)}`;
    expect(ok(await publicView(wrong))).toBeNull();
    expect(ok(await publicView("for-kort"))).toBeNull();
    expect(ok(await publicView(`${crawl.share_token}'--`))).toBeNull();
    expect(ok(await publicView(null))).toBeNull();
  });

  it("virker også for en logget ind udefra, men turen selv er stadig skjult", async () => {
    expect(ok(await o.c.rpc("crawl_public", { p_token: crawl.share_token }))).not.toBeNull();
    expect(ok(await o.c.from("crawls").select("id").eq("id", crawl.id))).toEqual([]);
    const anonRead = await anon().from("crawls").select("id").eq("id", crawl.id);
    expect(anonRead.error !== null || (anonRead.data ?? []).length === 0).toBe(true);
  });

  it("anon kan ikke kalde de andre funktioner", async () => {
    denied(await anon().rpc("crawl_preview", { p_code: crawl.code }));
    denied(await anon().rpc("rotate_share_token", { p_crawl: crawl.id }));
  });
});

describe("rotate_share_token", () => {
  it("kan kun bruges af arrangøren", async () => {
    denied(await a.c.rpc("rotate_share_token", { p_crawl: crawl.id }), "not_creator");
    denied(await o.c.rpc("rotate_share_token", { p_crawl: crawl.id }), "not_creator");
  });

  it("linket kan ikke skrives direkte", async () => {
    denied(await c.c.from("crawls").update({ share_token: "A".repeat(22) }).eq("id", crawl.id));
  });

  it("laver et nyt link og lukker det gamle", async () => {
    const old = crawl.share_token;
    const token = ok(await c.c.rpc("rotate_share_token", { p_crawl: crawl.id })) as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(token).not.toBe(old);
    expect((await crawlRow(a, crawl.id)).share_token).toBe(token);
    expect(ok(await publicView(old))).toBeNull();
    expect(ok(await publicView(token))).not.toBeNull();
  });
});
