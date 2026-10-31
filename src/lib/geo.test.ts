import { describe, expect, it } from "vitest";
import { DEFAULT_CENTER, distanceMeters, formatAgo, formatDistance, walkingMinutes } from "./geo";

describe("distanceMeters", () => {
  it("er nul for samme punkt", () => {
    expect(distanceMeters(DEFAULT_CENTER, DEFAULT_CENTER)).toBe(0);
  });

  it("måler en breddegrad til ca. 111 km", () => {
    const d = distanceMeters({ lat: 55, lng: 12 }, { lat: 56, lng: 12 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it("er symmetrisk", () => {
    const a = { lat: 55.6761, lng: 12.5683 };
    const b = { lat: 55.6867, lng: 12.5701 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe("formatDistance og walkingMinutes", () => {
  it("runder meter til nærmeste ti", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(234)).toBe("230 m");
    expect(formatDistance(995)).toBe("1000 m");
  });

  it("skriver kilometer med dansk komma", () => {
    expect(formatDistance(1000)).toBe("1 km");
    expect(formatDistance(1250)).toBe("1,3 km");
  });

  it("går mindst ét minut", () => {
    expect(walkingMinutes(0)).toBe(1);
    expect(walkingMinutes(800)).toBe(10);
  });
});

describe("formatAgo", () => {
  const now = Date.parse("2026-11-06T21:00:00.000Z");
  const ago = (s: number) => new Date(now - s * 1000).toISOString();

  it("siger lige nu under et minut, også for tider i fremtiden", () => {
    expect(formatAgo(ago(59), now)).toBe("lige nu");
    expect(formatAgo(ago(-30), now)).toBe("lige nu");
  });

  it("skriver minutter og timer", () => {
    expect(formatAgo(ago(5 * 60), now)).toBe("5 min. siden");
    expect(formatAgo(ago(2 * 3600), now)).toBe("2 t. siden");
  });
});
