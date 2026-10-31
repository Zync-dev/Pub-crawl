import { afterEach, describe, expect, it, vi } from "vitest";
import { CHALLENGES, drawChallenge } from "./challenges";
import { lastInBuyer, type Round } from "./rounds";
import { member } from "./test-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
});

const jonas = member("u1", "Jonas");
const mikkel = member("u2", "Mikkel");
const members = [jonas, mikkel];

function round(buyer_id: string, created_at: string): Round {
  return { id: `r-${created_at}`, crawl_id: "c1", stop_id: null, buyer_id, created_by: "u2", created_at };
}

describe("lastInBuyer", () => {
  const lastIn = { member: jonas, at: "2026-11-06T21:15:00.000+00:00" };

  it("foreslår den, der kom sidst med", () => {
    expect(lastInBuyer(lastIn, members, [], "u2")).toBe(jonas);
  });

  it("intet forslag uden opråb, eller når den sidste allerede er valgt", () => {
    expect(lastInBuyer(null, members, [], "u2")).toBeNull();
    expect(lastInBuyer(lastIn, members, [], "u1")).toBeNull();
  });

  it("intet forslag, når en omgang er givet efter opråbet", () => {
    expect(lastInBuyer(lastIn, members, [round("u2", "2026-11-06T21:20:00.000Z")], "u2")).toBeNull();
    expect(lastInBuyer(lastIn, members, [round("u2", "2026-11-06T21:00:00.000Z")], "u2")).toBe(jonas);
  });

  it("intet forslag, når den sidste er gået hjem", () => {
    expect(lastInBuyer(lastIn, [mikkel], [], "u2")).toBeNull();
  });
});

describe("drawChallenge med en udfyldt forrige", () => {
  it("trækker ikke den samme {navn}-udfordring igen", () => {
    const index = CHALLENGES.findIndex((c) => c.includes("{navn}"));
    const previous = CHALLENGES[index].replaceAll("{navn}", "Jonas");
    // Uden rettelsen pegede tallet på den samme skabelon igen, nu bare med et andet navn.
    vi.spyOn(Math, "random").mockReturnValue((index + 0.5) / CHALLENGES.length);
    const drawn = drawChallenge(members, previous);
    expect(drawn.text).not.toBe(previous);
    expect(drawn.text).not.toBe(CHALLENGES[index].replaceAll("{navn}", "Mikkel"));
  });
});
