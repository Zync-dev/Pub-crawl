import { describe, expect, it, vi } from "vitest";
import { createReporter, crawlCodeFromPath, describeError, LIMITS, type ErrorRow } from "./report-error";

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(options: { burst?: number; windowMs?: number } = {}) {
  let t = 0;
  const sent: ErrorRow[] = [];
  const report = createReporter({
    send: async (row) => void sent.push(row),
    now: () => t,
    ...options,
  });
  return { report, sent, tick: (ms: number) => (t += ms) };
}

describe("describeError", () => {
  it("læser besked, stak og digest fra en Error", () => {
    const error = Object.assign(new Error("Kunne ikke hente"), { digest: "abc123" });
    const { message, stack } = describeError(error);
    expect(message).toBe("Kunne ikke hente (digest abc123)");
    expect(stack).toContain("Kunne ikke hente");
  });

  it("klarer strenge, objekter og alt andet", () => {
    expect(describeError("øv")).toEqual({ message: "øv", stack: null });
    expect(describeError({ message: "fra supabase", code: "42501" }).message).toBe("fra supabase");
    expect(describeError(42).message).toBe("42");
    expect(describeError(undefined).message).toBe("undefined");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular).message).toBe("[object Object]");
  });

  it("afkorter besked og stak til databasens grænser", () => {
    const error = new Error("x".repeat(5000));
    error.stack = "s".repeat(9000);
    const { message, stack } = describeError(error);
    expect(message).toHaveLength(LIMITS.message);
    expect(stack).toHaveLength(LIMITS.stack);
  });
});

describe("crawlCodeFromPath", () => {
  it("finder koden i turens adresse", () => {
    expect(crawlCodeFromPath("/t/abc123")).toBe("ABC123");
    expect(crawlCodeFromPath("/t/ABC123/")).toBe("ABC123");
    expect(crawlCodeFromPath("/")).toBeNull();
    expect(crawlCodeFromPath("/t/ABC1234")).toBeNull();
  });
});

describe("createReporter", () => {
  it("sender en fejl med adresse og browser", async () => {
    vi.stubGlobal("window", { location: { pathname: "/t/redl42", href: "https://pub.example/t/redl42" } });
    vi.stubGlobal("navigator", { userAgent: "iPhone" });
    const { report, sent } = setup();
    expect(report(new Error("Bang"))).toBe(true);
    await flush();
    expect(sent).toEqual([
      expect.objectContaining({
        crawl_code: "REDL42",
        message: "Bang",
        url: "https://pub.example/t/redl42",
        user_agent: "iPhone",
      }),
    ]);
  });

  it("sender den samme besked én gang", async () => {
    const { report, sent, tick } = setup();
    report(new Error("Bang"));
    tick(10 * 60_000);
    expect(report(new Error("Bang"))).toBe(false);
    await flush();
    expect(sent).toHaveLength(1);
  });

  it("holder igen, når mange forskellige fejl kommer på én gang", async () => {
    const { report, sent, tick } = setup({ burst: 3, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) report(`fejl ${i}`);
    await flush();
    expect(sent).toHaveLength(3);
    tick(60_000);
    expect(report("fejl efter pausen")).toBe(true);
    // De droppede fejl må gerne sendes senere.
    expect(report("fejl 5")).toBe(true);
  });

  it("springer støj over", () => {
    const { report } = setup();
    expect(report(new Error("ResizeObserver loop completed with undelivered notifications."))).toBe(false);
    expect(report("Script error.")).toBe(false);
  });

  it("kaster aldrig, heller ikke når afsendelsen fejler", async () => {
    const report = createReporter({
      send: () => {
        throw new Error("offline");
      },
    });
    const evil = {
      get message() {
        throw new Error("ond getter");
      },
    };
    expect(() => report(new Error("Bang"))).not.toThrow();
    expect(() => report(evil)).not.toThrow();
    await flush();
  });
});
