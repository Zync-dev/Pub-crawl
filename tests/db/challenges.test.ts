// Udfordringspoint (0006): challenges, challenge_votes og vote_challenge.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, denied, leave, newCrawl, noRows, ok, users, uuid, type TestCrawl, type TestUser } from "./helpers";

type Challenge = { id: string; crawl_id: string; text: string; target_user_id: string | null };
type Vote = { user_id: string; done: boolean };

let a: TestUser, b: TestUser, o: TestUser;
let crawl: TestCrawl;
let forB: Challenge, forAll: Challenge;

function draw(u: TestUser, text: string, target: string | null) {
  return u.c.from("challenges").insert({ crawl_id: crawl.id, text, target_user_id: target }).select().single<Challenge>();
}
function vote(u: TestUser, id: string, done: boolean | null) {
  return u.c.rpc("vote_challenge", { p_challenge: id, p_done: done });
}
async function votes(u: TestUser, id: string) {
  const rows = ok(await u.c.from("challenge_votes").select("user_id, done").eq("challenge_id", id));
  return (rows as Vote[]).sort((x, y) => x.user_id.localeCompare(y.user_id));
}

beforeAll(async () => {
  ({ a, b, o } = users());
  crawl = await newCrawl(b, a);
});

afterAll(async () => {
  await leave(crawl, a, b);
});

describe("challenges", () => {
  it("kan trækkes af holdet til én eller til alle", async () => {
    forB = ok(await draw(a, "Test db: syng en sang", b.id));
    expect(forB.target_user_id).toBe(b.id);
    forAll = ok(await draw(b, "Test db: skål med baren", null));
    expect(forAll.target_user_id).toBeNull();
  });

  it("afviser en udfordring til en, der ikke er på holdet", async () => {
    denied(await draw(a, "Test db: snyd", o.id));
  });

  it("kan ikke rettes", async () => {
    denied(await a.c.from("challenges").update({ text: "Snyd" }).eq("id", forB.id));
  });

  // Rettet i 0014: udfordringer havde ingen afsender og kunne ikke slettes af nogen.
  it("får afsenderen sat af databasen, som ikke kan skrives", async () => {
    const row = ok(await a.c.from("challenges").select("created_by").eq("id", forB.id).single<{ created_by: string }>());
    expect(row.created_by).toBe(a.id);
    denied(await a.c.from("challenges").insert({ crawl_id: crawl.id, text: "Test db: snyd", created_by: b.id }));
    denied(await a.c.from("challenges").insert({ id: uuid(), crawl_id: crawl.id, text: "Test db: snyd" }));
  });

  it("kan slettes af den, der trak den, og af arrangøren, men ikke af andre", async () => {
    // b er arrangør. a trak forB, b trak forAll.
    noRows(await a.c.from("challenges").delete().eq("id", forAll.id).select());
    noRows(await o.c.from("challenges").delete().eq("id", forB.id).select());
    const mine = ok(await draw(a, "Test db: slettes af a", null));
    expect(ok(await a.c.from("challenges").delete().eq("id", mine.id).select())).toHaveLength(1);
    const theirs = ok(await draw(a, "Test db: slettes af arrangøren", null));
    expect(ok(await b.c.from("challenges").delete().eq("id", theirs.id).select())).toHaveLength(1);
  });

  it("højst 300 pr. tur", async () => {
    const count = ok(await a.c.from("challenges").select("id").eq("crawl_id", crawl.id)).length;
    const rows = Array.from({ length: 300 - count }, (_, i) => ({ crawl_id: crawl.id, text: `Test db: fyld ${i}` }));
    ok(await a.c.from("challenges").insert(rows));
    denied(await draw(a, "Test db: én for mange", null), "too_many_challenges");
  });

  it("kan vises under Nu, men kun fra samme tur", async () => {
    ok(await a.c.from("crawls").update({ challenge: forB.text, current_challenge_id: forB.id }).eq("id", crawl.id));
    denied(await a.c.from("crawls").update({ current_challenge_id: uuid() }).eq("id", crawl.id));
  });
});

describe("vote_challenge", () => {
  it("gemmer én stemme pr. person, og man kan skifte mening", async () => {
    ok(await vote(a, forB.id, true));
    ok(await vote(b, forB.id, false));
    ok(await vote(b, forB.id, true));
    const rows = await votes(a, forB.id);
    expect(rows).toEqual(
      [
        { user_id: a.id, done: true },
        { user_id: b.id, done: true },
      ].sort((x, y) => x.user_id.localeCompare(y.user_id)),
    );
  });

  it("afviser en tom stemme og en ukendt udfordring", async () => {
    denied(await vote(a, forAll.id, null), "invalid_vote");
    denied(await vote(a, uuid(), true), "challenge_not_found");
  });

  it("stemmer kan ikke skrives direkte", async () => {
    denied(await a.c.from("challenge_votes").insert({ challenge_id: forAll.id, crawl_id: crawl.id, user_id: a.id, done: true }));
    denied(await a.c.from("challenge_votes").update({ done: false }).eq("challenge_id", forB.id));
    denied(await a.c.from("challenge_votes").delete().eq("challenge_id", forB.id));
  });
});

describe("udenforstående", () => {
  it("ser hverken udfordringer eller stemmer og kan hverken trække eller stemme", async () => {
    expect(ok(await o.c.from("challenges").select("id").eq("crawl_id", crawl.id))).toEqual([]);
    expect(ok(await o.c.from("challenge_votes").select("user_id").eq("crawl_id", crawl.id))).toEqual([]);
    denied(await o.c.from("challenges").insert({ crawl_id: crawl.id, text: "Snyd" }));
    denied(await vote(o, forB.id, false), "challenge_not_found");
    denied(await anon().rpc("vote_challenge", { p_challenge: forB.id, p_done: true }));
  });
});

describe("at gå hjem", () => {
  it("tager ens stemmer med", async () => {
    await leave(crawl, a);
    expect(await votes(b, forB.id)).toEqual([{ user_id: b.id, done: true }]);
  });
});
