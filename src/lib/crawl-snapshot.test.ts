import { describe, expect, it } from "vitest";
import { mergeSnapshot, touchedNothing } from "./crawl-snapshot";
import { crawl, drink, member, stop } from "./test-fixtures";

const prev = {
  crawl: crawl({ current_stop_id: "s1", arrived_at: "2026-11-06T21:15:00.000Z" }),
  members: [member("u1", "Lukas")],
  stops: [{ ...stop("s1", 0), visited_at: "2026-11-06T21:15:00.000Z" }, stop("s2", 1)],
  drinks: [] as ReturnType<typeof drink>[],
};

describe("mergeSnapshot", () => {
  it("bruger det hentede, når Realtime intet har ændret imens", () => {
    const fetched = { crawl: crawl(), members: [member("u2", "Mikkel")], stops: [stop("s2", 0)], drinks: [] };
    const next = mergeSnapshot(prev, fetched, touchedNothing());
    expect(next.crawl.current_stop_id).toBeNull();
    expect(next.members.map((m) => m.user_id)).toEqual(["u2"]);
    expect(next.stops.map((s) => s.id)).toEqual(["s2"]);
  });

  it("skriver ikke et ældre billede over et Tjek ind, der kom med Realtime imens", () => {
    const touched = touchedNothing();
    touched.crawl = true;
    touched.stops.add("s1");
    const stale = { crawl: crawl(), members: prev.members, stops: [stop("s1", 0), stop("s2", 1)], drinks: [] };
    const next = mergeSnapshot(prev, stale, touched);
    expect(next.crawl.current_stop_id).toBe("s1");
    expect(next.stops.find((s) => s.id === "s1")?.visited_at).toBe("2026-11-06T21:15:00.000Z");
  });

  it("beholder en drink, der kom ind imens, og sorterer efter tid", () => {
    const late = drink("u2", "beer", 1, "2026-11-06T21:20:00.000Z");
    const early = drink("u1", "beer", 1, "2026-11-06T21:00:00.000Z");
    const touched = touchedNothing();
    touched.drinks.add(late.id);
    const next = mergeSnapshot({ ...prev, drinks: [late] }, { crawl: null, members: null, stops: null, drinks: [early] }, touched);
    expect(next.drinks.map((d) => d.id)).toEqual([early.id, late.id]);
    // Fejlede forespørgsler beholder det, vi havde.
    expect(next.crawl).toBe(prev.crawl);
    expect(next.members).toEqual(prev.members);
  });
});
