import { describe, expect, it } from "vitest";
import {
  allInToastStep,
  isRollCallOpen,
  joinNames,
  LAST_IN_SHOW_MS,
  lastIn,
  ROLL_CALL_MAX_MS,
  rollCallEndedAt,
  type RollCall,
  type RollCallAnswer,
} from "./roll-call";
import { member } from "./test-fixtures";

const START = "2026-11-06T21:00:00.000Z";
const t0 = Date.parse(START);

function call(patch: Partial<RollCall> = {}): RollCall {
  return {
    id: "r1",
    crawl_id: "c1",
    started_by: "u1",
    from_stop_id: "s1",
    to_stop_id: "s2",
    created_at: START,
    closed_at: null,
    ...patch,
  };
}

function answer(user_id: string, answered_at: string): RollCallAnswer {
  return { roll_call_id: "r1", user_id, crawl_id: "c1", answered_at };
}

const crew = [member("u1", "Lukas"), member("u2", "Mikkel"), member("u3", "Jonas")];

describe("isRollCallOpen", () => {
  it("er åbent, indtil det lukkes eller er 20 minutter gammelt", () => {
    expect(isRollCallOpen(call(), t0)).toBe(true);
    expect(isRollCallOpen(call(), t0 + ROLL_CALL_MAX_MS - 1)).toBe(true);
    expect(isRollCallOpen(call(), t0 + ROLL_CALL_MAX_MS)).toBe(false);
    expect(isRollCallOpen(call({ closed_at: "2026-11-06T21:01:00.000Z" }), t0)).toBe(false);
    expect(isRollCallOpen(null, t0)).toBe(false);
  });

  it("forstår databasens tidsformat", () => {
    expect(isRollCallOpen(call({ created_at: "2026-11-06T21:00:00.123456+00:00" }), t0 + 60_000)).toBe(true);
  });
});

describe("rollCallEndedAt", () => {
  it("er lukketiden, når det blev lukket", () => {
    expect(rollCallEndedAt(call({ closed_at: "2026-11-06T21:04:00.000Z" }))).toBe(t0 + 4 * 60_000);
  });

  it("er udløbet, når ingen lukkede det", () => {
    expect(rollCallEndedAt(call())).toBe(t0 + ROLL_CALL_MAX_MS);
  });

  it("er aldrig senere end udløbet, selv om det blev lukket bagefter", () => {
    expect(rollCallEndedAt(call({ closed_at: "2026-11-06T22:00:00.000Z" }))).toBe(t0 + ROLL_CALL_MAX_MS);
  });

  it("viser Sidst med i 10 minutter efter", () => {
    expect(LAST_IN_SHOW_MS).toBe(10 * 60_000);
  });
});

describe("lastIn", () => {
  it("er null, når kun den, der startede, har svaret", () => {
    expect(lastIn([answer("u1", START)], crew)).toBeNull();
    expect(lastIn([], crew)).toBeNull();
  });

  it("finder den, der svarede sidst", () => {
    const last = lastIn(
      [answer("u1", START), answer("u3", "2026-11-06T21:03:00.000Z"), answer("u2", "2026-11-06T21:02:00.000Z")],
      crew,
    );
    expect(last?.member.name).toBe("Jonas");
    expect(last?.at).toBe("2026-11-06T21:03:00.000Z");
  });

  it("sammenligner tider som tid, også når formaterne er blandet", () => {
    // Vores eget svar skrives "…Z", databasens "…+00:00" og uden decimaler, når de er nul.
    const mine = answer("u2", "2026-11-06T21:02:00.500Z");
    expect(lastIn([answer("u1", START), mine, answer("u3", "2026-11-06T21:02:00+00:00")], crew)?.member.name).toBe(
      "Mikkel",
    );
    expect(
      lastIn([answer("u1", START), mine, answer("u3", "2026-11-06T21:02:00.612345+00:00")], crew)?.member.name,
    ).toBe("Jonas");
  });

  it("springer folk over, der er gået hjem", () => {
    const answers = [
      answer("u1", START),
      answer("u2", "2026-11-06T21:02:00.000Z"),
      answer("gone", "2026-11-06T21:05:00.000Z"),
    ];
    expect(lastIn(answers, crew)?.member.name).toBe("Mikkel");
    // Er der kun én tilbage på holdet, der har svaret, er der ingen "sidst med".
    expect(lastIn([answer("u1", START), answer("gone", "2026-11-06T21:05:00.000Z")], crew)).toBeNull();
  });
});

describe("joinNames", () => {
  it("skriver navnene som en sætning", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Jonas"])).toBe("Jonas");
    expect(joinNames(["Jonas", "Mikkel"])).toBe("Jonas og Mikkel");
    expect(joinNames(["Jonas", "Mikkel", "Freja"])).toBe("Jonas, Mikkel og Freja");
    expect(joinNames(["Jonas", "Mikkel", "Freja", "Bo"])).toBe("Jonas, Mikkel og 2 til");
  });
});

describe("allInToastStep", () => {
  const open = { id: "r1", open: true, closed: false, everyoneIn: false };
  const closedAll = { id: "r1", open: false, closed: true, everyoneIn: true };
  const closedMissing = { id: "r1", open: false, closed: true, everyoneIn: false };

  it("viser toasten, når et opråb, man så åbent, lukker med alle", () => {
    const seen = allInToastStep(null, open, t0).seen;
    expect(allInToastStep(seen, closedAll, t0 + 1000)).toEqual({ seen: null, toast: true });
  });

  it("venter et øjeblik på det sidste svar efter lukningen", () => {
    let seen = allInToastStep(null, open, t0).seen;
    seen = allInToastStep(seen, closedMissing, t0 + 100).seen;
    expect(allInToastStep(seen, closedAll, t0 + 900).toast).toBe(true);
  });

  it("glemmer et opråb, der blev lukket med nogen manglende", () => {
    let seen = allInToastStep(null, open, t0).seen;
    seen = allInToastStep(seen, closedMissing, t0 + 100).seen;
    // 40 minutter senere går den manglende hjem, så alle tilbageværende er med.
    expect(allInToastStep(seen, closedAll, t0 + 40 * 60_000)).toEqual({ seen: null, toast: false });
  });

  it("viser intet for et opråb, man aldrig så åbent", () => {
    expect(allInToastStep(null, closedAll, t0).toast).toBe(false);
  });
});
