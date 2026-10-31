import { afterEach, describe, expect, it, vi } from "vitest";
import { CHALLENGES, drawChallenge } from "./challenges";

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
    const drawn = drawChallenge(["Freja", "Mikkel"]);
    expect(drawn).toBe(CHALLENGES[index].replaceAll("{navn}", "Mikkel"));
    expect(drawn).not.toContain("{navn}");
  });

  it("bruger Den yngste, når ingen er med", () => {
    const index = CHALLENGES.findIndex((c) => c.startsWith("{navn}"));
    vi.spyOn(Math, "random").mockReturnValue((index + 0.5) / CHALLENGES.length);
    expect(drawChallenge([])).toMatch(/^Den yngste /);
  });

  it("trækker aldrig den samme som sidst", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(drawChallenge(["A"], CHALLENGES[0])).toBe(CHALLENGES[1].replaceAll("{navn}", "A"));
  });
});
