import { beforeEach, describe, expect, it, vi } from "vitest";
import { readName, saveName } from "./name";
import { forgetCrawl, readRecent, rememberCrawl } from "./recent";
import { memoryStorage } from "./test-fixtures";

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
});

// Et privat vindue i Safari kaster ved hver adgang.
function brokenStorage() {
  const fail = () => {
    throw new Error("SecurityError");
  };
  vi.stubGlobal("localStorage", { getItem: fail, setItem: fail, removeItem: fail });
}

describe("name", () => {
  it("gemmer navnet uden mellemrum i enderne", () => {
    saveName("  Freja ");
    expect(storage.map.get("pubcrawl.name")).toBe("Freja");
    expect(readName()).toBe("Freja");
  });

  it("giver en tom streng, når intet er gemt", () => {
    expect(readName()).toBe("");
  });

  it("kaster aldrig, når lageret er spærret", () => {
    brokenStorage();
    expect(readName()).toBe("");
    expect(() => saveName("Freja")).not.toThrow();
  });
});

describe("recent", () => {
  it("lægger den nyeste tur øverst uden dubletter", () => {
    rememberCrawl({ code: "AAA111", name: "Første" });
    rememberCrawl({ code: "BBB222", name: "Anden" });
    rememberCrawl({ code: "AAA111", name: "Første igen" });
    expect(readRecent()).toEqual([
      { code: "AAA111", name: "Første igen" },
      { code: "BBB222", name: "Anden" },
    ]);
  });

  it("husker højst ti ture", () => {
    for (let i = 0; i < 12; i++) rememberCrawl({ code: `CODE${String(i).padStart(2, "0")}`, name: `Tur ${i}` });
    const list = readRecent();
    expect(list).toHaveLength(10);
    expect(list[0].code).toBe("CODE11");
  });

  it("glemmer en tur", () => {
    rememberCrawl({ code: "AAA111", name: "Første" });
    rememberCrawl({ code: "BBB222", name: "Anden" });
    forgetCrawl("AAA111");
    expect(readRecent().map((c) => c.code)).toEqual(["BBB222"]);
  });

  it("tåler ødelagt eller forkert data", () => {
    storage.map.set("pubcrawl.recent", "{ikke json");
    expect(readRecent()).toEqual([]);
    storage.map.set("pubcrawl.recent", JSON.stringify({ code: "AAA111" }));
    expect(readRecent()).toEqual([]);
  });

  it("kaster aldrig, når lageret er spærret", () => {
    brokenStorage();
    expect(readRecent()).toEqual([]);
    expect(() => rememberCrawl({ code: "AAA111", name: "x" })).not.toThrow();
    expect(() => forgetCrawl("AAA111")).not.toThrow();
  });
});
