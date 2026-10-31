// Push-beskeder (0003, 0017): abonnementer, crew_push og drop_push_endpoints.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Stop } from "@/lib/types";
import { addStop, anon, denied, leave, newCrawl, noRows, ok, users, uuid, type TestCrawl, type TestUser } from "./helpers";

let a: TestUser, b: TestUser, o: TestUser;
let crawl: TestCrawl;

const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);
const endpoint = (who: string) => `https://push.example.com/test-db/${who}/${uuid()}`;

function save(u: TestUser, ep: string) {
  return u.c.rpc("save_push_subscription", { p_endpoint: ep, p_p256dh: P256DH, p_auth: AUTH });
}

async function mine(u: TestUser) {
  return ok(await u.c.from("push_subscriptions").select("endpoint, user_id")).map((r) => r.endpoint).sort();
}

function targets(u: TestUser, kind: string, key: string) {
  return u.c.rpc("push_targets", { p_crawl: crawl.id, p_kind: kind, p_key: key });
}

type CrewRow = { endpoint: string; title: string; body: string; url: string };

async function crew(u: TestUser, kind: string, key: string) {
  const res = await u.c.rpc("crew_push", { p_crawl: crawl.id, p_kind: kind, p_key: key });
  return res as { data: CrewRow[] | null; error: { message: string } | null };
}

// Samme nøgle som deadlineKey i use-crew-notifications.ts: pub og tidspunktet, hvor 5 minutter er gået.
const deadline = (stopId: string, arrivedAt: string) => `${stopId}:${new Date(arrivedAt).getTime() + 5 * 60_000}`;

const ep: Record<"a" | "b" | "o", string> = { a: "", b: "", o: "" };
const runKey = uuid().slice(0, 8);

beforeAll(async () => {
  ({ a, b, o } = users());
  crawl = await newCrawl(b, a);
  // Gamle abonnementer fra tidligere kørsler ryddes, så modtagerlisterne er præcise.
  for (const u of [a, b, o]) await u.c.from("push_subscriptions").delete().eq("user_id", u.id);
  ep.a = endpoint("a");
  ep.b = endpoint("b");
  ep.o = endpoint("o");
  for (const [u, e] of [[a, ep.a], [b, ep.b], [o, ep.o]] as const) ok(await save(u, e));
});

afterAll(async () => {
  for (const u of [a, b, o]) await u?.c.from("push_subscriptions").delete().eq("user_id", u.id);
  await leave(crawl, a, b);
});

describe("push_subscriptions og save_push_subscription", () => {
  it("viser kun ens egne apparater", async () => {
    expect(await mine(a)).toEqual([ep.a]);
    expect(await mine(b)).toEqual([ep.b]);
  });

  it("kan ikke gemme et abonnement i en andens navn", async () => {
    denied(await a.c.from("push_subscriptions").insert({ user_id: b.id, endpoint: endpoint("x"), p256dh: P256DH, auth: AUTH }));
  });

  it("kan ikke rette eller slette en andens abonnement direkte", async () => {
    denied(await a.c.from("push_subscriptions").update({ p256dh: P256DH }).eq("endpoint", ep.a));
    noRows(await a.c.from("push_subscriptions").delete().eq("endpoint", ep.b).select());
    expect(await mine(b)).toEqual([ep.b]);
  });

  it("afviser et endpoint uden https og brugere uden login", async () => {
    denied(await save(a, "http://push.example.com/test-db"));
    denied(await anon().rpc("save_push_subscription", { p_endpoint: endpoint("anon"), p_p256dh: P256DH, p_auth: AUTH }));
  });

  it("lader en ny bruger på samme apparat overtage endpointet", async () => {
    ok(await save(o, ep.b));
    expect(await mine(b)).toEqual([]);
    expect(await mine(o)).toEqual([ep.b, ep.o].sort());
    ok(await save(b, ep.b));
    expect(await mine(b)).toEqual([ep.b]);
    expect(await mine(o)).toEqual([ep.o]);
  });

  it("gemmer højst fem apparater pr. bruger og smider de ældste ud", async () => {
    const extra = Array.from({ length: 5 }, () => endpoint("a"));
    for (const e of extra) ok(await save(a, e));
    const now = await mine(a);
    expect(now).toHaveLength(5);
    expect(now).not.toContain(ep.a);
    // Tilbage til ét apparat, så testene nedenfor kender modtagerne.
    for (const e of extra) await a.c.from("push_subscriptions").delete().eq("endpoint", e);
    ok(await save(a, ep.a));
    expect(await mine(a)).toEqual([ep.a]);
  });
});

describe("push_targets", () => {
  it("kan ikke længere kaldes direkte (0017)", async () => {
    denied(await targets(a, "move", `${runKey}:1`));
  });
});

// crew_push (0017): databasen tjekker, at det er sket, og skriver selv teksten.
describe("crew_push", () => {
  let stop: Stop;

  beforeAll(async () => {
    stop = ok(await addStop(b, crawl.id, "Test pub", 0));
    ok(await b.c.from("stops").update({ minutes: 5 }).eq("id", stop.id));
  });

  it("afviser folk uden for turen, uden login og ukendte slags", async () => {
    denied(await crew(o, "rollcall", uuid()), "not_member");
    denied(await anon().rpc("crew_push", { p_crawl: crawl.id, p_kind: "rollcall", p_key: uuid() }));
    denied(await crew(a, "hello", "x"), "invalid_notification");
    denied(await crew(a, "rollcall", "x".repeat(201)), "invalid_notification");
  });

  it("sender et opråb, som afsenderen selv har startet, til de andre én gang", async () => {
    const call = ok(await a.c.rpc("start_roll_call", { p_crawl: crawl.id }).single<{ id: string }>());
    denied(await crew(b, "rollcall", call.id), "invalid_notification");
    const rows = ok(await crew(a, "rollcall", call.id));
    expect(rows.map((r) => r.endpoint)).toEqual([ep.b]);
    expect(rows[0]).toMatchObject({ title: "Er alle med?", url: `/t/${crawl.code}` });
    expect(ok(await crew(a, "rollcall", call.id))).toEqual([]);
    denied(await crew(a, "rollcall", uuid()), "invalid_notification");
  });

  it("sender en omgang med giverens navn", async () => {
    const round = ok(await a.c.from("rounds").insert({ crawl_id: crawl.id, buyer_id: b.id }).select("id").single<{ id: string }>());
    denied(await crew(b, "round", round.id), "invalid_notification");
    const rows = ok(await crew(a, "round", round.id));
    expect(rows.map((r) => r.endpoint)).toEqual([ep.b]);
    expect(rows[0].title).toBe("Omgangen er på Test B");
  });

  it("sender timeren til alle, men kun når tiden ved pubben er gået", async () => {
    const now = new Date().toISOString();
    ok(await b.c.from("crawls").update({ current_stop_id: stop.id, arrived_at: now }).eq("id", crawl.id));
    denied(await crew(b, "timer", deadline(stop.id, now)), "not_due");
    const early = new Date(Date.now() - 6 * 60_000).toISOString();
    ok(await b.c.from("crawls").update({ arrived_at: early }).eq("id", crawl.id));
    denied(await crew(b, "timer", deadline(stop.id, now)), "invalid_notification");
    const rows = ok(await crew(b, "timer", deadline(stop.id, early)));
    expect(rows.map((r) => r.endpoint).sort()).toEqual([ep.a, ep.b].sort());
    expect(rows[0].title).toBe("Sidste omgang på Test pub");
    expect(ok(await crew(a, "timer", deadline(stop.id, early)))).toEqual([]);
  });

  it("sender Videre først, når holdet har forladt pubben", async () => {
    const key = `${stop.id}:${Date.now()}`;
    denied(await crew(a, "move", key), "invalid_notification");
    ok(await b.c.from("stops").update({ visited_at: new Date().toISOString() }).eq("id", stop.id));
    ok(await b.c.from("crawls").update({ current_stop_id: null, arrived_at: null }).eq("id", crawl.id));
    denied(await crew(a, "move", `${uuid()}:1`), "invalid_notification");
    const rows = ok(await crew(a, "move", key));
    expect(rows.map((r) => r.endpoint)).toEqual([ep.b]);
    expect(rows[0]).toMatchObject({ title: "Holdet går videre", body: "Ruten er gået. Test pub var sidste pub." });
    expect(ok(await crew(b, "move", key))).toEqual([]);
  });

  it("loggen kan læses af holdet, men ikke skrives eller ses udefra", async () => {
    const log = ok(await b.c.from("notifications_sent").select("kind").eq("crawl_id", crawl.id));
    expect(log.map((r) => r.kind).sort()).toEqual(["move", "round", "rollcall", "timer"].sort());
    expect(ok(await o.c.from("notifications_sent").select("kind").eq("crawl_id", crawl.id))).toEqual([]);
    denied(await a.c.from("notifications_sent").insert({ crawl_id: crawl.id, kind: "move", key: `${runKey}:x` }));
  });

  it("tager højst seks beskeder i minuttet fra den samme afsender", async () => {
    // a har sendt tre (opråb, omgang, Videre). De næste tre går igennem, nr. 7 afvises.
    for (let i = 0; i < 3; i++) ok(await crew(a, "move", `${stop.id}:${i}`));
    denied(await crew(a, "move", `${stop.id}:9`), "rate_limited");
    // Loftet er pr. afsender, så b kan stadig sende.
    ok(await crew(b, "move", `${stop.id}:9`));
  });
});

describe("drop_push_endpoints", () => {
  it("afviser folk uden for turen", async () => {
    denied(await o.c.rpc("drop_push_endpoints", { p_crawl: crawl.id, p_endpoints: [ep.a] }), "not_member");
    expect(await mine(a)).toEqual([ep.a]);
  });

  it("rører ikke abonnementer hos folk, der ikke er på turen", async () => {
    expect(ok(await a.c.rpc("drop_push_endpoints", { p_crawl: crawl.id, p_endpoints: [ep.o] }))).toBe(0);
    expect(await mine(o)).toEqual([ep.o]);
  });

  it("fjerner et dødt endpoint hos en på holdet", async () => {
    expect(ok(await a.c.rpc("drop_push_endpoints", { p_crawl: crawl.id, p_endpoints: [ep.b] }))).toBe(1);
    expect(await mine(b)).toEqual([]);
    ok(await save(b, ep.b));
  });

  it("tager en tom liste og afviser for mange på én gang", async () => {
    expect(ok(await a.c.rpc("drop_push_endpoints", { p_crawl: crawl.id, p_endpoints: [] }))).toBe(0);
    const many = Array.from({ length: 51 }, () => endpoint("x"));
    denied(await a.c.rpc("drop_push_endpoints", { p_crawl: crawl.id, p_endpoints: many }), "too_many_endpoints");
  });
});

