import type { Crawl } from "./types";

// Arrangøren er den, der står som created_by på turen. Rollen kan gives videre.
// route_locked kommer fra migration 0009 og ligger derfor ikke i Crawl-typen.
export type ArrangerCrawl = Crawl & { route_locked?: boolean };

export function isArranger(crawl: Crawl, userId: string) {
  return crawl.created_by === userId;
}

export function isRouteLocked(crawl: Crawl) {
  return (crawl as ArrangerCrawl).route_locked === true;
}

// Ruten kan rettes af alle, når den er åben, og ellers kun af arrangøren.
export function canEditRoute(crawl: Crawl, userId: string) {
  return !isRouteLocked(crawl) || isArranger(crawl, userId);
}

// Kun de nævnte felter fra en række, som en RPC har sendt tilbage.
export function pickFields<T extends object, K extends keyof T>(row: T, fields: K[]): Partial<T> {
  const out: Partial<T> = {};
  for (const f of fields) if (f in row) out[f] = row[f];
  return out;
}

export const ROUTE_LOCKED_TEXT = "Ruten er låst af arrangøren.";

const arrangerErrors: Record<string, string> = {
  not_arranger: "Det kan kun arrangøren.",
  cannot_remove_self: "Du kan ikke fjerne dig selv.",
  already_arranger: "Du er allerede arrangør.",
  member_not_found: "Personen er ikke længere på holdet.",
  route_locked: ROUTE_LOCKED_TEXT,
};

export function arrangerErrorText(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  for (const [key, text] of Object.entries(arrangerErrors)) {
    if (message.includes(key)) return text;
  }
  return "Det blev ikke gemt. Tjek forbindelsen.";
}
