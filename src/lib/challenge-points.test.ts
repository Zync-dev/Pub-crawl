import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { challengeOutcome, challengePoints, competitionRanks, requiredVotes } from "./challenge-points";
import { insertChallenge } from "./challenge-rows";
import type { Challenge, ChallengeVote } from "./games-types";

const people = [
  { user_id: "u1", name: "Lukas" },
  { user_id: "u2", name: "Mikkel" },
  { user_id: "u3", name: "Freja" },
];
const ids = new Set(people.map((p) => p.user_id));

function challenge(id: string, target_user_id: string | null = null): Challenge {
  return { id, crawl_id: "c1", stop_id: null, text: "Skål", target_user_id, created_at: "2026-11-06T20:00:00.000Z" };
}

function vote(challenge_id: string, user_id: string, done: boolean): ChallengeVote {
  return { challenge_id, crawl_id: "c1", user_id, done, voted_at: "2026-11-06T20:05:00.000Z" };
}

describe("requiredVotes", () => {
  it("kræver to stemmer, eller alle når I er færre", () => {
    expect(requiredVotes(0)).toBe(1);
    expect(requiredVotes(1)).toBe(1);
    expect(requiredVotes(2)).toBe(2);
    expect(requiredVotes(8)).toBe(2);
  });
});

describe("challengeOutcome", () => {
  it("tæller ikke, før der er stemmer nok", () => {
    const outcome = challengeOutcome("a", [vote("a", "u1", true)], ids);
    expect(outcome).toEqual({ done: 1, notDone: 0, total: 1, needed: 2, completed: false });
  });

  it("er klaret, når mindst halvdelen siger klaret", () => {
    expect(challengeOutcome("a", [vote("a", "u1", true), vote("a", "u2", false)], ids).completed).toBe(true);
    expect(
      challengeOutcome("a", [vote("a", "u1", true), vote("a", "u2", false), vote("a", "u3", false)], ids).completed,
    ).toBe(false);
  });

  it("springer stemmer over fra andre udfordringer og fra folk, der er gået hjem", () => {
    const outcome = challengeOutcome(
      "a",
      [vote("a", "u1", true), vote("b", "u2", true), vote("a", "gone", true), vote("a", "gone2", false)],
      ids,
    );
    expect(outcome.total).toBe(1);
    expect(outcome.completed).toBe(false);
  });

  it("klarer sig med én stemme, når man er alene", () => {
    expect(challengeOutcome("a", [vote("a", "u1", true)], new Set(["u1"])).completed).toBe(true);
  });
});

describe("challengePoints", () => {
  it("giver point til den, udfordringen var til", () => {
    const { scores, completed, total } = challengePoints(
      [challenge("a", "u2"), challenge("b", "u3")],
      [vote("a", "u1", true), vote("a", "u3", true), vote("b", "u1", false), vote("b", "u2", false)],
      people,
    );
    expect(completed).toBe(1);
    expect(total).toBe(2);
    expect(scores.map((s) => [s.member.name, s.points])).toEqual([
      ["Mikkel", 1],
      ["Freja", 0],
      ["Lukas", 0],
    ]);
  });

  it("giver alle på holdet et point for en fællesudfordring", () => {
    const { scores } = challengePoints([challenge("a")], [vote("a", "u1", true), vote("a", "u2", true)], people);
    expect(scores.map((s) => s.points)).toEqual([1, 1, 1]);
  });

  it("tæller en klaret udfordring til en, der er gået hjem, uden at give nogen point", () => {
    const { scores, completed } = challengePoints(
      [challenge("a", "gone")],
      [vote("a", "u1", true), vote("a", "u2", true)],
      people,
    );
    expect(completed).toBe(1);
    expect(scores.every((s) => s.points === 0)).toBe(true);
  });

  it("tæller ikke udfordringer fra fortrudte tjek ind i alt", () => {
    const { completed, total } = challengePoints(
      [challenge("undone"), challenge("real"), challenge("now")],
      [vote("real", "u1", true), vote("real", "u2", true)],
      people,
      "now",
    );
    expect(completed).toBe(1);
    expect(total).toBe(2);
  });

  it("sorterer efter point og derefter navn", () => {
    const { scores } = challengePoints([], [], [
      { user_id: "a", name: "Åse" },
      { user_id: "b", name: "Bo" },
    ]);
    expect(scores.map((s) => s.member.name)).toEqual(["Bo", "Åse"]);
  });

  it("beholder deltagerens egen type", () => {
    const withColor = people.map((p, i) => ({ ...p, color: i }));
    const { scores } = challengePoints([challenge("a")], [vote("a", "u1", true), vote("a", "u2", true)], withColor);
    expect(scores[0].member.color).toBeTypeOf("number");
  });
});

describe("competitionRanks", () => {
  it("giver lige mange point samme plads", () => {
    expect(competitionRanks([{ points: 3 }, { points: 3 }, { points: 1 }, { points: 0 }, { points: 0 }])).toEqual([
      1, 1, 3, 4, 4,
    ]);
    expect(competitionRanks([])).toEqual([]);
  });
});

describe("insertChallenge", () => {
  function client(result: { data: unknown; error: unknown }) {
    const insert = vi.fn();
    const chain = { insert, select: () => chain, single: async () => result };
    insert.mockReturnValue(chain);
    const from = vi.fn(() => chain);
    return { supabase: { from } as unknown as SupabaseClient, from, insert };
  }

  it("gemmer rækken og giver id'et tilbage", async () => {
    const { supabase, from, insert } = client({ data: { id: "ch1" }, error: null });
    const row = { crawl_id: "c1", stop_id: "s1", text: "Skål", target_user_id: "u1" };
    await expect(insertChallenge(supabase, row)).resolves.toBe("ch1");
    expect(from).toHaveBeenCalledWith("challenges");
    expect(insert).toHaveBeenCalledWith(row);
  });

  it("klipper teksten til databasens grænse", async () => {
    const { supabase, insert } = client({ data: { id: "ch1" }, error: null });
    await insertChallenge(supabase, { crawl_id: "c1", stop_id: null, text: "x".repeat(400), target_user_id: null });
    expect(insert.mock.calls[0][0].text).toHaveLength(300);
  });

  it("giver null ved en fejl, så teksten vises uden afstemning", async () => {
    const { supabase } = client({ data: null, error: { code: "42P01" } });
    await expect(
      insertChallenge(supabase, { crawl_id: "c1", stop_id: null, text: "Skål", target_user_id: null }),
    ).resolves.toBeNull();
  });
});
