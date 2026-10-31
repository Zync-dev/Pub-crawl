import type { HoldChange } from "./holds";
import type { Crawl, Stop } from "./types";

// Den rene del af Fortryd (components/use-undoable-actions.ts): hvilke felter der skrives,
// og hvordan skærmen ser ud før og efter Tjek ind, Videre og Fjern pub.

// games: current_challenge_id følger med, så Fortryd også giver den gamle udfordring og dens stemmer tilbage.
export type CrawlFields = Pick<Crawl, "current_stop_id" | "arrived_at" | "challenge"> & {
  current_challenge_id: string | null;
};

export const NOBODY: CrawlFields = { current_stop_id: null, arrived_at: null, challenge: null, current_challenge_id: null };

export const byPosition = (a: Stop, b: Stop) => a.position - b.position || a.created_at.localeCompare(b.created_at);

export const fieldsOf = (crawl: Crawl): CrawlFields => ({
  current_stop_id: crawl.current_stop_id,
  arrived_at: crawl.arrived_at,
  challenge: crawl.challenge,
  current_challenge_id: crawl.current_challenge_id ?? null,
});

// games: rækken til crawls. current_challenge_id skrives kun, når der er noget at skrive
// (en ny værdi, eller en gammel, der skal ryddes), så det også virker uden migration 0006.
export function crawlRow(fields: CrawlFields, replacing: CrawlFields) {
  const { current_challenge_id, ...rest } = fields;
  return current_challenge_id || replacing.current_challenge_id ? { ...rest, current_challenge_id } : rest;
}

// Felterne, en skrivning tjekker, før den skriver: turen skal stadig se ud, som telefonen så den.
// Ellers skriver en telefon med et forældet billede oven i det, holdet lige har gjort.
export const ARRIVAL = ["current_stop_id", "arrived_at"] as const satisfies (keyof CrawlFields)[];
export const CHALLENGE = [...ARRIVAL, "challenge"] as const satisfies (keyof CrawlFields)[];

// [kolonne, værdi] til .eq, eller null til .is(kolonne, null).
export function guardFilters(fields: CrawlFields, keys: readonly (keyof CrawlFields)[]) {
  return keys.map((key) => [key, fields[key]] as const);
}

type Guardable<Q> = { eq(column: string, value: string): Q; is(column: string, value: null): Q };

export function whereStill<Q extends Guardable<Q>>(query: Q, fields: CrawlFields, keys: readonly (keyof CrawlFields)[]): Q {
  return guardFilters(fields, keys).reduce<Q>(
    (q, [column, value]) => (value === null ? q.is(column, null) : q.eq(column, value)),
    query,
  );
}

// Sætter turens felter og eventuelt én pubs visited_at.
export function withCrawl(fields: CrawlFields, visited?: { stopId: string; at: string | null }): HoldChange {
  return (v) => ({
    crawl: { ...v.crawl, ...fields },
    stops: visited ? v.stops.map((s) => (s.id === visited.stopId ? { ...s, visited_at: visited.at } : s)) : v.stops,
  });
}

// Fjern pub. Databasen sætter current_stop_id til null, når den nuværende pub slettes. Det gør vi også.
export function withoutStop(stop: Stop, wasCurrent: boolean): HoldChange {
  return (v) => ({
    crawl: wasCurrent && v.crawl.current_stop_id === stop.id ? { ...v.crawl, current_stop_id: null } : v.crawl,
    stops: v.stops.filter((s) => s.id !== stop.id),
  });
}

// Fortryd Fjern pub: pubben kommer tilbage på sin plads, og stod vi der, står vi der igen,
// medmindre holdet er tjekket ind et andet sted i mellemtiden.
export function withStopBack(stop: Stop, wasCurrent: boolean, before: CrawlFields): HoldChange {
  return (v) => ({
    crawl: wasCurrent && !v.crawl.current_stop_id ? { ...v.crawl, ...before } : v.crawl,
    stops: [...v.stops.filter((s) => s.id !== stop.id), stop].sort(byPosition),
  });
}

// Teksten, når Fortryd ikke lykkedes. Uden fejl betyder det, at holdet nåede at ændre turen.
export function undoFailedText(error: { code?: string } | null) {
  if (!error) return "Holdet nåede at ændre det.";
  if (error.code === "23503") return "Pubben er ikke på ruten længere.";
  return "Det blev ikke fortrudt. Tjek forbindelsen.";
}

// Kan kun køres én gang, uanset hvor mange gange der trykkes.
export function once(fn: () => Promise<void>) {
  let used = false;
  return () => {
    if (used) return;
    used = true;
    void fn();
  };
}
