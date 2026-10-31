import { describe, expect, it } from "vitest";
import { crawl, stop } from "./test-fixtures";
import { extendedArrival, formatClock, formatTime, remainingMs } from "./timer";

describe("remainingMs", () => {
  const arrived = "2026-11-06T20:00:00.000Z";
  const t = Date.parse(arrived);

  it("er null uden pub eller uden tjek ind", () => {
    expect(remainingMs(crawl({ arrived_at: arrived }), null, t)).toBeNull();
    expect(remainingMs(crawl(), stop("s1", 0), t)).toBeNull();
  });

  it("tæller ned fra pubbens minutter og bliver negativ bagefter", () => {
    const c = crawl({ arrived_at: arrived });
    expect(remainingMs(c, stop("s1", 0, 30), t + 10 * 60_000)).toBe(20 * 60_000);
    expect(remainingMs(c, stop("s1", 0, 30), t + 31 * 60_000)).toBe(-60_000);
  });
});

describe("formatClock", () => {
  it("skriver minutter og sekunder", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(1_500)).toBe("0:02");
  });

  it("viser overtid med plus", () => {
    expect(formatClock(-90_000)).toBe("+1:30");
  });
});

describe("formatTime", () => {
  it("skriver 24-timers tid med kolon", () => {
    expect(formatTime(new Date(2026, 10, 6, 21, 5).toISOString())).toBe("21:05");
    expect(formatTime(new Date(2026, 10, 6, 0, 0).toISOString())).toBe("00:00");
  });
});

describe("extendedArrival", () => {
  const arrived = "2026-11-06T20:00:00.000Z";
  const t = Date.parse(arrived);
  const s = stop("s1", 0, 30);

  it("lægger minutterne til, når der er tid tilbage", () => {
    const next = extendedArrival(arrived, 30, 10, t + 25 * 60_000);
    expect(remainingMs(crawl({ arrived_at: next }), s, t + 25 * 60_000)).toBe(15 * 60_000);
  });

  it("giver de fulde minutter fra nu, når tiden er gået", () => {
    const now = t + 55 * 60_000; // +25:00 over tiden
    const next = extendedArrival(arrived, 30, 10, now);
    expect(remainingMs(crawl({ arrived_at: next }), s, now)).toBe(10 * 60_000);
  });
});
