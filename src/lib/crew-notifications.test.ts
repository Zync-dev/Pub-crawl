import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyCrew } from "./push";
import { crawl, stop } from "./test-fixtures";
import { arrivalKey, deadlineKey, notifyMove, RETRY_MS, retryUntilDone } from "./use-crew-notifications";

vi.mock("./push", () => ({ notifyCrew: vi.fn(async () => true), syncPush: vi.fn(async () => {}) }));

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

describe("deadlineKey", () => {
  it("er tidspunktet, hvor tiden går, og ens for lokal tid og databasens tid", () => {
    const key = deadlineKey("s1", "2026-11-06T21:15:00.123Z", 30);
    expect(key).toBe(`s1:${Date.UTC(2026, 10, 6, 21, 45, 0, 123)}`);
    expect(deadlineKey("s1", "2026-11-06T21:15:00.123456+00:00", 30)).toBe(key);
  });

  it("giver en ny nøgle, når minutterne ved pubben ændres i Ruten", () => {
    expect(deadlineKey("s1", "2026-11-06T21:15:00Z", 30)).not.toBe(deadlineKey("s1", "2026-11-06T21:15:00Z", 40));
  });
});

describe("retryUntilDone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prøver igen, indtil det lykkes, og stopper så", async () => {
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    const done = vi.fn();
    retryUntilDone(send, done);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(RETRY_MS * 2);
    expect(send).toHaveBeenCalledTimes(3);
    expect(done).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("stopper, når der ryddes op, og når tiden er gået", async () => {
    const send = vi.fn(async () => false);
    const stop = retryUntilDone(send);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    stop();
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(send).toHaveBeenCalledTimes(2);

    const late = vi.fn(async () => false);
    retryUntilDone(late, undefined, RETRY_MS * 2 + 1);
    await vi.advanceTimersByTimeAsync(RETRY_MS * 5);
    expect(late).toHaveBeenCalledTimes(3);
  });

  it("sender ikke to gange samtidig", async () => {
    let finish: (v: boolean) => void = () => {};
    const send = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
    retryUntilDone(send);
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(send).toHaveBeenCalledTimes(1);
    finish(true);
  });
});

describe("notifyMove", () => {
  const from = { ...stop("s1", 0), name: "Bobi Bar" };
  const here = crawl({ current_stop_id: "s1", arrived_at: "2026-11-06T21:15:00.000Z" });

  it("siger kun, hvilken pub holdet forlod. Teksten skriver serveren", () => {
    notifyMove(here, from);
    expect(notifyCrew).toHaveBeenCalledWith("c1", "move", arrivalKey("s1", here.arrived_at!));
  });

  it("sender intet, når holdet ikke er tjekket ind", () => {
    vi.mocked(notifyCrew).mockClear();
    notifyMove(crawl(), from);
    expect(notifyCrew).not.toHaveBeenCalled();
  });
});
