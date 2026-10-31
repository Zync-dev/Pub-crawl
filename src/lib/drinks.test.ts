import { describe, expect, it } from "vitest";
import { DRINK_BY_KIND, DRINK_KINDS, formatUnits } from "./drinks";

describe("DRINK_KINDS", () => {
  it("har hver slags én gang og holder sig inden for databasens grænser", () => {
    expect(new Set(DRINK_KINDS.map((d) => d.kind)).size).toBe(DRINK_KINDS.length);
    for (const d of DRINK_KINDS) {
      expect(d.units).toBeGreaterThanOrEqual(0);
      expect(d.units).toBeLessThanOrEqual(5);
      // numeric(3, 1) i databasen.
      expect(Math.abs(d.units * 10 - Math.round(d.units * 10))).toBeLessThan(1e-9);
    }
  });

  it("tæller vand som nul", () => {
    expect(DRINK_BY_KIND.water.units).toBe(0);
    expect(DRINK_BY_KIND.draft.label).toBe("Fadøl");
  });
});

describe("formatUnits", () => {
  it("skriver én decimal med dansk komma", () => {
    expect(formatUnits(3)).toBe("3");
    expect(formatUnits(2.5)).toBe("2,5");
    expect(formatUnits(1.25)).toBe("1,3");
  });
});
