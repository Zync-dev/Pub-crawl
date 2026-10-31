import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "./test-fixtures";

// install.ts husker Androids dialog i modulet, så hver test får sit eget.
async function load() {
  vi.resetModules();
  return import("./install");
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";

function device(userAgent: string, { maxTouchPoints = 0, standalone }: { maxTouchPoints?: number; standalone?: boolean } = {}) {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints, standalone });
}

// Et vindue, hvor de nævnte display-modes matcher. Det er også et EventTarget, så installér-hændelserne kan sendes.
function windowWith(modes: string[] = [], matchMedia?: (q: string) => { matches: boolean }) {
  const win = new EventTarget() as EventTarget & { matchMedia: (q: string) => { matches: boolean } };
  win.matchMedia = matchMedia ?? ((q: string) => ({ matches: modes.some((m) => q.includes(m)) }));
  vi.stubGlobal("window", win);
  return win;
}

function promptEvent(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

beforeEach(() => {
  device(WINDOWS);
  windowWith();
});

describe("installPlatform", () => {
  it("genkender iPhone og Android", async () => {
    const { installPlatform } = await load();
    device(IPHONE, { maxTouchPoints: 5 });
    expect(installPlatform()).toBe("ios");
    device(ANDROID, { maxTouchPoints: 5 });
    expect(installPlatform()).toBe("android");
  });

  it("ser en iPad med iPadOS som iOS, men en Mac som andet", async () => {
    const { installPlatform } = await load();
    device(MAC, { maxTouchPoints: 5 });
    expect(installPlatform()).toBe("ios");
    device(MAC);
    expect(installPlatform()).toBe("other");
    device(WINDOWS);
    expect(installPlatform()).toBe("other");
  });
});

describe("installBrowser", () => {
  it("genkender browseren inde i Messenger, Instagram og Googles app", async () => {
    const { installBrowser } = await load();
    for (const ua of [
      `${IPHONE} [FBAN/MessengerForiOS;FBAV/480.0]`,
      `${IPHONE} Instagram 350.0.0`,
      `${IPHONE} GSA/350.0.0 Safari/604.1`,
      "Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
    ]) {
      device(ua, { maxTouchPoints: 5 });
      expect(installBrowser()).toBe("in-app");
    }
  });

  it("skelner Chrome og andre browsere på iPhone fra Safari", async () => {
    const { installBrowser } = await load();
    device(`${IPHONE} CriOS/130.0 Safari/604.1`, { maxTouchPoints: 5 });
    expect(installBrowser()).toBe("chrome-ios");
    device(`${IPHONE} FxiOS/132.0 Safari/605.1.15`, { maxTouchPoints: 5 });
    expect(installBrowser()).toBe("ios-other");
    device(`${IPHONE} Version/26.0 Safari/604.1`, { maxTouchPoints: 5 });
    expect(installBrowser()).toBe("default");
  });

  it("genkender Samsung Internet og ser almindelig Chrome som standard", async () => {
    const { installBrowser } = await load();
    device(ANDROID.replace("Chrome/130.0.0.0", "SamsungBrowser/27.0 Chrome/125.0.0.0"), { maxTouchPoints: 5 });
    expect(installBrowser()).toBe("samsung");
    device(ANDROID, { maxTouchPoints: 5 });
    expect(installBrowser()).toBe("default");
    vi.stubGlobal("navigator", undefined);
    expect(installBrowser()).toBe("default");
  });
});

describe("isStandalone", () => {
  it("er installeret, når appen kører som standalone eller fullscreen", async () => {
    const { isStandalone } = await load();
    windowWith(["standalone"]);
    expect(isStandalone()).toBe(true);
    windowWith(["fullscreen"]);
    expect(isStandalone()).toBe(true);
    windowWith([]);
    expect(isStandalone()).toBe(false);
  });

  it("bruger navigator.standalone på ældre iPhones", async () => {
    const { isStandalone } = await load();
    device(IPHONE, { standalone: true });
    expect(isStandalone()).toBe(true);
    device(IPHONE, { standalone: false });
    expect(isStandalone()).toBe(false);
  });

  it("kaster ikke, når matchMedia fejler", async () => {
    const { isStandalone } = await load();
    windowWith([], () => {
      throw new Error("nope");
    });
    expect(isStandalone()).toBe(false);
    device(IPHONE, { standalone: true });
    expect(isStandalone()).toBe(true);
  });

  it("er falsk på serveren", async () => {
    const { isStandalone, installPlatform } = await load();
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("navigator", undefined);
    expect(isStandalone()).toBe(false);
    expect(installPlatform()).toBe("other");
  });
});

describe("Androids installér-dialog", () => {
  it("fanger dialogen og viser den på et tryk", async () => {
    const { listenForInstallPrompt, promptInstall } = await load();
    const win = windowWith();
    const stop = listenForInstallPrompt();
    const event = promptEvent("accepted");
    win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await expect(promptInstall()).resolves.toBe(true);
    expect(event.prompt).toHaveBeenCalledOnce();
    // Dialogen kan kun bruges én gang.
    await expect(promptInstall()).resolves.toBe(false);
    stop();
  });

  it("giver falsk, når brugeren siger nej", async () => {
    const { listenForInstallPrompt, promptInstall } = await load();
    const win = windowWith();
    const stop = listenForInstallPrompt();
    win.dispatchEvent(promptEvent("dismissed"));
    await expect(promptInstall()).resolves.toBe(false);
    stop();
  });

  it("glemmer dialogen, når appen er installeret", async () => {
    const { listenForInstallPrompt, promptInstall } = await load();
    const win = windowWith();
    const stop = listenForInstallPrompt();
    win.dispatchEvent(promptEvent("accepted"));
    win.dispatchEvent(new Event("appinstalled"));
    await expect(promptInstall()).resolves.toBe(false);
    stop();
  });

  it("lytter ikke længere efter oprydningen", async () => {
    const { listenForInstallPrompt, promptInstall } = await load();
    const win = windowWith();
    listenForInstallPrompt()();
    const event = promptEvent("accepted");
    win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    await expect(promptInstall()).resolves.toBe(false);
  });

  it("giver falsk, når dialogen fejler", async () => {
    const { listenForInstallPrompt, promptInstall } = await load();
    const win = windowWith();
    const stop = listenForInstallPrompt();
    const event = promptEvent("accepted");
    event.prompt = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    win.dispatchEvent(event);
    await expect(promptInstall()).resolves.toBe(false);
    stop();
  });
});

describe("installDismissed og dismissInstall", () => {
  it("husker, at kortet er lukket", async () => {
    const { dismissInstall, installDismissed } = await load();
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    expect(installDismissed()).toBe(false);
    dismissInstall();
    expect(storage.map.get("pc-install-dismissed")).toBe("1");
    expect(installDismissed()).toBe(true);
  });

  it("kaster ikke, når lageret er spærret", async () => {
    const { dismissInstall, installDismissed } = await load();
    const fail = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail });
    expect(installDismissed()).toBe(false);
    expect(() => dismissInstall()).not.toThrow();
  });
});
