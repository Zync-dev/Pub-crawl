import type { Member } from "./types";

// En omgang: én på holdet giver, og den, der skrev den ind, kan fortryde den.
export type Round = {
  id: string;
  crawl_id: string;
  stop_id: string | null;
  buyer_id: string;
  created_by: string;
  created_at: string;
};

export type BuyerCount = { member: Member; count: number };

const byTime = (a: Round, b: Round) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
const byName = (a: Member, b: Member) => a.name.localeCompare(b.name, "da");

export function sortRounds(rounds: Round[]) {
  return rounds.slice().sort(byTime);
}

// Lægger en række ind (eller erstatter den med samme id) og holder listen sorteret.
export function upsertRound(rounds: Round[], round: Round) {
  return sortRounds([...rounds.filter((r) => r.id !== round.id), round]);
}

export function removeRound(rounds: Round[], id: string) {
  return rounds.filter((r) => r.id !== id);
}

// Antal givne omgange pr. deltager. Omgange fra folk, der er gået hjem, tæller ikke.
export function roundCounts(members: Member[], rounds: Round[]) {
  const counts = new Map<string, number>(members.map((m) => [m.user_id, 0]));
  for (const r of rounds) {
    const n = counts.get(r.buyer_id);
    if (n !== undefined) counts.set(r.buyer_id, n + 1);
  }
  return counts;
}

// Hvis tur er det? Færrest omgange først, ved lighed den, der kom først med, og så navnet.
export function rankBuyers(members: Member[], rounds: Round[]): BuyerCount[] {
  const counts = roundCounts(members, rounds);
  return members
    .map((member) => ({ member, count: counts.get(member.user_id) ?? 0 }))
    .sort(
      (a, b) =>
        a.count - b.count ||
        a.member.joined_at.localeCompare(b.member.joined_at) ||
        byName(a.member, b.member),
    );
}

export function suggestBuyer(members: Member[], rounds: Round[]): Member | null {
  return rankBuyers(members, rounds)[0]?.member ?? null;
}

// Stillingen: flest omgange først, ved lighed efter navn.
export function roundStandings(members: Member[], rounds: Round[]): BuyerCount[] {
  const counts = roundCounts(members, rounds);
  return members
    .map((member) => ({ member, count: counts.get(member.user_id) ?? 0 }))
    .sort((a, b) => b.count - a.count || byName(a.member, b.member));
}

// De nyeste først.
export function latestRounds(rounds: Round[], limit = 3) {
  return sortRounds(rounds).reverse().slice(0, limit);
}

export function formatRoundCount(n: number) {
  return n === 1 ? "1 omgang" : `${n} omgange`;
}

export function formatRoundsGiven(n: number) {
  return `${formatRoundCount(n)} givet`;
}

// "Mikkels tur", men "Lukas' tur".
export function genitive(name: string) {
  return /[sxz]$/i.test(name) ? `${name}'` : `${name}s`;
}

// wiring: den, der kom sidst med på det seneste opråb, som et stille forslag ved siden af det
// faste. Kun når der ikke er givet en omgang siden, den er på holdet, og den ikke allerede er valgt.
export function lastInBuyer(
  lastIn: { member: Member; at: string } | null,
  members: Member[],
  rounds: Round[],
  shownBuyerId: string | null,
): Member | null {
  if (!lastIn) return null;
  const member = members.find((m) => m.user_id === lastIn.member.user_id);
  if (!member || member.user_id === shownBuyerId) return null;
  const at = Date.parse(lastIn.at);
  if (rounds.some((r) => Date.parse(r.created_at) > at)) return null;
  return member;
}
