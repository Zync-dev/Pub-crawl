// Push-beskeder (0003, 0014): abonnementer, push_targets og drop_push_endpoints.
// push_targets og drop_push_endpoints kan kun kaldes med den hemmelige nøgle (som /api/push).
// De test kører kun, når SUPABASE_SECRET_KEY står i .env.local.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, denied, leave, newCrawl, noRows, ok, service, users, uuid, type TestCrawl, type TestUser } from "./helpers";

let a: TestUser, b: TestUser, o: TestUser;
let crawl: TestCrawl;
const admin = service();

const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);
const endpoint = (who: string) => `https://fcm.googleapis.com/fcm/send/test-db-${who}-${uuid()}`;

function save(u: TestUser, ep: string, p256dh = P256DH, auth = AUTH) {
  return u.c.rpc("save_push_subscription", { p_endpoint: ep, p_p256dh: p256dh, p_auth: auth });
}

async function mine(u: TestUser) {
  return ok(await u.c.from("push_subscriptions").select("endpoint, user_id")).map((r) => r.endpoint).sort();
}

function targets(c: SupabaseClient, u: TestUser, kind: string, key: string) {
  return c.rpc("push_targets", { p_crawl: crawl.id, p_kind: kind, p_key: key, p_user: u.id });
}

async function targetEndpoints(u: TestUser, kind: string, key: string) {
  return ok(await targets(admin!, u, kind, key)).map((r: { endpoint: string }) => r.endpoint).sort();
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
    denied(await save(a, "http://fcm.googleapis.com/fcm/send/test-db"));
    denied(await anon().rpc("save_push_subscription", { p_endpoint: endpoint("anon"), p_p256dh: P256DH, p_auth: AUTH }));
  });

  it("afviser endpoints hos andre end push-tjenesterne", async () => {
    denied(await save(a, `https://victim.example/test-db/${uuid()}`));
    denied(await save(a, `https://fcm.googleapis.com.evil.example/test-db/${uuid()}`));
    denied(await save(a, `https://fcm.googleapis.com@evil.example/test-db/${uuid()}`));
    denied(await a.c.from("push_subscriptions").insert({ endpoint: `https://victim.example/${uuid()}`, p256dh: P256DH, auth: AUTH }));
    ok(await save(a, `https://updates.push.services.mozilla.com/wpush/v2/test-db-${uuid()}`));
    ok(await save(a, `https://web.push.apple.com/test-db-${uuid()}`));
    ok(await save(a, `https://wns2-par02p.notify.windows.com/w/?token=test-db-${uuid()}`));
    for (const e of await mine(a)) if (e !== ep.a) await a.c.from("push_subscriptions").delete().eq("endpoint", e);
    expect(await mine(a)).toEqual([ep.a]);
  });

  it("lader en ny bruger på samme apparat overtage endpointet", async () => {
    ok(await save(o, ep.b));
    expect(await mine(b)).toEqual([]);
    expect(await mine(o)).toEqual([ep.b, ep.o].sort());
    ok(await save(b, ep.b));
    expect(await mine(b)).toEqual([ep.b]);
    expect(await mine(o)).toEqual([ep.o]);
  });

  it("lader ikke en, der kun kender endpointet, overtage det", async () => {
    ok(await save(o, ep.b, "C".repeat(87), "c".repeat(22)));
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

describe("push_targets og drop_push_endpoints fra browseren", () => {
  it("kan hverken kaldes af holdet, udefra eller uden login", async () => {
    for (const c of [a.c, o.c, anon()]) {
      denied(await targets(c, a, "move", `${runKey}:browser`));
      denied(await c.rpc("drop_push_endpoints", { p_crawl: crawl.id, p_endpoints: [ep.b] }));
    }
    expect(await mine(b)).toEqual([ep.b]);
  });
});

describe.skipIf(!admin)("push_targets med den hemmelige nøgle", () => {
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

  it("afviser folk uden for turen og en manglende bruger", async () => {
    denied(await targets(admin!, o, "move", `${runKey}:2`), "not_member");
    denied(
      await admin!.rpc("push_targets", { p_crawl: crawl.id, p_kind: "move", p_key: `${runKey}:2`, p_user: null }),
      "not_authenticated",
    );
  });

  it("afviser en ugyldig slags eller nøgle", async () => {
    denied(await targets(admin!, a, "Move!", `${runKey}:3`), "invalid_notification");
    denied(await targets(admin!, a, "move", ""), "invalid_notification");
    denied(await targets(admin!, a, "move", "x".repeat(201)), "invalid_notification");
  });

  it("loggen kan læses af holdet, men ikke skrives eller ses udefra", async () => {
    const log = ok(await b.c.from("notifications_sent").select("kind, key").eq("crawl_id", crawl.id));
    expect(log.map((r) => `${r.kind}:${r.key}`).sort()).toEqual([`move:${runKey}:1`, `timer:${runKey}:1`]);
    expect(ok(await o.c.from("notifications_sent").select("kind").eq("crawl_id", crawl.id))).toEqual([]);
    denied(await a.c.from("notifications_sent").insert({ crawl_id: crawl.id, kind: "move", key: `${runKey}:x` }));
  });
});

describe.skipIf(!admin)("drop_push_endpoints med den hemmelige nøgle", () => {
  it("rører ikke abonnementer hos folk, der ikke er på turen", async () => {
    expect(ok(await admin!.rpc("drop_push_endpoints", { p_crawl: crawl.id, p_endpoints: [ep.o] }))).toBe(0);
    expect(await mine(o)).toEqual([ep.o]);
  });

  it("fjerner et dødt endpoint hos en på holdet", async () => {
    expect(ok(await admin!.rpc("drop_push_endpoints", { p_crawl: crawl.id, p_endpoints: [ep.b] }))).toBe(1);
    expect(await mine(b)).toEqual([]);
    ok(await save(b, ep.b));
  });

  it("tager en tom liste og afviser for mange på én gang", async () => {
    expect(ok(await admin!.rpc("drop_push_endpoints", { p_crawl: crawl.id, p_endpoints: [] }))).toBe(0);
    const many = Array.from({ length: 51 }, () => endpoint("x"));
    denied(await admin!.rpc("drop_push_endpoints", { p_crawl: crawl.id, p_endpoints: many }), "too_many_endpoints");
  });
});

describe.skipIf(!admin)("loftet for beskeder", () => {
  it("tillader 20 beskeder i minuttet pr. tur", async () => {
    // To er allerede sendt i denne tur (move og timer). De næste 18 går igennem, nr. 21 afvises.
    for (let i = 0; i < 18; i++) ok(await targets(admin!, a, "move", `${runKey}:burst:${i}`));
    denied(await targets(admin!, a, "move", `${runKey}:burst:last`), "rate_limited");
  });
});
