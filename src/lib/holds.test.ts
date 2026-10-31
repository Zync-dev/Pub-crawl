import { describe, expect, it } from "vitest";
import {
  addHold,
  applyHolds,
  dropHold,
  HOLD_GRACE_MS,
  HOLD_MAX_MS,
  pruneHolds,
  releaseHold,
  type Hold,
  type HoldChange,
} from "./holds";
import { crawl, stop } from "./test-fixtures";

const setChallenge =
  (text: string): HoldChange =>
  (v) => ({ ...v, crawl: { ...v.crawl, challenge: text } });

function hold(key: string, token: number, change: HoldChange, until = HOLD_MAX_MS): Hold {
  return { key, token, change, until };
}

describe("addHold", () => {
  it("erstatter et hold med samme nøgle, så Fortryd vinder", () => {
    const list = addHold([hold("crawl", 1, setChallenge("a")), hold("stop:s1", 2, setChallenge("b"))], hold("crawl", 3, setChallenge("c")));
    expect(list.map((h) => [h.key, h.token])).toEqual([
      ["stop:s1", 2],
      ["crawl", 3],
    ]);
  });
});

describe("releaseHold", () => {
  it("slipper efter lidt tid, men aldrig senere end først aftalt", () => {
    const list = [hold("crawl", 1, setChallenge("a"), 30_000), hold("x", 2, setChallenge("b"), 30_000)];
    expect(releaseHold(list, 1, 10_000).map((h) => h.until)).toEqual([10_000 + HOLD_GRACE_MS, 30_000]);
    expect(releaseHold(list, 1, 29_000)[0].until).toBe(30_000);
  });

  it("gør ingenting for et hold, der allerede er erstattet", () => {
    const list = [hold("crawl", 2, setChallenge("a"))];
    expect(releaseHold(list, 1, 0)).toEqual(list);
  });
});

describe("dropHold og pruneHolds", () => {
  it("fjerner kun holdet med det token", () => {
    const list = [hold("a", 1, setChallenge("a")), hold("b", 2, setChallenge("b"))];
    expect(dropHold(list, 1).map((h) => h.token)).toEqual([2]);
  });

  it("rydder udløbne hold og giver samme liste, når intet er udløbet", () => {
    const list = [hold("a", 1, setChallenge("a"), 1_000), hold("b", 2, setChallenge("b"), 5_000)];
    expect(pruneHolds(list, 999)).toBe(list);
    expect(pruneHolds(list, 1_000).map((h) => h.token)).toEqual([2]);
  });
});

describe("applyHolds", () => {
  const base = { crawl: crawl(), stops: [stop("s1", 0), stop("s2", 1)] };

  it("giver det hentede uændret uden hold", () => {
    expect(applyHolds([], base)).toBe(base);
  });

  it("lægger ændringerne på i rækkefølge, så den nyeste vinder", () => {
    const removeS1: HoldChange = (v) => ({ ...v, stops: v.stops.filter((s) => s.id !== "s1") });
    const view = applyHolds([hold("a", 1, setChallenge("første")), hold("b", 2, removeS1), hold("c", 3, setChallenge("anden"))], base);
    expect(view.crawl.challenge).toBe("anden");
    expect(view.stops.map((s) => s.id)).toEqual(["s2"]);
    expect(base.crawl.challenge).toBeNull();
  });
});
