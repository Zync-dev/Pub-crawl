import type { Challenge, ChallengeVote } from "./games-types";

type Person = { user_id: string; name: string };

export type ChallengeOutcome = {
  done: number;
  notDone: number;
  total: number;
  // Stemmer, der skal til, før udfordringen kan tælle.
  needed: number;
  completed: boolean;
};

// Mindst to stemmer (eller alle, hvis I er færre end to), og mindst halvdelen skal sige klaret.
export function requiredVotes(memberCount: number) {
  return Math.max(1, Math.min(2, memberCount));
}

// Kun stemmer fra folk, der stadig er på holdet, tæller.
export function challengeOutcome(
  challengeId: string,
  votes: ChallengeVote[],
  memberIds: ReadonlySet<string>,
): ChallengeOutcome {
  let done = 0;
  let notDone = 0;
  for (const v of votes) {
    if (v.challenge_id !== challengeId || !memberIds.has(v.user_id)) continue;
    if (v.done) done += 1;
    else notDone += 1;
  }
  const total = done + notDone;
  const needed = requiredVotes(memberIds.size);
  return { done, notDone, total, needed, completed: total >= needed && done * 2 >= total };
}

export type ChallengeScore<T extends Person = Person> = {
  member: T;
  points: number;
};

// 1 point til den, udfordringen var til, eller 1 point til alle på holdet for en fællesudfordring.
// Får den udfordringen, der er i gang (også null), tæller i alt kun den og dem, nogen har stemt om.
// En udfordring fra et fortrudt tjek ind eller en, der blev trukket om, kan ingen stemme om.
// Uden (undefined) tæller alle rækker, som før.
export function challengePoints<T extends Person>(
  challenges: Challenge[],
  votes: ChallengeVote[],
  members: T[],
  currentChallengeId?: string | null,
): { scores: ChallengeScore<T>[]; completed: number; total: number } {
  const memberIds = new Set(members.map((m) => m.user_id));
  const points = new Map<string, number>(members.map((m) => [m.user_id, 0]));
  let completed = 0;
  for (const c of challenges) {
    if (!challengeOutcome(c.id, votes, memberIds).completed) continue;
    completed += 1;
    if (c.target_user_id === null) {
      for (const id of memberIds) points.set(id, (points.get(id) ?? 0) + 1);
    } else if (memberIds.has(c.target_user_id)) {
      points.set(c.target_user_id, (points.get(c.target_user_id) ?? 0) + 1);
    }
  }
  const scores = members
    .map((member) => ({ member, points: points.get(member.user_id) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.member.name.localeCompare(b.member.name, "da"));
  const voted = new Set(votes.map((v) => v.challenge_id));
  const total =
    currentChallengeId === undefined
      ? challenges.length
      : challenges.filter((c) => c.id === currentChallengeId || voted.has(c.id)).length;
  return { scores, completed, total };
}

// Pladserne på tavlen: lige mange point giver samme plads (1, 1, 3).
export function competitionRanks(scores: { points: number }[]) {
  const ranks: number[] = [];
  scores.forEach((s, i) => {
    ranks.push(i > 0 && s.points === scores[i - 1].points ? ranks[i - 1] : i + 1);
  });
  return ranks;
}
