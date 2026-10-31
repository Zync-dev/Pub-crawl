import { describe, expect, it } from "vitest";
import type { StopRating } from "./reviews-types";
import { formatStars, formatSummary, summarize } from "./use-reviews";

function rating(stop_id: string, user_id: string, stars: number): StopRating {
  const at = "2026-11-06T21:00:00.000Z";
  return { stop_id, crawl_id: "c1", user_id, stars, created_at: at, updated_at: at };
}

describe("summarize", () => {
  const ratings = [rating("s1", "u1", 5), rating("s1", "u2", 4), rating("s1", "u3", 4), rating("s2", "u1", 1)];

  it("giver gennemsnit, antal og din egen stjerne for pubben", () => {
    expect(summarize(ratings, "s1", "u2")).toEqual({ average: 13 / 3, count: 3, mine: 4 });
    expect(summarize(ratings, "s2", "u2")).toEqual({ average: 1, count: 1, mine: null });
  });

  it("giver null for en pub uden stjerner", () => {
    expect(summarize(ratings, "s3", "u1")).toBeNull();
    expect(summarize([], "s1", null)).toBeNull();
  });
});

describe("formatSummary", () => {
  it("skriver tallet med komma og bøjer stemme", () => {
    expect(formatStars(13 / 3)).toBe("4,3");
    expect(formatStars(4)).toBe("4,0");
    expect(formatSummary({ average: 13 / 3, count: 3, mine: null })).toBe("4,3 · 3 stemmer");
    expect(formatSummary({ average: 5, count: 1, mine: 5 })).toBe("5,0 · 1 stemme");
  });
});
