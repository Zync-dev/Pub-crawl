import { describe, expect, it, vi } from "vitest";
import { cleanPickText, describeResult, flipCoin, parseGameResult, pickRandom, reelSequence, rollDice } from "./games";

const crew = [
  { user_id: "u1", name: "Lukas" },
  { user_id: "u2", name: "Mikkel" },
  { user_id: "u3", name: "Freja" },
];
const base = { id: "g1", from: "u1", at: "2026-11-06T21:00:00.000Z" };

describe("tilfældighed", () => {
  it("vælger fra listen og giver null for en tom liste", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(pickRandom(crew)).toBe(crew[2]);
    expect(pickRandom([])).toBeNull();
  });

  it("slår terninger mellem 1 og 6", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.9999);
    expect(rollDice(2)).toEqual([1, 6]);
    expect(rollDice(1)).toHaveLength(1);
  });

  it("slår plat eller krone", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.7);
    expect(flipCoin()).toBe("plat");
    expect(flipCoin()).toBe("krone");
  });
});

describe("reelSequence", () => {
  it("slutter på den valgte og står aldrig stille lige før", () => {
    for (let start = 0; start < crew.length; start++) {
      vi.spyOn(Math, "random").mockReturnValue((start + 0.5) / crew.length);
      for (const picked of crew) {
        const reel = reelSequence(crew, picked);
        expect(reel.at(-1)).toBe(picked);
        expect(reel.at(-2)).not.toBe(picked);
        expect(reel.length).toBeGreaterThanOrEqual(crew.length * 3);
      }
    }
  });

  it("viser bare den valgte, når man er alene", () => {
    expect(reelSequence([crew[0]], crew[0])).toEqual([crew[0]]);
  });
});

describe("cleanPickText", () => {
  it("rydder mellemrum og tegn i enden", () => {
    expect(cleanPickText("  henter   vand?! ")).toBe("henter vand");
    expect(cleanPickText("   ")).toBeNull();
    expect(cleanPickText("x".repeat(100))).toHaveLength(60);
  });
});

describe("parseGameResult", () => {
  it("godtager gyldige resultater", () => {
    expect(parseGameResult({ ...base, kind: "pick", pick: "u2", text: " henter vand. " })).toEqual({
      ...base,
      kind: "pick",
      pick: "u2",
      text: "henter vand",
    });
    expect(parseGameResult({ ...base, kind: "dice", dice: [3, 6] })).toEqual({ ...base, kind: "dice", dice: [3, 6] });
    expect(parseGameResult({ ...base, kind: "coin", coin: "krone" })).toEqual({ ...base, kind: "coin", coin: "krone" });
  });

  it("afviser alt, der ikke passer", () => {
    expect(parseGameResult(null)).toBeNull();
    expect(parseGameResult("pick")).toBeNull();
    expect(parseGameResult({ ...base, id: 1, kind: "coin", coin: "plat" })).toBeNull();
    expect(parseGameResult({ ...base, kind: "dice", dice: [7] })).toBeNull();
    expect(parseGameResult({ ...base, kind: "dice", dice: [1, 2, 3] })).toBeNull();
    expect(parseGameResult({ ...base, kind: "dice", dice: [1.5] })).toBeNull();
    expect(parseGameResult({ ...base, kind: "coin", coin: "kant" })).toBeNull();
    expect(parseGameResult({ ...base, kind: "pick" })).toBeNull();
    expect(parseGameResult({ ...base, kind: "bingo" })).toBeNull();
  });

  it("klipper et langt id", () => {
    expect(parseGameResult({ ...base, id: "x".repeat(100), kind: "coin", coin: "plat" })?.id).toHaveLength(64);
  });
});

describe("describeResult", () => {
  it("bygger teksten ud fra holdet", () => {
    expect(describeResult({ ...base, kind: "pick", pick: "u2", text: "henter vand" }, crew)).toBe(
      "Mikkel blev valgt: henter vand",
    );
    expect(describeResult({ ...base, kind: "pick", pick: "u3", text: null }, crew)).toBe("Freja blev valgt");
    expect(describeResult({ ...base, kind: "dice", dice: [4] }, crew)).toBe("Lukas slog 4");
    expect(describeResult({ ...base, kind: "dice", dice: [4, 5] }, crew)).toBe("Lukas slog 4 og 5 · 9 i alt");
    expect(describeResult({ ...base, kind: "coin", coin: "plat" }, crew)).toBe("Lukas slog plat eller krone: Plat");
  });

  it("viser intet fra eller om folk, der ikke er på holdet", () => {
    expect(describeResult({ ...base, from: "stranger", kind: "coin", coin: "plat" }, crew)).toBeNull();
    expect(describeResult({ ...base, kind: "pick", pick: "stranger", text: null }, crew)).toBeNull();
  });
});
