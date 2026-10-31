import type { Stop } from "./types";

// Næste pub på ruten: den første, I ikke har været på, og ikke den, I står på.
// Samme regel i Videre, beskeden til holdet, opråbet og "På vej" bagefter.
export function nextStopOnRoute(stops: Stop[], currentStopId: string | null): Stop | null {
  return stops.find((s) => !s.visited_at && s.id !== currentStopId) ?? null;
}

// "1 pub", "3 pubber".
export function formatPubs(count: number) {
  return `${count} ${count === 1 ? "pub" : "pubber"}`;
}
