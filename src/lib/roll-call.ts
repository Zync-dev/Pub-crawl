import type { Member } from "./types";

// Er alle med? Rækkerne fra supabase/migrations/0004_rollcall.sql.

export type RollCall = {
  id: string;
  crawl_id: string;
  started_by: string;
  from_stop_id: string | null;
  to_stop_id: string | null;
  created_at: string;
  closed_at: string | null;
};

export type RollCallAnswer = {
  roll_call_id: string;
  user_id: string;
  crawl_id: string;
  answered_at: string;
};

// Samme grænse som i databasen: et opråb, der ikke er lukket efter 20 minutter, regnes for lukket.
export const ROLL_CALL_MAX_MS = 20 * 60_000;
// Så længe vises "Sidst med" efter lukningen.
export const LAST_IN_SHOW_MS = 10 * 60_000;

export function isRollCallOpen(call: RollCall | null, now: number): call is RollCall {
  if (!call || call.closed_at) return false;
  return now - new Date(call.created_at).getTime() < ROLL_CALL_MAX_MS;
}

// Hvornår opråbet sluttede: lukketiden eller udløbet.
export function rollCallEndedAt(call: RollCall): number {
  const expiry = new Date(call.created_at).getTime() + ROLL_CALL_MAX_MS;
  return call.closed_at ? Math.min(new Date(call.closed_at).getTime(), expiry) : expiry;
}

// Den, der svarede sidst. Kun interessant, når mere end én har svaret.
// Kun folk, der stadig er på holdet, tæller. Tiderne sammenlignes som tid, for et svar,
// vi selv har lagt ind, skrives "…Z", mens databasens skrives "…+00:00" med mikrosekunder.
export function lastIn(answers: RollCallAnswer[], members: Member[]): { member: Member; at: string } | null {
  const byId = new Map(members.map((m) => [m.user_id, m]));
  const here = answers.filter((a) => byId.has(a.user_id));
  if (here.length < 2) return null;
  const last = here.reduce((a, b) => (Date.parse(b.answered_at) > Date.parse(a.answered_at) ? b : a));
  const member = byId.get(last.user_id);
  return member ? { member, at: last.answered_at } : null;
}

// "Jonas", "Jonas og Mikkel", "Jonas, Mikkel og 2 til".
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} og ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} og ${names[2]}`;
  return `${names[0]}, ${names[1]} og ${names.length - 2} til`;
}
