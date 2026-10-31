import { distanceMeters } from "./geo";
import type { LatLng } from "./types";

// Hvornår en ny position sendes til holdet. Hver sendt position er en opdatering, som Realtime
// sender til alle telefoner, så GPS-støj indendørs må ikke blive til en strøm af opdateringer.

// Aldrig oftere end det her, heller ikke når man flytter sig.
export const MIN_INTERVAL_MS = 8_000;
// Står man stille, sendes positionen alligevel så ofte, så de andre kan se, den er frisk.
export const HEARTBEAT_MS = 20_000;
export const MIN_MOVE_M = 25;

export function shouldSendPosition(
  last: { at: number; pos: LatLng } | null,
  here: LatLng,
  accuracy: number,
  now: number,
) {
  if (!last) return true;
  const elapsed = now - last.at;
  if (elapsed < MIN_INTERVAL_MS) return false;
  if (elapsed >= HEARTBEAT_MS) return true;
  // Et hop, der er mindre end usikkerheden på målingen, er bare støj.
  return distanceMeters(last.pos, here) >= Math.max(MIN_MOVE_M, Number.isFinite(accuracy) ? accuracy : 0);
}
