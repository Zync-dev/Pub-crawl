// Hjælpere til databasetestene. Brugerne kommer fra setup.ts, så hver fil kun laver sin egen tur.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, inject } from "vitest";
import type { Crawl, Stop } from "@/lib/types";
import type { PoolName, TestSession } from "./setup";

export type TestUser = { name: string; id: string; c: SupabaseClient };

// Turen med kolonnerne fra de senere migrationer.
export type TestCrawl = Crawl & { share_token: string; route_locked: boolean };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// En klient uden login (rollen anon).
export function anon() {
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY mangler i .env.local");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function asUser(name: string, s: TestSession): TestUser {
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY mangler i .env.local");
  const c = createClient(url, key, { accessToken: async () => s.token });
  return { name, id: s.id, c };
}

// a, b og c kommer på holdet efter behov. o er udenforstående.
export function users(): Record<PoolName, TestUser> {
  const all = inject("dbUsers");
  return {
    a: asUser("Test A", all.a),
    b: asUser("Test B", all.b),
    c: asUser("Test C", all.c),
    o: asUser("Test O", all.o),
  };
}

// En helt ny bruger til fejlrapporternes loft, eller null, hvis Supabase ikke ville lave en.
export function freshUser(): TestUser | null {
  const e = inject("dbErrorsUser");
  return e ? asUser("Test E", e) : null;
}

export const uuid = () => randomUUID();

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

// Giver data tilbage og fejler testen med databasens besked, hvis der kom en fejl.
export function ok<T>(res: Result<T>): T {
  if (res.error) throw new Error(`Uventet fejl: ${res.error.message}`);
  return res.data as T;
}

// Forventer en fejl, eventuelt med en bestemt besked (fx "not_arranger").
export function denied(res: { error: { message: string } | null }, message?: string) {
  expect(res.error, "forventede en fejl").not.toBeNull();
  if (message) expect(res.error?.message).toContain(message);
}

// Forventer, at RLS skjulte rækken, så skrivningen ramte nul rækker (eller blev afvist).
export function noRows(res: { data: unknown[] | null; error: unknown }) {
  expect(res.error !== null || (res.data ?? []).length === 0).toBe(true);
}

// Opretter en tur ved navn "Test db" med owner som arrangør og resten på holdet i den rækkefølge.
export async function newCrawl(owner: TestUser, ...crew: TestUser[]): Promise<TestCrawl> {
  const crawl = ok(
    await owner.c.rpc("create_crawl", { p_name: "Test db", p_member_name: owner.name }).single<TestCrawl>(),
  );
  for (const u of crew) {
    ok(await u.c.rpc("join_crawl", { p_code: crawl.code, p_member_name: u.name }).single());
  }
  return crawl;
}

// Rydder op: alle forlader turen. Fejl ignoreres, fordi nogle allerede er gået.
export async function leave(crawl: { id: string } | undefined, ...crew: TestUser[]) {
  if (!crawl) return;
  for (const u of crew) {
    await u.c.from("members").delete().eq("crawl_id", crawl.id).eq("user_id", u.id);
  }
}

export async function addStop(user: TestUser, crawlId: string, name = "Test pub", position = 0) {
  return user.c
    .from("stops")
    .insert({ crawl_id: crawlId, name, lat: 55.6761 + position / 1000, lng: 12.5683, position })
    .select()
    .single<Stop>();
}

export async function crawlRow(user: TestUser, crawlId: string) {
  return ok(await user.c.from("crawls").select("*").eq("id", crawlId).single<TestCrawl>());
}
