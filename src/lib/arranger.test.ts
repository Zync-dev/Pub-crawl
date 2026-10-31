import { describe, expect, it } from "vitest";
import { arrangerErrorText, canEditRoute, isArranger, isRouteLocked, ROUTE_LOCKED_TEXT } from "./arranger";
import { crawl } from "./test-fixtures";
import type { Crawl } from "./types";

const locked = (value: boolean | undefined) => ({ ...crawl(), route_locked: value }) as Crawl;

describe("arrangøren og den låste rute", () => {
  it("er den, der står som created_by", () => {
    expect(isArranger(crawl(), "u1")).toBe(true);
    expect(isArranger(crawl(), "u2")).toBe(false);
  });

  it("er åben uden migration 0009", () => {
    expect(isRouteLocked(crawl())).toBe(false);
    expect(isRouteLocked(locked(undefined))).toBe(false);
    expect(canEditRoute(crawl(), "u2")).toBe(true);
  });

  it("lader kun arrangøren rette en låst rute", () => {
    expect(isRouteLocked(locked(true))).toBe(true);
    expect(canEditRoute(locked(true), "u1")).toBe(true);
    expect(canEditRoute(locked(true), "u2")).toBe(false);
    expect(canEditRoute(locked(false), "u2")).toBe(true);
  });
});

describe("arrangerErrorText", () => {
  it("oversætter databasens fejlkoder", () => {
    expect(arrangerErrorText({ message: "not_arranger" })).toBe("Det kan kun arrangøren.");
    expect(arrangerErrorText({ message: "cannot_remove_self" })).toBe("Du kan ikke fjerne dig selv.");
    expect(arrangerErrorText(new Error("route_locked"))).toBe(ROUTE_LOCKED_TEXT);
    expect(arrangerErrorText("member_not_found")).toBe("Personen er ikke længere på holdet.");
  });

  it("falder tilbage til forbindelsen", () => {
    expect(arrangerErrorText({ message: "fetch failed" })).toBe("Det blev ikke gemt. Tjek forbindelsen.");
    expect(arrangerErrorText(null)).toBe("Det blev ikke gemt. Tjek forbindelsen.");
  });
});
