import { distanceMeters } from "./geo";
import type { LatLng, Member, Stop } from "./types";

// Positioner, der er over to timer gamle, siger ikke længere noget.
export const POSITION_MAX_AGE_MS = 2 * 3_600_000;
// Efter ti minutter uden ny position tones nålen ned, og alderen står på den.
export const POSITION_STALE_MS = 10 * 60_000;
// Så tæt på den nuværende pub regnes man for at være der (GPS'en hopper inden døre).
export const AT_STOP_METERS = 40;

export type PlacedMember = {
  member: Member;
  at: LatLng;
  isMe: boolean;
  ageMs: number;
  stale: boolean;
};

// Hvem der står hvor på kortet. Dem ved den nuværende pub samles i ét tal på pubbens markør,
// så ti navneskilte ikke ligger oven i hinanden. Resten får hver sin nål. Din egen position
// fra GPS'en tegnes som prikken og står derfor ikke i away.
export function placeMembers(
  members: Member[],
  {
    userId,
    myPosition,
    now,
    currentStop,
  }: { userId: string; myPosition: LatLng | null; now: number; currentStop: Pick<Stop, "lat" | "lng"> | null },
) {
  const here: PlacedMember[] = [];
  const away: PlacedMember[] = [];
  for (const member of members) {
    const isMe = member.user_id === userId;
    let at: LatLng;
    let ageMs: number;
    if (isMe && myPosition) {
      at = myPosition;
      ageMs = 0;
    } else {
      if (member.lat === null || member.lng === null || !member.located_at) continue;
      ageMs = Math.max(0, now - new Date(member.located_at).getTime());
      if (ageMs > POSITION_MAX_AGE_MS) continue;
      at = { lat: member.lat, lng: member.lng };
    }
    const placed = { member, at, isMe, ageMs, stale: ageMs > POSITION_STALE_MS };
    if (currentStop && distanceMeters(at, currentStop) <= AT_STOP_METERS) here.push(placed);
    else if (!(isMe && myPosition)) away.push(placed);
  }
  return { here, away };
}

// Alderen på navneskiltet. Rundet ned, så skiltet ikke skal tegnes om hvert minut.
export function staleLabel(ageMs: number) {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${Math.floor(minutes / 5) * 5} min.`;
  return `${Math.floor(minutes / 60)} t.`;
}
