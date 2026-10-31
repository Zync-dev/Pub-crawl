import { afterEach, describe, expect, it, vi } from "vitest";
import { CHALLENGES, drawChallenge, needsVote } from "./challenges";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CHALLENGES", () => {
  it("er unikke og korte nok til databasen", () => {
    expect(new Set(CHALLENGES).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) {
      expect(c.replaceAll("{navn}", "x".repeat(30)).length).toBeLessThanOrEqual(300);
    }
  });
});

describe("drawChallenge", () => {
  it("sætter et navn ind i stedet for {navn}", () => {
    const index = CHALLENGES.findIndex((c) => c.includes("{navn}"));
    vi.spyOn(Math, "random")
      .mockReturnValueOnce((index + 0.5) / CHALLENGES.length)
      .mockReturnValueOnce(0.99);
    const mikkel = { name: "Mikkel" };
    const drawn = drawChallenge([{ name: "Freja" }, mikkel]);
    expect(drawn.text).toBe(CHALLENGES[index].replaceAll("{navn}", "Mikkel"));
    expect(drawn.text).not.toContain("{navn}");
    expect(drawn.target).toBe(mikkel);
  });

  it("bruger Den yngste, når ingen er med", () => {
    const index = CHALLENGES.findIndex((c) => c.startsWith("{navn}"));
    vi.spyOn(Math, "random").mockReturnValue((index + 0.5) / CHALLENGES.length);
    const drawn = drawChallenge([]);
    expect(drawn.text).toMatch(/^Den yngste /);
    expect(drawn.target).toBeNull();
  });

  it("trækker aldrig den samme som sidst", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(drawChallenge([{ name: "A" }], CHALLENGES[0]).text).toBe(CHALLENGES[1].replaceAll("{navn}", "A"));
  });

  it("har intet mål, når udfordringen er for hele holdet", () => {
    const index = CHALLENGES.findIndex((c) => !c.includes("{navn}"));
    vi.spyOn(Math, "random").mockReturnValue((index + 0.5) / CHALLENGES.length);
    const drawn = drawChallenge([{ name: "A" }]);
    expect(drawn.text).toBe(CHALLENGES[index]);
    expect(drawn.target).toBeNull();
  });
});

describe("navne med $", () => {
  it("sætter navnet ind, som det er", () => {
    const index = CHALLENGES.findIndex((c) => c.startsWith("{navn}"));
    vi.spyOn(Math, "random").mockReturnValue((index + 0.5) / CHALLENGES.length);
    for (const name of ["Ca$$h", "A$&B", "x$'y", "x$`y"]) {
      const drawn = drawChallenge([{ name }]);
      expect(drawn.text).toBe(name + CHALLENGES[index].slice("{navn}".length));
    }
  });
});

describe("needsVote", () => {
  it("springer afstemningen over, når der intet er at klare", () => {
    expect(needsVote("Ingen udfordring her. Nyd øllen.")).toBe(false);
    expect(needsVote(CHALLENGES[0])).toBe(true);
    expect(CHALLENGES.filter((c) => !needsVote(c))).toHaveLength(1);
  });
});
