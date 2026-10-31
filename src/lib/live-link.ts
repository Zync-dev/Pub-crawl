import type { Stop } from "./types";

// Det, det offentlige live-link (/se/[token]) får at vide om turen. Aldrig navne, positioner eller drinks.
export type PublicStop = Pick<Stop, "id" | "name" | "lat" | "lng" | "position" | "minutes" | "visited_at">;

export type PublicCrawl = {
  name: string;
  current_stop_id: string | null;
  arrived_at: string | null;
  member_count: number;
  stops: PublicStop[];
};

// crawls.share_token findes i databasen, men står ikke i lib/types.ts. Rækken fra select("*") har den.
export type WithShareToken = { share_token?: string | null };

export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function isShareToken(token: string) {
  return SHARE_TOKEN_PATTERN.test(token);
}

export function liveLinkPath(token: string) {
  return `/se/${token}`;
}

// Turen foregår i København, så tiderne skrives i dansk tid, også når siden tegnes på serveren.
const clock = new Intl.DateTimeFormat("da-DK", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Copenhagen",
});

export function formatCopenhagenTime(iso: string) {
  return clock.format(new Date(iso)).replace(".", ":");
}

// Hvor holdet er, og hvor de skal hen bagefter.
export function liveStatus(crawl: PublicCrawl) {
  const current = crawl.stops.find((s) => s.id === crawl.current_stop_id) ?? null;
  const index = current ? crawl.stops.indexOf(current) : -1;
  const next = current
    ? (crawl.stops.slice(index + 1).find((s) => !s.visited_at) ?? null)
    : (crawl.stops.find((s) => !s.visited_at) ?? null);
  const started = crawl.stops.some((s) => s.visited_at);
  return { current, next, started };
}

// Henter turen bag et live-link via Supabase REST, uden at logge ind. Bruges både på serveren og i browseren.
export async function fetchPublicCrawl(token: string, init?: { signal?: AbortSignal }): Promise<PublicCrawl | null> {
  if (!isShareToken(token)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase er ikke sat op");
  const res = await fetch(`${url}/rest/v1/rpc/crawl_public`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token }),
    signal: init?.signal,
  });
  if (!res.ok) throw new Error(`crawl_public ${res.status}`);
  return (await res.json()) as PublicCrawl | null;
}
