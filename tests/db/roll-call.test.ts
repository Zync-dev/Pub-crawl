// Navneopråb (0004): ét åbent pr. tur, man svarer kun for sig selv, og det lukker, når alle er med.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Stop } from "@/lib/types";
import { addStop, denied, leave, newCrawl, noRows, ok, users, uuid, type TestCrawl, type TestUser } from "./helpers";

type RollCall = { id: string; crawl_id: string; started_by: string; from_stop_id: string | null; to_stop_id: string | null; closed_at: string | null };

let a: TestUser, b: TestUser, c: TestUser, o: TestUser;
let crawl: TestCrawl;
let s1: Stop, s2: Stop;
let call: RollCall;

function start(u: TestUser, from: string | null = null, to: string | null = null) {
  return u.c.rpc("start_roll_call", { p_crawl: crawl.id, p_from_stop: from, p_to_stop: to }).single<RollCall>();
}
function answer(u: TestUser, id = call.id) {
  return u.c.rpc("answer_roll_call", { p_roll_call: id }).single<RollCall>();
}
function close(u: TestUser, id = call.id) {
  return u.c.rpc("close_roll_call", { p_roll_call: id }).single<RollCall>();
}
async function answeredBy(u: TestUser, id = call.id) {
  return ok(await u.c.from("roll_call_answers").select("user_id").eq("roll_call_id", id)).map((r) => r.user_id).sort();
}

beforeAll(async () => {
  ({ a, b, c, o } = users());
  crawl = await newCrawl(c, a, b);
  s1 = ok(await addStop(c, crawl.id, "Test pub 1", 0));
  s2 = ok(await addStop(c, crawl.id, "Test pub 2", 1));
  call = ok(await start(a, s1.id, s2.id));
});

afterAll(async () => {
  await leave(crawl, a, b, c);
});

describe("tabellerne kan kun læses", () => {
  it("afviser direkte skrivninger", async () => {
    denied(await a.c.from("roll_calls").insert({ crawl_id: crawl.id }));
    denied(await b.c.from("roll_call_answers").insert({ roll_call_id: call.id, user_id: b.id, crawl_id: crawl.id }));
    denied(await b.c.from("roll_call_answers").insert({ roll_call_id: call.id, user_id: c.id, crawl_id: crawl.id }));
    denied(await a.c.from("roll_calls").update({ closed_at: new Date().toISOString() }).eq("id", call.id));
    denied(await a.c.from("roll_call_answers").delete().eq("roll_call_id", call.id));
  });
});

describe("start_roll_call", () => {
  it("starter med den, der starter, som svaret", async () => {
    expect(call.crawl_id).toBe(crawl.id);
    expect(call.started_by).toBe(a.id);
    expect(call.from_stop_id).toBe(s1.id);
    expect(call.to_stop_id).toBe(s2.id);
    expect(call.closed_at).toBeNull();
    expect(await answeredBy(b)).toEqual([a.id]);
  });

  it("giver det åbne opråb tilbage i stedet for at starte et nyt", async () => {
    const again = ok(await start(b));
    expect(again.id).toBe(call.id);
    expect(again.started_by).toBe(a.id);
    const open = ok(await b.c.from("roll_calls").select("id").eq("crawl_id", crawl.id).is("closed_at", null));
    expect(open).toHaveLength(1);
  });

  it("afviser folk uden for turen", async () => {
    denied(await o.c.rpc("start_roll_call", { p_crawl: crawl.id }), "not_member");
  });

  it("hjælperen, der lukker opråbet, kan ikke kaldes udefra", async () => {
    denied(await a.c.rpc("roll_call_close_if_complete", { p_roll_call: call.id }));
    expect(ok(await a.c.from("roll_calls").select("closed_at").eq("id", call.id).single<RollCall>()).closed_at).toBeNull();
  });
});

describe("udenforstående", () => {
  it("ser hverken opråb eller svar og kan hverken svare eller lukke", async () => {
    expect(ok(await o.c.from("roll_calls").select("id").eq("crawl_id", crawl.id))).toEqual([]);
    expect(ok(await o.c.from("roll_call_answers").select("user_id").eq("crawl_id", crawl.id))).toEqual([]);
    denied(await answer(o), "roll_call_not_found");
    denied(await close(o), "roll_call_not_found");
  });
});

describe("answer_roll_call", () => {
  it("svarer kun for en selv, og to gange tæller som én", async () => {
    const r = ok(await answer(b));
    expect(r.closed_at).toBeNull();
    ok(await answer(b));
    expect(await answeredBy(c)).toEqual([a.id, b.id].sort());
  });

  it("lukker af sig selv, når alle har svaret", async () => {
    const r = ok(await answer(c));
    expect(r.closed_at).not.toBeNull();
    expect(await answeredBy(a)).toEqual([a.id, b.id, c.id].sort());
  });

  it("afviser svar, når opråbet er lukket", async () => {
    denied(await answer(a), "roll_call_closed");
  });
});

describe("close_roll_call", () => {
  it("starter et nyt opråb, når det gamle er lukket", async () => {
    const next = ok(await start(b));
    expect(next.id).not.toBe(call.id);
    expect(next.started_by).toBe(b.id);
    call = next;
  });

  it("kan lukkes af alle på holdet, og lukket forbliver lukket", async () => {
    const closed = ok(await close(c));
    expect(closed.closed_at).not.toBeNull();
    const twice = ok(await close(a));
    expect(twice.closed_at).toBe(closed.closed_at);
  });

  it("afviser en pub, der ikke er på turen", async () => {
    denied(await start(a, uuid(), null));
    const open = ok(await a.c.from("roll_calls").select("id").eq("crawl_id", crawl.id).is("closed_at", null));
    expect(open).toEqual([]);
  });

  it("svarene forsvinder med den, der går hjem, og en tidligere deltager kan ikke svare", async () => {
    const r = ok(await start(a));
    await leave(crawl, c);
    noRows(await c.c.from("roll_call_answers").select("user_id").eq("roll_call_id", r.id));
    denied(await answer(c, r.id), "roll_call_not_found");
    // Resten har ikke svaret endnu. b svarer, og så er alle tilbageværende med.
    const done = ok(await answer(b, r.id));
    expect(done.closed_at).not.toBeNull();
  });
});
