// Push-beskeder (0003): abonnementer, push_targets og drop_push_endpoints.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, denied, leave, newCrawl, noRows, ok, users, uuid, type TestCrawl, type TestUser } from "./helpers";

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

async function targetEndpoints(u: TestUser, kind: string, key: string) {
  return ok(await targets(u, kind, key)).map((r: { endpoint: string }) => r.endpoint).sort();
}

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
  it("giver de andre på holdet, men ikke afsenderen eller folk uden for turen", async () => {
    expect(await targetEndpoints(a, "move", `${runKey}:1`)).toEqual([ep.b]);
  });

  it("sender den samme besked én gang, også når en anden prøver", async () => {
    expect(await targetEndpoints(a, "move", `${runKey}:1`)).toEqual([]);
    expect(await targetEndpoints(b, "move", `${runKey}:1`)).toEqual([]);
  });

  it("sender timeren til alle, også afsenderen", async () => {
    expect(await targetEndpoints(b, "timer", `${runKey}:1`)).toEqual([ep.a, ep.b].sort());
    expect(await targetEndpoints(a, "timer", `${runKey}:1`)).toEqual([]);
  });

  it("afviser folk uden for turen og uden login", async () => {
    denied(await targets(o, "move", `${runKey}:2`), "not_member");
    denied(await anon().rpc("push_targets", { p_crawl: crawl.id, p_kind: "move", p_key: `${runKey}:2` }));
  });

  it("afviser en ugyldig slags eller nøgle", async () => {
    denied(await targets(a, "Move!", `${runKey}:3`), "invalid_notification");
    denied(await targets(a, "move", ""), "invalid_notification");
    denied(await targets(a, "move", "x".repeat(201)), "invalid_notification");
  });

  it("loggen kan læses af holdet, men ikke skrives eller ses udefra", async () => {
    const log = ok(await b.c.from("notifications_sent").select("kind, key").eq("crawl_id", crawl.id));
    expect(log.map((r) => `${r.kind}:${r.key}`).sort()).toEqual([`move:${runKey}:1`, `timer:${runKey}:1`]);
    expect(ok(await o.c.from("notifications_sent").select("kind").eq("crawl_id", crawl.id))).toEqual([]);
    denied(await a.c.from("notifications_sent").insert({ crawl_id: crawl.id, kind: "move", key: `${runKey}:x` }));
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

describe("loftet for beskeder", () => {
  it("tillader 20 beskeder i minuttet pr. tur", async () => {
    // To er allerede sendt i denne tur (move og timer). De næste 18 går igennem, nr. 21 afvises.
    for (let i = 0; i < 18; i++) ok(await targets(a, "move", `${runKey}:burst:${i}`));
    denied(await targets(a, "move", `${runKey}:burst:last`), "rate_limited");
  });
});
