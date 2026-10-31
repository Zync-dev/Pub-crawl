import type { Drink } from "./types";

// Den rene del af offline-køen for drinks: køens rækker, hvad der skal sendes igen,
// og hvordan ventende drinks lægges oven på dem, useCrawl har hentet. Hooken ligger i use-drink-outbox.ts.

// sent: vi har prøvet at sende den, men fik intet svar. Så kan den godt være nået frem.
export type OutboxEntry =
  | { op: "insert"; drink: Drink; waiting?: boolean; sent?: boolean }
  | { op: "delete"; id: string; waiting?: boolean };

// En sendt drink (eller sletning) bliver liggende lidt, så en forældet genhentning ikke får den til at blinke.
export type Settled = { id: string; drink: Drink | null; until: number };

export const outboxStorageKey = (crawlId: string, userId: string) => `pc-drink-outbox:${crawlId}:${userId}`;

export const entryId = (e: OutboxEntry) => (e.op === "insert" ? e.drink.id : e.id);
export const entryKey = (e: OutboxEntry) => `${e.op}:${entryId(e)}`;
const byTime = (a: Drink, b: Drink) => Date.parse(a.created_at) - Date.parse(b.created_at);

export function validEntry(e: unknown): e is OutboxEntry {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  if (x.op === "delete") return typeof x.id === "string";
  if (x.op !== "insert" || !x.drink || typeof x.drink !== "object") return false;
  const d = x.drink as Record<string, unknown>;
  return typeof d.id === "string" && typeof d.crawl_id === "string" && typeof d.kind === "string";
}

// Det gemte fra localStorage. Det, der lå tilbage fra sidst, har ventet, så det får mærket med det samme.
export function parseOutbox(raw: string | null): OutboxEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validEntry).map((e) => ({ ...e, waiting: true }));
  } catch {
    return [];
  }
}

// Intet svar (intet net, timeout), udløbet login og serverfejl prøves igen. Resten er endelige afslag.
export function retryable(status: number, code?: string) {
  return !code || status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

// Giver mærket "venter på net" til én række (eller alle uden nøgle). Samme liste tilbage, hvis intet ændres.
export function markWaiting(queue: OutboxEntry[], only?: string): OutboxEntry[] {
  const hit = (e: OutboxEntry) => !only || entryKey(e) === only;
  if (queue.every((e) => e.waiting || !hit(e))) return queue;
  return queue.map((e) => (hit(e) && !e.waiting ? { ...e, waiting: true } : e));
}

// En indsættelse, der blev sendt uden svar, kan være nået frem. Det huskes, hvis den skal slettes igen.
export function markSent(queue: OutboxEntry[], key: string): OutboxEntry[] {
  const hit = (e: OutboxEntry) => e.op === "insert" && !e.sent && entryKey(e) === key;
  if (!queue.some(hit)) return queue;
  return queue.map((e) => (hit(e) ? { ...e, sent: true } : e));
}

// Sletter en drink via køen. Giver null, hvis der intet skal ske, ellers den nye kø, og om den skal sendes.
export function queueRemoval(
  queue: OutboxEntry[],
  drinkId: string,
  inFlight: string | null,
): { next: OutboxEntry[]; flush: boolean } | null {
  const insertKey = `insert:${drinkId}`;
  const deleteKey = `delete:${drinkId}`;
  const insert = queue.find((e) => entryKey(e) === insertKey);
  if (insert?.op === "insert" && inFlight !== insertKey) {
    const rest = queue.filter((e) => entryKey(e) !== insertKey);
    // Den nåede aldrig serveren, så den skal bare ud af køen.
    if (!insert.sent) return { next: rest, flush: false };
    // Den blev sendt uden svar og kan ligge på serveren. Sletningen er ufarlig, hvis den ikke gør.
    if (rest.some((e) => entryKey(e) === deleteKey)) return { next: rest, flush: false };
    return { next: [...rest, { op: "delete", id: drinkId }], flush: true };
  }
  if (queue.some((e) => entryKey(e) === deleteKey)) return null;
  // Er den på vej op lige nu, sendes sletningen bagefter i samme kø.
  return { next: [...queue, { op: "delete", id: drinkId }], flush: true };
}

export function addSettled(list: Settled[], id: string, drink: Drink | null, until: number): Settled[] {
  return [...list.filter((s) => s.id !== id), { id, drink, until }];
}

// Står der en sletning af den samme drink længere nede i køen, er drinken fortrudt. Så skal indsættelsen
// ikke sendes (igen), for så dukker drinken op hos hele holdet, til sletningen når frem. Sletningen sendes
// stadig, og den er ufarlig, hvis drinken aldrig nåede serveren.
export function undoneLater(queue: OutboxEntry[], index: number) {
  const entry = queue[index];
  if (entry?.op !== "insert") return false;
  return queue.some((e, i) => i > index && e.op === "delete" && e.id === entry.drink.id);
}

export function pruneSettled(list: Settled[], now: number): Settled[] {
  return list.filter((s) => s.until > now);
}

// Ventende drinks lægges oven på det hentede, og ventende sletninger skjules. Det hentede vinder ved samme id.
export function mergeDrinks(drinks: Drink[], entries: OutboxEntry[], settled: Settled[]): Drink[] {
  if (!entries.length && !settled.length) return drinks;
  const hidden = new Set<string>();
  const extra: Drink[] = [];
  for (const s of settled) {
    if (s.drink) extra.push(s.drink);
    else hidden.add(s.id);
  }
  for (const e of entries) {
    if (e.op === "insert") extra.push(e.drink);
    else hidden.add(e.id);
  }
  const byId = new Map(drinks.map((d) => [d.id, d]));
  for (const d of extra) if (!byId.has(d.id)) byId.set(d.id, d);
  return [...byId.values()].filter((d) => !hidden.has(d.id)).sort(byTime);
}

// Drinks med mærket "venter på net".
export function waitingDrinkIds(entries: OutboxEntry[]): Set<string> {
  return new Set(entries.flatMap((e) => (e.op === "insert" && e.waiting ? [e.drink.id] : [])));
}

export function waitingCount(entries: OutboxEntry[]) {
  return entries.filter((e) => e.waiting).length;
}
