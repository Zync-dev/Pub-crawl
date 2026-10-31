import type { Crawl, Stop } from "./types";

// Den rene del af useHolds: listen over lokale ændringer, der holdes fast, til ekkoet er kommet.

export type HeldView = { crawl: Crawl; stops: Stop[] };
export type HoldChange = (view: HeldView) => HeldView;

export type Hold = { key: string; token: number; change: HoldChange; until: number };

// Efter skrivningen er færdig: nok til ekkoet og en genhentning, der var i gang.
export const HOLD_GRACE_MS = 4_000;
// En skrivning, der aldrig svarer, skal ikke låse skærmen.
export const HOLD_MAX_MS = 30_000;

// Et nyt hold med samme nøgle erstatter det gamle, så Fortryd vinder over det, den fortryder.
export function addHold(list: Hold[], hold: Hold): Hold[] {
  return [...list.filter((h) => h.key !== hold.key), hold];
}

// Skrivningen er færdig: holdet slipper efter lidt tid, men aldrig senere end først aftalt.
export function releaseHold(list: Hold[], token: number, now: number): Hold[] {
  return list.map((h) => (h.token === token ? { ...h, until: Math.min(h.until, now + HOLD_GRACE_MS) } : h));
}

export function dropHold(list: Hold[], token: number): Hold[] {
  return list.filter((h) => h.token !== token);
}

// Samme liste tilbage, når intet er udløbet, så React ikke tegner forgæves.
export function pruneHolds(list: Hold[], now: number): Hold[] {
  const next = list.filter((h) => h.until > now);
  return next.length === list.length ? list : next;
}

// Ændringerne lægges oven på det hentede i den rækkefølge, de kom.
export function applyHolds(holds: Hold[], base: HeldView): HeldView {
  return holds.reduce<HeldView>((v, h) => h.change(v), base);
}
