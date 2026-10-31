import type { Crawl, Drink, Member, Stop } from "./types";

// Den rene del af genhentningen i use-crawl.ts. En genhentning læser fire tabeller, og imens kan
// Realtime nå at give os nyere rækker. Dem må det ældre øjebliksbillede ikke skrive over.

export type CrawlSnapshot = {
  crawl: Crawl;
  members: Member[];
  stops: Stop[];
  drinks: Drink[];
};

// Det, Realtime har ændret, mens en genhentning var i gang.
export type Touched = {
  crawl: boolean;
  members: Set<string>;
  stops: Set<string>;
  drinks: Set<string>;
};

export const touchedNothing = (): Touched => ({
  crawl: false,
  members: new Set(),
  stops: new Set(),
  drinks: new Set(),
});

export const byPosition = (a: Stop, b: Stop) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);
export const byTime = (a: Drink, b: Drink) => a.created_at.localeCompare(b.created_at);
const byJoined = (a: Member, b: Member) => a.joined_at.localeCompare(b.joined_at);

// Det hentede vinder, undtagen for rækker, Realtime har rørt imens. Dem har vi en nyere udgave af.
function mergeRows<T>(prev: T[], fetched: T[] | null, touched: Set<string>, key: (row: T) => string): T[] {
  if (!fetched) return prev;
  if (!touched.size) return fetched;
  const fresh = new Map(prev.filter((row) => touched.has(key(row))).map((row) => [key(row), row]));
  return [...fetched.filter((row) => !fresh.has(key(row))), ...fresh.values()];
}

export function mergeSnapshot(
  prev: CrawlSnapshot,
  fetched: { crawl: Crawl | null; members: Member[] | null; stops: Stop[] | null; drinks: Drink[] | null },
  touched: Touched,
): CrawlSnapshot {
  return {
    crawl: touched.crawl || !fetched.crawl ? prev.crawl : fetched.crawl,
    members: mergeRows(prev.members, fetched.members, touched.members, (m) => m.user_id).sort(byJoined),
    stops: mergeRows(prev.stops, fetched.stops, touched.stops, (s) => s.id).slice().sort(byPosition),
    drinks: mergeRows(prev.drinks, fetched.drinks, touched.drinks, (d) => d.id).slice().sort(byTime),
  };
}
