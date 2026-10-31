import { describe, expect, it } from "vitest";
import { fitWithin, PHOTO_MAX_SIDE } from "./photo-image";

describe("fitWithin", () => {
  it("skalerer et telefonbillede ned til 1600 px på den længste side", () => {
    expect(PHOTO_MAX_SIDE).toBe(1600);
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("forstørrer aldrig et lille billede", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("runder til hele pixels og holder forholdet", () => {
    const { width, height } = fitWithin(4000, 2251);
    expect(width).toBe(1600);
    expect(height).toBe(900);
    expect(fitWithin(1601, 1001)).toEqual({ width: 1600, height: 1000 });
  });

  it("giver mindst én pixel på et meget smalt billede", () => {
    expect(fitWithin(10_000, 2)).toEqual({ width: 1600, height: 1 });
  });

  it("går aldrig over grænsen, heller ikke med skæve størrelser", () => {
    for (const [w, h] of [
      [3201, 1],
      [4095, 4094],
      [1601, 1599],
      [9999, 7777],
    ]) {
      const out = fitWithin(w, h);
      expect(Math.max(out.width, out.height)).toBe(1600);
    }
  });

  it("bruger en anden grænse, når den gives", () => {
    expect(fitWithin(1000, 500, 200)).toEqual({ width: 200, height: 100 });
  });
});
