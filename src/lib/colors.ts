import type { AvatarTone } from "@/components/ds";

// Designsystemet har fire avatar-toner. Deltagerne får dem på skift.
const TONES: AvatarTone[] = ["green", "gold", "oxblood", "cream"];

export function memberTone(index: number): AvatarTone {
  return TONES[((index % 4) + 4) % 4];
}

// Farverne bag hver tone, til markører på kortet.
export const TONE_STYLE: Record<AvatarTone, { bg: string; fg: string }> = {
  green: { bg: "var(--green-800)", fg: "var(--gold-300)" },
  gold: { bg: "var(--gold-500)", fg: "var(--green-900)" },
  oxblood: { bg: "var(--oxblood-700)", fg: "var(--cream-100)" },
  cream: { bg: "var(--cream-300)", fg: "var(--green-900)" },
};
