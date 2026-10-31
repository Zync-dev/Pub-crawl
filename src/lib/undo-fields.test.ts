import { describe, expect, it, vi } from "vitest";
import { crawl, stop } from "./test-fixtures";
import {
  byPosition,
  crawlRow,
  ARRIVAL,
  CHALLENGE,
  fieldsOf,
  guardFilters,
  NOBODY,
  once,
  undoFailedText,
  withCrawl,
  withoutStop,
  withStopBack,
  type CrawlFields,
} from "./undo-fields";

const at = (fields: Partial<CrawlFields>): CrawlFields => ({ ...NOBODY, ...fields });

describe("fieldsOf", () => {
  it("tager turens felter og gør en manglende udfordring til null", () => {
    expect(fieldsOf(crawl({ current_stop_id: "s1", arrived_at: "t", challenge: "Skål" }))).toEqual({
      current_stop_id: "s1",
      arrived_at: "t",
      challenge: "Skål",
      current_challenge_id: null,
    });
    expect(fieldsOf(crawl({ current_challenge_id: "ch1" })).current_challenge_id).toBe("ch1");
  });
});

describe("crawlRow", () => {
  it("skriver ikke current_challenge_id, når der intet er at skrive (uden migration 0006)", () => {
    expect(crawlRow(at({ current_stop_id: "s1" }), NOBODY)).toEqual({
      current_stop_id: "s1",
      arrived_at: null,
      challenge: null,
    });
  });

  it("skriver en ny udfordring", () => {
    expect(crawlRow(at({ current_challenge_id: "ch1" }), NOBODY)).toHaveProperty("current_challenge_id", "ch1");
  });

  it("rydder den gamle udfordring", () => {
    expect(crawlRow(NOBODY, at({ current_challenge_id: "ch1" }))).toHaveProperty("current_challenge_id", null);
  });
});

describe("withCrawl", () => {
  const base = { crawl: crawl(), stops: [stop("s1", 0), stop("s2", 1)] };

  it("sætter turens felter og én pubs visited_at", () => {
    const view = withCrawl(at({ current_stop_id: "s2", arrived_at: "t" }), { stopId: "s2", at: "t" })(base);
    expect(view.crawl.current_stop_id).toBe("s2");
    expect(view.crawl.code).toBe("ABC123");
    expect(view.stops.map((s) => s.visited_at)).toEqual([null, "t"]);
  });

  it("lader pubberne være uden visited", () => {
    expect(withCrawl(NOBODY)(base).stops).toBe(base.stops);
  });
});

describe("withoutStop og withStopBack", () => {
  const s1 = { ...stop("s1", 0), visited_at: "2026-11-06T20:00:00Z" };
  const s2 = stop("s2", 1);
  const s3 = stop("s3", 2);
  const before = at({ current_stop_id: "s2", arrived_at: "t", challenge: "Skål" });
  const base = { crawl: crawl({ ...before }), stops: [s1, s2, s3] };

  it("fjerner pubben og rydder den nuværende, som databasen gør", () => {
    const view = withoutStop(s2, true)(base);
    expect(view.stops.map((s) => s.id)).toEqual(["s1", "s3"]);
    expect(view.crawl.current_stop_id).toBeNull();
    expect(view.crawl.arrived_at).toBe("t");
  });

  it("rører ikke turen, når holdet står et andet sted", () => {
    expect(withoutStop(s3, false)(base).crawl).toBe(base.crawl);
    const moved = { ...base, crawl: { ...base.crawl, current_stop_id: "s3" } };
    expect(withoutStop(s2, true)(moved).crawl.current_stop_id).toBe("s3");
  });

  it("sætter pubben tilbage på sin plads og holdet tilbage på den", () => {
    const removed = withoutStop(s2, true)(base);
    const back = withStopBack(s2, true, before)({ ...removed, crawl: { ...removed.crawl, ...NOBODY } });
    expect(back.stops.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(back.crawl.current_stop_id).toBe("s2");
    expect(back.crawl.challenge).toBe("Skål");
  });

  it("flytter ikke holdet tilbage, når de er tjekket ind et andet sted", () => {
    const elsewhere = { crawl: crawl({ current_stop_id: "s3" }), stops: [s1, s3] };
    const back = withStopBack(s2, true, before)(elsewhere);
    expect(back.crawl.current_stop_id).toBe("s3");
    expect(back.stops.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("laver ikke en dublet, når pubben allerede er kommet tilbage", () => {
    expect(withStopBack(s2, false, before)(base).stops.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("byPosition", () => {
  it("sorterer efter plads og derefter oprettelse", () => {
    const x = { ...stop("x", 1), created_at: "2026-11-06T19:00:00Z" };
    const y = { ...stop("y", 1), created_at: "2026-11-06T18:00:00Z" };
    expect([x, stop("z", 0), y].sort(byPosition).map((s) => s.id)).toEqual(["z", "y", "x"]);
  });
});

describe("undoFailedText", () => {
  it("forklarer, hvorfor Fortryd ikke lykkedes", () => {
    expect(undoFailedText(null)).toBe("Holdet nåede at ændre det.");
    expect(undoFailedText({ code: "23503" })).toBe("Pubben er ikke på ruten længere.");
    expect(undoFailedText({ code: "08006" })).toBe("Det blev ikke fortrudt. Tjek forbindelsen.");
    expect(undoFailedText({})).toBe("Det blev ikke fortrudt. Tjek forbindelsen.");
  });
});

describe("once", () => {
  it("kører kun én gang, uanset hvor mange gange der trykkes", () => {
    const fn = vi.fn(async () => {});
    const undo = once(fn);
    undo();
    undo();
    undo();
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("guardFilters", () => {
  it("tjekker pubben og ankomsten, og null bliver til .is", () => {
    expect(guardFilters(at({ current_stop_id: "s1", arrived_at: "t" }), ARRIVAL)).toEqual([
      ["current_stop_id", "s1"],
      ["arrived_at", "t"],
    ]);
    expect(guardFilters(NOBODY, ARRIVAL)).toEqual([
      ["current_stop_id", null],
      ["arrived_at", null],
    ]);
  });

  it("tjekker også udfordringen, når en ny trækkes", () => {
    expect(guardFilters(at({ challenge: "Skål" }), CHALLENGE).map(([k]) => k)).toEqual([
      "current_stop_id",
      "arrived_at",
      "challenge",
    ]);
  });
});
