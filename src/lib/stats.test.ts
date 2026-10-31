import { describe, expect, it } from "vitest";
import { kindTotals, memberStats, stopTotals } from "./stats";
import { drink, member, stop } from "./test-fixtures";

const T0 = Date.parse("2026-11-06T19:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

describe("memberStats", () => {
  const members = [member("a", "Freja"), member("b", "Mikkel"), member("c", "Anna")];
  const drinks = [
    drink("a", "beer", 1, at(0)),
    drink("a", "draft", 1.5, at(30)),
    drink("a", "water", 0, at(40)),
    drink("b", "shot", 1, at(10)),
  ];

  it("lægger genstande sammen og sorterer efter flest", () => {
    const stats = memberStats(members, drinks, T0 + 60 * 60_000);
    expect(stats.map((s) => s.member.name)).toEqual(["Freja", "Mikkel", "Anna"]);
    expect(stats[0].units).toBe(2.5);
    expect(stats[0].count).toBe(2);
    expect(stats[0].water).toBe(1);
    expect(stats[0].byKind).toEqual({ beer: 1, draft: 1, water: 1 });
    expect(stats[0].lastAt).toBe(at(40));
  });

  it("regner tempo fra første drink med alkohol, først efter en halv time", () => {
    const early = memberStats(members, drinks, T0 + 20 * 60_000);
    expect(early.find((s) => s.member.user_id === "a")?.perHour).toBeNull();
    const later = memberStats(members, drinks, T0 + 60 * 60_000);
    expect(later.find((s) => s.member.user_id === "a")?.perHour).toBeCloseTo(2.5);
  });

  it("giver nul og null til den, der ikke har drukket", () => {
    const anna = memberStats(members, drinks, T0).find((s) => s.member.user_id === "c")!;
    expect(anna).toMatchObject({ units: 0, count: 0, water: 0, lastAt: null, perHour: null });
  });

  it("sorterer lige mange genstande efter navn", () => {
    const stats = memberStats([member("x", "Bo"), member("y", "Ada")], [], T0);
    expect(stats.map((s) => s.member.name)).toEqual(["Ada", "Bo"]);
  });

  it("tæller units, der kommer som tekst fra databasen", () => {
    const fromDb = [{ ...drink("a", "wine", 0, at(0)), units: "1.5" as unknown as number }];
    expect(memberStats([member("a", "Freja")], fromDb, T0)[0].units).toBe(1.5);
  });
});

describe("kindTotals og stopTotals", () => {
  const stops = [stop("s1", 0), stop("s2", 1)];
  const drinks = [
    drink("a", "beer", 1, at(0), "s1"),
    drink("b", "beer", 1, at(1), "s1"),
    drink("b", "water", 0, at(2), "s1"),
    drink("a", "shot", 1, at(3), "s2"),
    drink("a", "cider", 1, at(4), null),
  ];

  it("tæller pr. slags", () => {
    expect(kindTotals(drinks)).toEqual({ beer: 2, water: 1, shot: 1, cider: 1 });
  });

  it("tæller pr. pub uden vand", () => {
    expect(stopTotals(stops, drinks).map((t) => [t.stop.id, t.count, t.units])).toEqual([
      ["s1", 2, 2],
      ["s2", 1, 1],
    ]);
  });
});
