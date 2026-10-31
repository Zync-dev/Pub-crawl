import { describe, expect, it } from "vitest";
import { placeMembers, staleLabel } from "./map-markers";
import type { Member } from "./types";

const NOW = Date.parse("2026-11-06T21:00:00Z");
const PUB = { lat: 55.6761, lng: 12.5683 };

function member(user_id: string, lat: number | null, lng: number | null, minutesAgo = 1): Member {
  return {
    crawl_id: "c",
    user_id,
    name: user_id,
    color: 0,
    lat,
    lng,
    accuracy: 10,
    located_at: lat === null ? null : new Date(NOW - minutesAgo * 60_000).toISOString(),
    joined_at: "2026-11-06T18:00:00Z",
  };
}

describe("placeMembers", () => {
  it("samler dem ved den nuværende pub og giver resten hver sin nål", () => {
    const { here, away } = placeMembers(
      [member("mikkel", 55.67612, 12.56832), member("sofie", 55.6763, 12.5685), member("jonas", 55.68, 12.58)],
      { userId: "lukas", myPosition: null, now: NOW, currentStop: PUB },
    );
    expect(here.map((p) => p.member.user_id)).toEqual(["mikkel", "sofie"]);
    expect(away.map((p) => p.member.user_id)).toEqual(["jonas"]);
  });

  it("springer gamle og manglende positioner over og markerer de ældre end ti minutter", () => {
    const { here, away } = placeMembers(
      [member("a", 55.68, 12.58, 3), member("b", 55.68, 12.58, 40), member("c", 55.68, 12.58, 150), member("d", null, null)],
      { userId: "lukas", myPosition: null, now: NOW, currentStop: null },
    );
    expect(here).toEqual([]);
    expect(away.map((p) => [p.member.user_id, p.stale])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it("bruger din GPS-position og tegner dig ikke som nål, når den findes", () => {
    const me = member("lukas", 55.7, 12.6, 30);
    const atPub = placeMembers([me], { userId: "lukas", myPosition: PUB, now: NOW, currentStop: PUB });
    expect(atPub.here.map((p) => [p.isMe, p.stale])).toEqual([[true, false]]);
    const elsewhere = placeMembers([me], { userId: "lukas", myPosition: { lat: 55.69, lng: 12.59 }, now: NOW, currentStop: PUB });
    expect(elsewhere).toEqual({ here: [], away: [] });
    const noGps = placeMembers([me], { userId: "lukas", myPosition: null, now: NOW, currentStop: PUB });
    expect(noGps.away.map((p) => p.isMe)).toEqual([true]);
  });
});

describe("staleLabel", () => {
  it("runder ned til fem minutter og hele timer", () => {
    expect(staleLabel(12 * 60_000)).toBe("10 min.");
    expect(staleLabel(44 * 60_000 + 59_000)).toBe("40 min.");
    expect(staleLabel(95 * 60_000)).toBe("1 t.");
  });
});
