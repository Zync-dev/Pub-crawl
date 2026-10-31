import { describe, expect, it } from "vitest";
import { formatPubs, nextStopOnRoute } from "./route";
import { stop } from "./test-fixtures";

const visited = (id: string, position: number) => ({ ...stop(id, position), visited_at: "2026-11-06T20:00:00.000Z" });

describe("nextStopOnRoute", () => {
  it("er den første pub, I ikke har været på, også før den, I står på", () => {
    // A er sat til Ikke besøgt, mens I står på C.
    const stops = [stop("a", 0), visited("b", 1), visited("c", 2), stop("d", 3)];
    expect(nextStopOnRoute(stops, "c")?.id).toBe("a");
  });

  it("springer den pub over, I står på", () => {
    const stops = [visited("a", 0), stop("b", 1), stop("c", 2)];
    expect(nextStopOnRoute(stops, "b")?.id).toBe("c");
  });

  it("er null, når ruten er gået", () => {
    expect(nextStopOnRoute([visited("a", 0)], "a")).toBeNull();
  });
});

describe("formatPubs", () => {
  it("bøjer pub", () => {
    expect(formatPubs(1)).toBe("1 pub");
    expect(formatPubs(0)).toBe("0 pubber");
    expect(formatPubs(6)).toBe("6 pubber");
  });
});
