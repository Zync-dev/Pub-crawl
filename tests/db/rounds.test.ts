// Omgange (0005): alle på holdet skriver omgange, kun den, der skrev en, kan fortryde den.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Stop } from "@/lib/types";
import { addStop, denied, leave, newCrawl, noRows, ok, users, uuid, type TestCrawl, type TestUser } from "./helpers";

type Round = { id: string; crawl_id: string; stop_id: string | null; buyer_id: string; created_by: string; created_at: string };

let a: TestUser, b: TestUser, o: TestUser;
let crawl: TestCrawl;
let stop: Stop;
let r1: Round, r2: Round;

function give(u: TestUser, row: Record<string, unknown>) {
  return u.c.from("rounds").insert({ crawl_id: crawl.id, ...row }).select().single<Round>();
}

beforeAll(async () => {
  ({ a, b, o } = users());
  crawl = await newCrawl(a, b);
  stop = ok(await addStop(a, crawl.id));
});

afterAll(async () => {
  await leave(crawl, b, a);
});

describe("at give en omgang", () => {
  it("kan skrives af alle på holdet, på hvem som helst på holdet", async () => {
    r1 = ok(await give(a, { stop_id: stop.id, buyer_id: b.id }));
    expect(r1.created_by).toBe(a.id);
    expect(r1.buyer_id).toBe(b.id);
    r2 = ok(await give(b, { buyer_id: a.id }));
    expect(r2.created_by).toBe(b.id);
    expect(r2.stop_id).toBeNull();
    expect(ok(await b.c.from("rounds").select("id").eq("crawl_id", crawl.id))).toHaveLength(2);
  });

  it("afviser en giver uden for holdet og en pub fra en anden tur", async () => {
    denied(await give(a, { buyer_id: o.id }));
    denied(await give(a, { buyer_id: b.id, stop_id: uuid() }));
  });

  it("lader ikke klienten sætte id, created_by eller created_at", async () => {
    denied(await give(a, { buyer_id: b.id, created_by: b.id }));
    denied(await give(a, { buyer_id: b.id, created_at: "2026-11-06T20:00:00Z" }));
    denied(await give(a, { buyer_id: b.id, id: uuid() }));
  });

  it("kan ikke rettes bagefter", async () => {
    denied(await a.c.from("rounds").update({ buyer_id: a.id }).eq("id", r1.id));
  });
});

describe("give_round (0018)", () => {
  type Given = { round: Round; existed: boolean };

  it("skriver kun én omgang, når to trykker samtidig", async () => {
    // r2 er en omgang på a fra få sekunder siden. Den ville tælle som "lige givet" og give existed for begge.
    ok(await b.c.from("rounds").delete().eq("id", r2.id));
    const [x, y] = await Promise.all([
      a.c.rpc("give_round", { p_crawl: crawl.id, p_buyer: a.id }),
      b.c.rpc("give_round", { p_crawl: crawl.id, p_buyer: a.id }),
    ]);
    const first = ok(x) as Given;
    const second = ok(y) as Given;
    expect(first.round.id).toBe(second.round.id);
    expect([first.existed, second.existed].sort()).toEqual([false, true]);
    // Omgangen bliver stående i stedet for r2, så "omgangene forsvinder med den, der går hjem" stadig har en på a.
    r2 = first.round;
  });

  it("skriver en til, når man beder om det", async () => {
    const again = ok(await a.c.rpc("give_round", { p_crawl: crawl.id, p_buyer: a.id, p_force: true })) as Given;
    expect(again.existed).toBe(false);
    expect(again.round.created_by).toBe(a.id);
    ok(await a.c.from("rounds").delete().eq("id", again.round.id));
  });

  it("afviser udenforstående og en giver uden for holdet", async () => {
    denied(await o.c.rpc("give_round", { p_crawl: crawl.id, p_buyer: a.id }));
    denied(await a.c.rpc("give_round", { p_crawl: crawl.id, p_buyer: o.id }));
  });
});

describe("udenforstående", () => {
  it("ser ingen omgange og kan hverken skrive eller slette", async () => {
    expect(ok(await o.c.from("rounds").select("id").eq("crawl_id", crawl.id))).toEqual([]);
    denied(await o.c.from("rounds").insert({ crawl_id: crawl.id, buyer_id: a.id }));
    noRows(await o.c.from("rounds").delete().eq("id", r1.id).select());
  });
});

describe("at fortryde", () => {
  it("kan kun gøres af den, der skrev omgangen", async () => {
    noRows(await b.c.from("rounds").delete().eq("id", r1.id).select());
    expect(ok(await a.c.from("rounds").select("id").eq("id", r1.id))).toHaveLength(1);
    expect(ok(await a.c.from("rounds").delete().eq("id", r1.id).select())).toHaveLength(1);
  });

  it("en slettet pub fjerner kun pubben fra omgangen", async () => {
    const r = ok(await give(b, { buyer_id: b.id, stop_id: stop.id }));
    ok(await a.c.from("stops").delete().eq("id", stop.id));
    const after = ok(await b.c.from("rounds").select("stop_id").eq("id", r.id).single<{ stop_id: string | null }>());
    expect(after.stop_id).toBeNull();
  });

  it("omgangene forsvinder med den, der går hjem", async () => {
    await leave(crawl, b);
    const left = ok(await a.c.from("rounds").select("buyer_id").eq("crawl_id", crawl.id));
    expect(left.map((r) => r.buyer_id)).toEqual([a.id]);
  });
});
