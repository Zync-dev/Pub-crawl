import { describe, expect, it } from "vitest";
import { HEARTBEAT_MS, MIN_INTERVAL_MS, shouldSendPosition } from "./position-throttle";

const here = { lat: 55.676, lng: 12.568 };
// Ca. 111 m mod nord.
const far = { lat: 55.677, lng: 12.568 };
const t = 1_000_000;

describe("shouldSendPosition", () => {
  it("sender den første position", () => {
    expect(shouldSendPosition(null, here, 10, t)).toBe(true);
  });

  it("sender aldrig oftere end minimumsintervallet, heller ikke ved et stort hop", () => {
    expect(shouldSendPosition({ at: t, pos: here }, far, 10, t + MIN_INTERVAL_MS - 1)).toBe(false);
  });

  it("sender ved en rigtig flytning efter minimumsintervallet", () => {
    expect(shouldSendPosition({ at: t, pos: here }, far, 10, t + MIN_INTERVAL_MS)).toBe(true);
  });

  it("tæller ikke et hop, der er mindre end målingens usikkerhed", () => {
    expect(shouldSendPosition({ at: t, pos: here }, far, 150, t + MIN_INTERVAL_MS)).toBe(false);
  });

  it("sender alligevel, når hjerteslaget er gået", () => {
    expect(shouldSendPosition({ at: t, pos: here }, here, 150, t + HEARTBEAT_MS)).toBe(true);
  });
});
