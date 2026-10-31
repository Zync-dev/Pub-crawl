import { describe, expect, it } from "vitest";
import { topDrinkers } from "./recap";
import { formatDrinkCount, formatKindCount, kindTotals, memberStats, stopTotals } from "./stats";
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

describe("Stillingen og regnskabet er enige", () => {
  const lukas = member("a", "Lukas");
  const mikkel = member("b", "Mikkel");

  it("runder genstande, så rækkefølgen af drinks ikke afgør, hvem der fører", () => {
    // 1,2 + 1,2 + 1,2 + 1 = 4.6, men 1 + 1,2 + 1,2 + 1,2 = 4.6000000000000005 som float.
    const drinks = [
      drink("a", "jbeer", 1.2, at(0)),
      drink("a", "jbeer", 1.2, at(1)),
      drink("a", "jbeer", 1.2, at(2)),
      drink("a", "beer", 1, at(3)),
      drink("b", "beer", 1, at(0)),
      drink("b", "jbeer", 1.2, at(1)),
      drink("b", "jbeer", 1.2, at(2)),
      drink("b", "jbeer", 1.2, at(3)),
    ];
    const stats = memberStats([mikkel, lukas], drinks, T0);
    expect(stats.map((s) => s.units)).toEqual([4.6, 4.6]);
    expect(stats[0].member.name).toBe("Lukas");
    expect(topDrinkers([mikkel, lukas], drinks, 3)[0].member.name).toBe("Lukas");
  });

  it("lader flest drinks vinde ved samme antal genstande og sorterer navne på dansk", () => {
    const drinks = [drink("a", "draft", 1.5, at(0)), drink("b", "beer", 1, at(0)), drink("b", "water", 0, at(1)), drink("b", "beer", 0.5, at(2))];
    expect(memberStats([lukas, mikkel], drinks, T0)[0].member.name).toBe("Mikkel");
    const names = memberStats([member("x", "Åse"), member("y", "Zoe"), member("z", "Øjvind"), member("w", "Anna")], [], T0).map((s) => s.member.name);
    expect(names).toEqual(["Anna", "Zoe", "Øjvind", "Åse"]);
  });
});

describe("formatKindCount", () => {
  it("bøjer menuens navne", () => {
    expect(formatKindCount("drink", 1)).toBe("1 drink");
    expect(formatKindCount("drink", 2)).toBe("2 drinks");
    expect(formatKindCount("shot", 3)).toBe("3 shots");
    expect(formatKindCount("wine", 2)).toBe("2 glas vin");
    expect(formatKindCount("beer", 4)).toBe("4 øl");
    expect(formatKindCount("jbeer", 1)).toBe("1 julebryg");
    expect(formatDrinkCount(1)).toBe("1 drink");
  });
});
