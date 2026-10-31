import { describe, expect, it } from "vitest";
import {
  formatRoundCount,
  formatRoundsGiven,
  genitive,
  latestRounds,
  rankBuyers,
  removeRound,
  roundCounts,
  roundStandings,
  sortRounds,
  suggestBuyer,
  upsertRound,
  type Round,
} from "./rounds";
import { member } from "./test-fixtures";
import type { Member } from "./types";

function round(id: string, buyer_id: string, created_at: string, created_by = buyer_id): Round {
  return { id, crawl_id: "c1", stop_id: null, buyer_id, created_by, created_at };
}

function joined(m: Member, at: string): Member {
  return { ...m, joined_at: at };
}

const lukas = joined(member("u1", "Lukas"), "2026-11-06T18:00:00.000Z");
const mikkel = joined(member("u2", "Mikkel"), "2026-11-06T18:05:00.000Z");
const freja = joined(member("u3", "Freja"), "2026-11-06T18:10:00.000Z");
const crew = [lukas, mikkel, freja];

describe("sortRounds, upsertRound og removeRound", () => {
  it("sorterer efter tid og derefter id uden at røre listen", () => {
    const list = [
      round("b", "u1", "2026-11-06T20:00:00.000Z"),
      round("a", "u2", "2026-11-06T20:00:00.000Z"),
      round("c", "u3", "2026-11-06T19:00:00.000Z"),
    ];
    expect(sortRounds(list).map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(list.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("erstatter en række med samme id og holder listen sorteret", () => {
    const list = [round("a", "u1", "2026-11-06T20:00:00.000Z"), round("b", "u2", "2026-11-06T21:00:00.000Z")];
    const next = upsertRound(list, round("a", "u3", "2026-11-06T22:00:00.000Z"));
    expect(next.map((r) => [r.id, r.buyer_id])).toEqual([
      ["b", "u2"],
      ["a", "u3"],
    ]);
  });

  it("fjerner kun rækken med det id", () => {
    const list = [round("a", "u1", "2026-11-06T20:00:00.000Z"), round("b", "u2", "2026-11-06T21:00:00.000Z")];
    expect(removeRound(list, "a").map((r) => r.id)).toEqual(["b"]);
    expect(removeRound(list, "x")).toHaveLength(2);
  });
});

describe("roundCounts", () => {
  it("tæller pr. deltager og springer folk over, der er gået hjem", () => {
    const counts = roundCounts(crew, [
      round("1", "u1", "2026-11-06T19:00:00.000Z"),
      round("2", "u1", "2026-11-06T20:00:00.000Z"),
      round("3", "gone", "2026-11-06T20:30:00.000Z"),
    ]);
    expect([...counts]).toEqual([
      ["u1", 2],
      ["u2", 0],
      ["u3", 0],
    ]);
  });
});

describe("suggestBuyer og rankBuyers", () => {
  it("foreslår den, der har givet færrest", () => {
    const rounds = [round("1", "u1", "2026-11-06T19:00:00.000Z"), round("2", "u2", "2026-11-06T20:00:00.000Z")];
    expect(suggestBuyer(crew, rounds)).toBe(freja);
  });

  it("tager den, der kom først med, ved lighed", () => {
    expect(suggestBuyer(crew, [])).toBe(lukas);
    const rounds = [round("1", "u1", "2026-11-06T19:00:00.000Z")];
    expect(suggestBuyer(crew, rounds)).toBe(mikkel);
  });

  it("bruger navnet med dansk alfabet, når de kom med samtidig", () => {
    const at = "2026-11-06T18:00:00.000Z";
    const aase = joined(member("a", "Åse"), at);
    const oeystein = joined(member("o", "Øystein"), at);
    const zara = joined(member("z", "Zara"), at);
    expect(rankBuyers([aase, oeystein, zara], []).map((b) => b.member.name)).toEqual(["Zara", "Øystein", "Åse"]);
  });

  it("tæller ikke omgange fra folk, der er gået hjem", () => {
    const rounds = [round("1", "gone", "2026-11-06T19:00:00.000Z"), round("2", "gone", "2026-11-06T19:30:00.000Z")];
    expect(rankBuyers(crew, rounds).map((b) => b.count)).toEqual([0, 0, 0]);
    expect(suggestBuyer(crew, rounds)).toBe(lukas);
  });

  it("giver null, når ingen er med", () => {
    expect(suggestBuyer([], [round("1", "u1", "2026-11-06T19:00:00.000Z")])).toBeNull();
  });
});

describe("roundStandings", () => {
  it("viser flest omgange først og ellers efter navn", () => {
    const rounds = [
      round("1", "u2", "2026-11-06T19:00:00.000Z"),
      round("2", "u2", "2026-11-06T19:30:00.000Z"),
      round("3", "u3", "2026-11-06T20:00:00.000Z"),
    ];
    expect(roundStandings(crew, rounds).map((b) => [b.member.name, b.count])).toEqual([
      ["Mikkel", 2],
      ["Freja", 1],
      ["Lukas", 0],
    ]);
  });
});

describe("latestRounds", () => {
  it("giver de nyeste først og højst tre som standard", () => {
    const rounds = ["19", "20", "21", "22"].map((h, i) => round(`r${i}`, "u1", `2026-11-06T${h}:00:00.000Z`));
    expect(latestRounds(rounds).map((r) => r.id)).toEqual(["r3", "r2", "r1"]);
    expect(latestRounds(rounds, 1).map((r) => r.id)).toEqual(["r3"]);
    expect(latestRounds([])).toEqual([]);
  });
});

describe("tekster", () => {
  it("bøjer omgang", () => {
    expect(formatRoundCount(0)).toBe("0 omgange");
    expect(formatRoundCount(1)).toBe("1 omgang");
    expect(formatRoundCount(2)).toBe("2 omgange");
    expect(formatRoundsGiven(1)).toBe("1 omgang givet");
  });

  it("laver genitiv som på dansk", () => {
    expect(genitive("Mikkel")).toBe("Mikkels");
    expect(genitive("Lukas")).toBe("Lukas'");
    expect(genitive("Max")).toBe("Max'");
    expect(genitive("Inez")).toBe("Inez'");
    expect(genitive("JONAS")).toBe("JONAS'");
  });
});
