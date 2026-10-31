// Arrangørens værktøjer (0009): låst rute, fjern en deltager, ny kode og rollen videre.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Crawl, Stop } from "@/lib/types";
import { addStop, crawlRow, denied, leave, newCrawl, noRows, ok, users, type TestCrawl, type TestUser } from "./helpers";

let a: TestUser, b: TestUser, c: TestUser, o: TestUser;
let crawl: TestCrawl;
let stop: Stop;

function lock(u: TestUser, locked: boolean) {
  return u.c.rpc("set_route_locked", { p_crawl: crawl.id, p_locked: locked }).single<TestCrawl>();
}
function updateStop(u: TestUser, patch: Record<string, unknown>) {
  return u.c.from("stops").update(patch).eq("id", stop.id).select();
}
async function stopNow() {
  return ok(await a.c.from("stops").select("*").eq("id", stop.id).single<Stop>());
}

beforeAll(async () => {
  ({ a, b, c, o } = users());
  crawl = await newCrawl(a, b, c);
  stop = ok(await addStop(a, crawl.id, "Test pub", 0));
});

afterAll(async () => {
  await leave(crawl, a, b, c);
});

describe("set_route_locked", () => {
  it("ruten er åben fra start, og låsen kan ikke skrives direkte", async () => {
    expect(crawl.route_locked).toBe(false);
    denied(await a.c.from("crawls").update({ route_locked: true }).eq("id", crawl.id));
  });

  it("kan kun bruges af arrangøren", async () => {
    denied(await lock(b, true), "not_arranger");
    denied(await lock(o, true), "not_arranger");
    expect(ok(await lock(a, true)).route_locked).toBe(true);
  });
});

describe("låst rute for en på holdet", () => {
  it("kan ikke tilføje en pub", async () => {
    denied(await addStop(b, crawl.id, "Snyd", 5), "route_locked");
  });

  it("kan ikke omdøbe, flytte, bytte rækkefølge eller ændre minutter", async () => {
    denied(await updateStop(b, { name: "Snyd" }), "route_locked");
    denied(await updateStop(b, { lat: 55.7, lng: 12.6 }), "route_locked");
    denied(await updateStop(b, { position: 3 }), "route_locked");
    denied(await updateStop(b, { minutes: 90 }), "route_locked");
  });

  it("kan ikke slette en pub", async () => {
    denied(await b.c.from("stops").delete().eq("id", stop.id).select(), "route_locked");
    expect(await stopNow()).toMatchObject({ name: "Test pub", position: 0, minutes: 30 });
  });

  it("kan stadig tjekke ind og gå videre", async () => {
    const now = new Date().toISOString();
    expect(ok(await updateStop(b, { visited_at: now }))).toHaveLength(1);
    ok(await b.c.from("crawls").update({ current_stop_id: stop.id, arrived_at: now, challenge: "Test db" }).eq("id", crawl.id));
    const row = await crawlRow(b, crawl.id);
    expect(row.current_stop_id).toBe(stop.id);
    ok(await b.c.from("crawls").update({ current_stop_id: null, arrived_at: null }).eq("id", crawl.id));
    expect(ok(await updateStop(b, { visited_at: null }))).toHaveLength(1);
  });

  it("arrangøren kan stadig rette alt", async () => {
    const added = ok(await addStop(a, crawl.id, "Test pub 2", 1));
    expect(ok(await a.c.from("stops").update({ name: "Test pub 2b", lat: 55.68, position: 2, minutes: 45 }).eq("id", added.id).select())).toHaveLength(1);
    expect(ok(await a.c.from("stops").delete().eq("id", added.id).select())).toHaveLength(1);
  });

  it("når ruten låses op, kan alle rette igen", async () => {
    expect(ok(await lock(a, false)).route_locked).toBe(false);
    const added = ok(await addStop(b, crawl.id, "Test pub 3", 1));
    expect(ok(await b.c.from("stops").delete().eq("id", added.id).select())).toHaveLength(1);
  });
});

describe("remove_member", () => {
  it("kan kun bruges af arrangøren, og ikke på en selv", async () => {
    denied(await b.c.rpc("remove_member", { p_crawl: crawl.id, p_user: c.id }), "not_arranger");
    denied(await o.c.rpc("remove_member", { p_crawl: crawl.id, p_user: c.id }), "not_arranger");
    denied(await a.c.rpc("remove_member", { p_crawl: crawl.id, p_user: a.id }), "cannot_remove_self");
    denied(await a.c.rpc("remove_member", { p_crawl: crawl.id, p_user: o.id }), "member_not_found");
  });

  it("fjerner deltageren og deres drinks", async () => {
    ok(await c.c.from("drinks").insert({ crawl_id: crawl.id, kind: "beer", units: 1 }));
    ok(await a.c.rpc("remove_member", { p_crawl: crawl.id, p_user: c.id }));
    const members = ok(await a.c.from("members").select("user_id").eq("crawl_id", crawl.id));
    expect(members.map((m) => m.user_id).sort()).toEqual([a.id, b.id].sort());
    expect(ok(await a.c.from("drinks").select("id").eq("user_id", c.id).eq("crawl_id", crawl.id))).toEqual([]);
    expect(ok(await c.c.from("crawls").select("id").eq("id", crawl.id))).toEqual([]);
  });
});

describe("rotate_code", () => {
  it("kan kun bruges af arrangøren", async () => {
    denied(await b.c.rpc("rotate_code", { p_crawl: crawl.id }), "not_arranger");
    denied(await c.c.rpc("rotate_code", { p_crawl: crawl.id }), "not_arranger");
  });

  it("giver en ny kode, så den gamle ikke virker længere", async () => {
    const old = crawl.code;
    const next = ok(await a.c.rpc("rotate_code", { p_crawl: crawl.id }).single<Crawl>());
    expect(next.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(next.code).not.toBe(old);
    denied(await c.c.rpc("join_crawl", { p_code: old, p_member_name: c.name }), "crawl_not_found");
    expect(ok(await c.c.rpc("crawl_preview", { p_code: old }))).toEqual([]);
    expect((await crawlRow(b, crawl.id)).code).toBe(next.code);
    crawl = { ...crawl, code: next.code };
  });
});

describe("transfer_arranger", () => {
  it("kan kun gives videre af arrangøren og kun til en på holdet", async () => {
    denied(await b.c.rpc("transfer_arranger", { p_crawl: crawl.id, p_user: b.id }), "not_arranger");
    denied(await a.c.rpc("transfer_arranger", { p_crawl: crawl.id, p_user: o.id }), "member_not_found");
    denied(await a.c.rpc("transfer_arranger", { p_crawl: crawl.id, p_user: a.id }), "already_arranger");
  });

  it("giver rollen videre, og den gamle arrangør mister værktøjerne", async () => {
    const next = ok(await a.c.rpc("transfer_arranger", { p_crawl: crawl.id, p_user: b.id }).single<Crawl>());
    expect(next.created_by).toBe(b.id);
    denied(await lock(a, true), "not_arranger");
    expect(ok(await lock(b, true)).route_locked).toBe(true);
    denied(await addStop(a, crawl.id, "Snyd", 5), "route_locked");
    expect(ok(await addStop(b, crawl.id, "Test pub 4", 1)).name).toBe("Test pub 4");
  });

  it("created_by kan ikke skrives direkte", async () => {
    denied(await a.c.from("crawls").update({ created_by: a.id }).eq("id", crawl.id));
  });
});

// Fejl fundet af testene og rettet i 0013_db_fixes.sql: før den blev turen uden arrangør på holdet,
// så en låst rute aldrig kunne låses op igen, og den, der var gået, stadig kunne låse ruten.
describe("når arrangøren går hjem", () => {
  it("går rollen videre til den, der har været længst på holdet", async () => {
    // c kommer med igen på den nye kode, så der er to tilbage, når b går.
    ok(await c.c.rpc("join_crawl", { p_code: crawl.code, p_member_name: c.name }).single());
    await leave(crawl, b);
    const row = await crawlRow(a, crawl.id);
    expect(row.created_by).toBe(a.id);
    expect(ok(await lock(a, false)).route_locked).toBe(false);
  });

  it("den, der er gået, kan ikke rette noget", async () => {
    noRows(await b.c.from("stops").update({ name: "Snyd" }).eq("id", stop.id).select());
    denied(await b.c.rpc("set_route_locked", { p_crawl: crawl.id, p_locked: true }), "not_arranger");
  });
});

describe("clear_old_positions", () => {
  it("kan ikke kaldes af klienter", async () => {
    denied(await a.c.rpc("clear_old_positions"));
  });
});
