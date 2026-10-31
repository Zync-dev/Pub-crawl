import { describe, expect, it, vi } from "vitest";
import { notifyCrew } from "./push";
import { crawl, stop } from "./test-fixtures";
import { arrivalKey, notifyMove } from "./use-crew-notifications";

vi.mock("./push", () => ({ notifyCrew: vi.fn(async () => {}), syncPush: vi.fn(async () => {}) }));

describe("arrivalKey", () => {
  it("giver samme nøgle for lokal tid og databasens tid", () => {
    const local = arrivalKey("s1", "2026-11-06T21:15:00.123Z");
    expect(arrivalKey("s1", "2026-11-06T21:15:00.123+00:00")).toBe(local);
    expect(arrivalKey("s1", "2026-11-06T21:15:00.123456+00:00")).toBe(local);
    expect(arrivalKey("s1", "2026-11-06T22:15:00.123+01:00")).toBe(local);
    expect(local).toBe(`s1:${Date.UTC(2026, 10, 6, 21, 15, 0, 123)}`);
  });

  it("giver en ny nøgle, når ankomsttiden flytter sig (Én til her)", () => {
    expect(arrivalKey("s1", "2026-11-06T21:15:00Z")).not.toBe(arrivalKey("s1", "2026-11-06T21:45:00Z"));
    expect(arrivalKey("s1", "2026-11-06T21:15:00Z")).not.toBe(arrivalKey("s2", "2026-11-06T21:15:00Z"));
  });
});

describe("notifyMove", () => {
  const from = { ...stop("s1", 0), name: "Bobi Bar" };
  const to = { ...stop("s2", 1), name: "Toga" };
  const here = crawl({ current_stop_id: "s1", arrived_at: "2026-11-06T21:15:00.000Z" });

  it("fortæller holdet, hvor de skal hen", () => {
    notifyMove(here, from, to);
    expect(notifyCrew).toHaveBeenCalledWith("c1", "move", arrivalKey("s1", here.arrived_at!), {
      title: "Holdet går videre til Toga",
      body: "Tjek ind, når du er der.",
      url: "/t/ABC123",
    });
  });

  it("siger, når ruten er gået", () => {
    notifyMove(here, from, null);
    expect(notifyCrew).toHaveBeenLastCalledWith("c1", "move", expect.any(String), {
      title: "Holdet går videre",
      body: "Ruten er gået. Bobi Bar var sidste pub.",
      url: "/t/ABC123",
    });
  });

  it("sender intet, når holdet ikke er tjekket ind", () => {
    vi.mocked(notifyCrew).mockClear();
    notifyMove(crawl(), from, to);
    expect(notifyCrew).not.toHaveBeenCalled();
  });
});
