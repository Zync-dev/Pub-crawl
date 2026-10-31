// Aftenens regnskab (migration 0011_recap.sql): databasen skriver stops.left_at, når holdet går videre.
// Kør med `pnpm test:db`. Opretter turen "Test recap" med to deltagere og rydder op ved at forlade den.
// Er migrationen ikke kørt endnu, springes testene over.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Crawl, Stop } from "@/lib/types";
import { leave, users, type TestUser } from "./helpers";

type RecapStop = Stop & { left_at: string | null };

// Delte testbrugere fra setup.ts. Turen oprettes af pool-bruger c, som opretter færrest ture pr. kørsel.
let a: TestUser;
let b: TestUser;
let crawl: Crawl;
let first: RecapStop;
let second: RecapStop;
let migrated = false;

async function leftAt(id: string) {
  const { data, error } = await a.c.from("stops").select("left_at").eq("id", id).single<{ left_at: string | null }>();
  if (error) throw error;
  return data.left_at;
}

async function setCurrent(u: TestUser, stopId: string | null) {
  const { error } = await u.c
    .from("crawls")
    .update({ current_stop_id: stopId, arrived_at: stopId ? new Date().toISOString() : null })
    .eq("id", crawl.id);
  expect(error).toBeNull();
}

beforeAll(async () => {
  ({ c: a, b } = users());
  const created = await a.c.rpc("create_crawl", { p_name: "Test recap", p_member_name: a.name }).single<Crawl>();
  if (created.error || !created.data) throw created.error ?? new Error("Ingen tur");
  crawl = created.data;
  const joined = await b.c.rpc("join_crawl", { p_code: crawl.code, p_member_name: b.name });
  if (joined.error) throw joined.error;
  const stops = await a.c
    .from("stops")
    .insert([
      { crawl_id: crawl.id, name: "Test Kronen", lat: 55.67, lng: 12.56, position: 0 },
      { crawl_id: crawl.id, name: "Test Hjørnet", lat: 55.6745, lng: 12.56, position: 1 },
    ])
    .select("*")
    .returns<RecapStop[]>();
  if (stops.error || !stops.data) throw stops.error ?? new Error("Ingen pubs");
  [first, second] = stops.data.sort((x, y) => x.position - y.position);
  const probe = await a.c.from("stops").select("left_at").eq("id", first.id);
  migrated = !probe.error;
});

afterAll(async () => {
  // Brugerne genbruges i næste kørsel, så de logges ikke ud.
  await leave(crawl, b, a);
});

describe("stops.left_at", () => {
  it("er tom, før holdet går fra pubben", async ({ skip }) => {
    if (!migrated) skip("0011_recap.sql er ikke kørt");
    await setCurrent(a, first.id);
    expect(await leftAt(first.id)).toBeNull();
  });

  it("sættes, når holdet går videre", async ({ skip }) => {
    if (!migrated) skip("0011_recap.sql er ikke kørt");
    const before = Date.now() - 60_000;
    await setCurrent(b, null);
    const left = await leftAt(first.id);
    expect(left).not.toBeNull();
    expect(Date.parse(left!)).toBeGreaterThan(before);
  });

  it("ryddes igen, når Videre fortrydes", async ({ skip }) => {
    if (!migrated) skip("0011_recap.sql er ikke kørt");
    await setCurrent(a, first.id);
    expect(await leftAt(first.id)).toBeNull();
  });

  it("sættes også, når holdet tjekker direkte ind et nyt sted", async ({ skip }) => {
    if (!migrated) skip("0011_recap.sql er ikke kørt");
    await setCurrent(a, second.id);
    expect(await leftAt(first.id)).not.toBeNull();
    expect(await leftAt(second.id)).toBeNull();
  });

  it("kan ikke skrives af klienten", async ({ skip }) => {
    if (!migrated) skip("0011_recap.sql er ikke kørt");
    const { error } = await b.c.from("stops").update({ left_at: "2026-11-06T18:00:00Z" }).eq("id", second.id);
    expect(error).not.toBeNull();
    expect(await leftAt(second.id)).toBeNull();
  });

  it("virker også, når arrangøren har låst ruten", async ({ skip }) => {
    if (!migrated) skip("0011_recap.sql er ikke kørt");
    const locked = await a.c.rpc("set_route_locked", { p_crawl: crawl.id, p_locked: true });
    expect(locked.error).toBeNull();
    await setCurrent(b, null);
    expect(await leftAt(second.id)).not.toBeNull();
    await a.c.rpc("set_route_locked", { p_crawl: crawl.id, p_locked: false });
  });
});
