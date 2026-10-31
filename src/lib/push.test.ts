import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// push.ts læser VAPID-nøglen, når modulet indlæses, så hver test indlæser det på ny.
const getSession = vi.fn();
const deleteResult: { error: { message: string } | null } = { error: null };
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    auth: { getSession },
    from: () => ({ delete: () => ({ eq: async () => deleteResult }) }),
  }),
}));

async function load(vapid = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U") {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", vapid);
  vi.resetModules();
  return import("./push");
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

// Et vindue med eller uden det, push kræver.
function browser({ capable, userAgent = IPHONE, standalone = false }: { capable: boolean; userAgent?: string; standalone?: boolean }) {
  const nav: Record<string, unknown> = { userAgent, maxTouchPoints: 5, standalone };
  const win: Record<string, unknown> = { matchMedia: () => ({ matches: standalone }) };
  if (capable) {
    nav.serviceWorker = {};
    win.PushManager = function PushManager() {};
    win.Notification = { permission: "granted" };
  }
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("window", win);
}

beforeEach(() => {
  getSession.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("keyBytes", () => {
  it("læser base64url uden padding", async () => {
    const { keyBytes } = await load();
    expect([...keyBytes("-_8")]).toEqual([0xfb, 0xff]);
    expect([...keyBytes("AQID")]).toEqual([1, 2, 3]);
    expect([...keyBytes("AQ")]).toEqual([1]);
    expect([...keyBytes("AQI")]).toEqual([1, 2]);
  });

  it("godtager også padding og almindelig base64", async () => {
    const { keyBytes } = await load();
    expect([...keyBytes("AQ==")]).toEqual([1]);
    expect([...keyBytes("+/8")]).toEqual([0xfb, 0xff]);
  });

  it("giver de 65 bytes i en VAPID-nøgle", async () => {
    const { keyBytes } = await load();
    const bytes = keyBytes("BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U");
    expect(bytes).toHaveLength(65);
    // En ukomprimeret P-256-nøgle starter med 0x04.
    expect(bytes[0]).toBe(4);
  });
});

describe("pushSupport", () => {
  it("er ikke sat op uden VAPID-nøgle", async () => {
    const { pushSupport } = await load("");
    browser({ capable: true });
    expect(pushSupport()).toBe("unconfigured");
  });

  it("virker, når browseren kan", async () => {
    const { pushSupport } = await load();
    browser({ capable: true });
    expect(pushSupport()).toBe("supported");
  });

  it("beder iPhone om at lægge appen på hjemmeskærmen først", async () => {
    const { pushSupport } = await load();
    browser({ capable: false });
    expect(pushSupport()).toBe("needs-install");
    browser({ capable: false, standalone: true });
    expect(pushSupport()).toBe("unsupported");
  });

  it("er ikke understøttet i andre browsere uden push", async () => {
    const { pushSupport } = await load();
    browser({ capable: false, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/130.0" });
    expect(pushSupport()).toBe("unsupported");
  });

  it("er ikke understøttet på serveren", async () => {
    const { pushSupport } = await load();
    vi.stubGlobal("window", undefined);
    expect(pushSupport()).toBe("unsupported");
  });
});

describe("pushPermission", () => {
  it("læser tilladelsen og giver null uden Notification", async () => {
    const { pushPermission } = await load();
    browser({ capable: true });
    vi.stubGlobal("Notification", { permission: "denied" });
    expect(pushPermission()).toBe("denied");
    browser({ capable: false });
    expect(pushPermission()).toBeNull();
  });
});

describe("notifyCrew", () => {
  it("sender kun slags og nøgle med login til /api/push", async () => {
    const { notifyCrew } = await load();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    const fetchMock = vi.fn(async () => Response.json({ sent: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(notifyCrew("c1", "timer", "s1:123")).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/push");
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
    expect(JSON.parse(String(init.body))).toEqual({ crawlId: "c1", kind: "timer", key: "s1:123" });
  });

  it("sender intet uden login eller uden VAPID-nøgle", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    getSession.mockResolvedValue({ data: { session: null } });
    // Uden login kan det lykkes senere. Uden nøgle er der intet at prøve igen.
    await expect((await load()).notifyCrew("c1", "timer", "k")).resolves.toBe(false);
    await expect((await load("")).notifyCrew("c1", "timer", "k")).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sluger fejl og siger, om det skal prøves igen", async () => {
    const { notifyCrew } = await load();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(notifyCrew("c1", "move", "k")).resolves.toBe(false);
    for (const [status, done] of [[409, false], [429, false], [500, false], [401, false], [400, true], [403, true]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status })));
      await expect(notifyCrew("c1", "timer", "k")).resolves.toBe(done);
    }
  });
});

describe("disablePush", () => {
  it("beholder abonnementet på telefonen, når serveren ikke fik sletningen", async () => {
    const { disablePush } = await load();
    browser({ capable: true, userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/130.0.0.0 Mobile" });
    const unsubscribe = vi.fn(async () => true);
    const sub = { endpoint: "https://push.example.com/x", unsubscribe };
    (navigator as unknown as Record<string, unknown>).serviceWorker = {
      getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }),
    };
    deleteResult.error = { message: "Failed to fetch" };
    await expect(disablePush()).resolves.toBe(false);
    expect(unsubscribe).not.toHaveBeenCalled();
    deleteResult.error = null;
    await expect(disablePush()).resolves.toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
