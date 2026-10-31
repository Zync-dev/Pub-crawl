import { describe, expect, it, vi } from "vitest";
import { newId } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
  it("bruger crypto.randomUUID, når den findes", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-4333-8444-555555555555" });
    expect(newId()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("laver selv en v4 af tilfældige bytes uden https", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xff);
        return bytes;
      },
    });
    const id = newId();
    expect(id).toMatch(V4);
    expect(id).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  it("sætter version og variant, selv når alle bytes er nul", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes });
    expect(newId()).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("falder tilbage til Math.random, når crypto mangler helt", () => {
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(newId()).toBe("80808080-8080-4080-8080-808080808080");
  });

  it("falder tilbage, når randomUUID kaster", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new Error("SecurityError");
      },
      getRandomValues: (bytes: Uint8Array) => bytes.fill(7),
    });
    expect(newId()).toMatch(V4);
  });

  it("giver forskellige id'er hver gang", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });
});
