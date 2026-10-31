// Integrationstest af rettighederne i Supabase. Kør med `pnpm test:db` (kræver netværk og anonyme logins).
// Opretter en tur ved navn "Test db" med to deltagere og en udenforstående og rydder op ved at forlade den.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Crawl, Drink, Stop } from "@/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function client() {
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY mangler i .env.local");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signedIn() {
  const c = client();
  const { data, error } = await c.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Ingen bruger");
  return { c, id: data.user.id };
}

let a: { c: SupabaseClient; id: string };
let b: { c: SupabaseClient; id: string };
let outsider: { c: SupabaseClient; id: string };
let crawl: Crawl;
let stop: Stop;
let drinkA: Drink;

beforeAll(async () => {
  [a, b, outsider] = await Promise.all([signedIn(), signedIn(), signedIn()]);
  const { data, error } = await a.c.rpc("create_crawl", { p_name: "Test db", p_member_name: "Test A" }).single<Crawl>();
  if (error || !data) throw error ?? new Error("Ingen tur");
  crawl = data;
});

afterAll(async () => {
  // Man forlader turen ved at slette sin egen deltagerrække. Drinks følger med.
  for (const u of [b, a]) {
    if (!u || !crawl) continue;
    await u.c.from("members").delete().eq("crawl_id", crawl.id).eq("user_id", u.id);
    await u.c.auth.signOut();
  }
  await outsider?.c.auth.signOut();
});

describe("create_crawl, crawl_preview og join_crawl", () => {
  it("opretter turen med en kode på 6 tegn og opretteren som deltager", () => {
    expect(crawl.name).toBe("Test db");
    expect(crawl.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(crawl.created_by).toBe(a.id);
  });

  it("afviser brugere, der ikke er logget ind", async () => {
    const { error } = await client().rpc("create_crawl", { p_name: "Test db", p_member_name: "Ingen" });
    expect(error).not.toBeNull();
  });

  it("viser kun navn og antal i invitationen", async () => {
    const { data, error } = await b.c.rpc("crawl_preview", { p_code: crawl.code.toLowerCase() }).single();
    expect(error).toBeNull();
    expect(data).toEqual({ name: "Test db", member_count: 1 });
  });

  it("giver ingen invitation for en ukendt kode", async () => {
    const { data } = await b.c.rpc("crawl_preview", { p_code: "ZZZZZZ" });
    expect(data).toEqual([]);
  });

  it("melder fejl for en ukendt kode", async () => {
    const { error } = await b.c.rpc("join_crawl", { p_code: "ZZZZZZ", p_member_name: "Test B" });
    expect(error?.message).toContain("crawl_not_found");
  });

  it("lader den anden deltager hoppe med, også to gange", async () => {
    const first = await b.c.rpc("join_crawl", { p_code: ` ${crawl.code.toLowerCase()} `, p_member_name: "Test B" }).single<Crawl>();
    expect(first.error).toBeNull();
    expect(first.data?.id).toBe(crawl.id);
    const again = await b.c.rpc("join_crawl", { p_code: crawl.code, p_member_name: "Test B2" }).single<Crawl>();
    expect(again.error).toBeNull();
    const { data } = await b.c.rpc("crawl_preview", { p_code: crawl.code }).single();
    expect(data).toEqual({ name: "Test db", member_count: 2 });
    const { data: me } = await b.c.from("members").select("name").eq("crawl_id", crawl.id).eq("user_id", b.id).single();
    expect(me?.name).toBe("Test B2");
  });
});

describe("deltagere", () => {
  beforeAll(async () => {
    const s = await a.c
      .from("stops")
      .insert({ crawl_id: crawl.id, name: "Test pub", lat: 55.6761, lng: 12.5683, position: 0 })
      .select()
      .single<Stop>();
    if (s.error || !s.data) throw s.error;
    stop = s.data;
    const d = await a.c
      .from("drinks")
      .insert({ crawl_id: crawl.id, stop_id: stop.id, kind: "beer", units: 1 })
      .select()
      .single<Drink>();
    if (d.error || !d.data) throw d.error;
    drinkA = d.data;
  });

  it("kan se turen, holdet, ruten og drinks", async () => {
    const [c, m, s, d] = await Promise.all([
      b.c.from("crawls").select("id").eq("id", crawl.id),
      b.c.from("members").select("user_id").eq("crawl_id", crawl.id),
      b.c.from("stops").select("id").eq("crawl_id", crawl.id),
      b.c.from("drinks").select("id, user_id").eq("crawl_id", crawl.id),
    ]);
    expect(c.data).toHaveLength(1);
    expect(m.data?.map((r) => r.user_id).sort()).toEqual([a.id, b.id].sort());
    expect(s.data).toEqual([{ id: stop.id }]);
    expect(d.data).toEqual([{ id: drinkA.id, user_id: a.id }]);
  });

  it("kan ikke skrive en drink på en anden", async () => {
    const { error } = await b.c.from("drinks").insert({ crawl_id: crawl.id, user_id: a.id, kind: "shot", units: 1 });
    expect(error).not.toBeNull();
  });

  it("kan skrive sin egen drink", async () => {
    const { data, error } = await b.c.from("drinks").insert({ crawl_id: crawl.id, kind: "water", units: 0 }).select().single<Drink>();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(b.id);
  });

  it("kan ikke slette en andens drink", async () => {
    const { data } = await b.c.from("drinks").delete().eq("id", drinkA.id).select();
    expect(data ?? []).toEqual([]);
    const { data: still } = await a.c.from("drinks").select("id").eq("id", drinkA.id);
    expect(still).toHaveLength(1);
  });

  it("kan ikke slette turen", async () => {
    const { data, error } = await b.c.from("crawls").delete().eq("id", crawl.id).select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    const { data: still } = await a.c.from("crawls").select("id").eq("id", crawl.id);
    expect(still).toHaveLength(1);
  });

  it("kan ikke smide en anden ud eller omdøbe dem", async () => {
    const del = await b.c.from("members").delete().eq("crawl_id", crawl.id).eq("user_id", a.id).select();
    expect(del.data ?? []).toEqual([]);
    const upd = await b.c.from("members").update({ name: "Hacket" }).eq("crawl_id", crawl.id).eq("user_id", a.id).select();
    expect(upd.data ?? []).toEqual([]);
    const { data } = await a.c.from("members").select("name").eq("crawl_id", crawl.id).eq("user_id", a.id).single();
    expect(data?.name).toBe("Test A");
  });

  it("kan ikke ændre hvem der har oprettet turen", async () => {
    const { error } = await b.c.from("crawls").update({ created_by: b.id }).eq("id", crawl.id);
    expect(error).not.toBeNull();
  });
});

describe("udenforstående", () => {
  it("ser ingenting", async () => {
    const [c, m, s, d] = await Promise.all([
      outsider.c.from("crawls").select("id").eq("id", crawl.id),
      outsider.c.from("members").select("user_id").eq("crawl_id", crawl.id),
      outsider.c.from("stops").select("id").eq("crawl_id", crawl.id),
      outsider.c.from("drinks").select("id").eq("crawl_id", crawl.id),
    ]);
    for (const r of [c, m, s, d]) {
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
  });

  it("kan ikke skrive til turen", async () => {
    const drink = await outsider.c.from("drinks").insert({ crawl_id: crawl.id, kind: "beer", units: 1 });
    expect(drink.error).not.toBeNull();
    const pub = await outsider.c.from("stops").insert({ crawl_id: crawl.id, name: "Snyd", lat: 55, lng: 12 });
    expect(pub.error).not.toBeNull();
    const rename = await outsider.c.from("crawls").update({ name: "Snyd" }).eq("id", crawl.id).select();
    expect(rename.data ?? []).toEqual([]);
    const move = await outsider.c.from("stops").update({ name: "Snyd" }).eq("id", stop.id).select();
    expect(move.data ?? []).toEqual([]);
  });

  it("kan ikke kalde is_member for at gætte", async () => {
    const { data } = await outsider.c.rpc("is_member", { p_crawl: crawl.id });
    expect(data).toBe(false);
  });
});

describe("fejlrapporter (client_errors)", () => {
  it("kan indsættes, men ikke læses", async () => {
    const insert = await a.c.from("client_errors").insert({ crawl_code: crawl.code, message: "Test db: fejlrapport" });
    expect(insert.error).toBeNull();
    const read = await a.c.from("client_errors").select("id");
    expect(read.error).not.toBeNull();
  });

  it("kan ikke sendes i en andens navn eller uden login", async () => {
    const spoof = await a.c.from("client_errors").insert({ message: "Test db: snyd", user_id: b.id });
    expect(spoof.error).not.toBeNull();
    const anon = await client().from("client_errors").insert({ message: "Test db: anonym" });
    expect(anon.error).not.toBeNull();
  });
});
