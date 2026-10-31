import type { CoinSide, GameResult } from "./games-types";

type Person = { user_id: string; name: string };

export const PICK_TEXT_MAX = 60;
export const COIN_LABEL: Record<CoinSide, string> = { plat: "Plat", krone: "Krone" };

export function pickRandom<T>(list: T[]): T | null {
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

export function rollDice(count: 1 | 2) {
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
}

export function flipCoin(): CoinSide {
  return Math.random() < 0.5 ? "plat" : "krone";
}

// Tal på hjulet i "Hvem skal …?": flere omgange gennem holdet og til sidst den valgte.
export function reelSequence<T>(people: T[], picked: T, rounds = 3): T[] {
  if (people.length < 2) return [picked];
  const start = Math.floor(Math.random() * people.length);
  const spin = Array.from({ length: people.length * rounds }, (_, i) => people[(start + i) % people.length]);
  // Den sidste før den valgte må ikke være den samme, ellers ser hjulet ud til at stå stille.
  if (spin[spin.length - 1] === picked) spin.pop();
  return [...spin, picked];
}

export function cleanPickText(text: string) {
  const clean = text.trim().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  return clean ? clean.slice(0, PICK_TEXT_MAX) : null;
}

// Beskeder fra andre telefoner kan være hvad som helst, så de tjekkes, før de vises.
export function parseGameResult(payload: unknown): GameResult | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.from !== "string" || typeof p.at !== "string") return null;
  const base = { id: p.id.slice(0, 64), from: p.from, at: p.at };
  if (p.kind === "pick" && typeof p.pick === "string") {
    const text = typeof p.text === "string" ? cleanPickText(p.text) : null;
    return { ...base, kind: "pick", pick: p.pick, text };
  }
  if (
    p.kind === "dice" &&
    Array.isArray(p.dice) &&
    (p.dice.length === 1 || p.dice.length === 2) &&
    p.dice.every((n) => Number.isInteger(n) && n >= 1 && n <= 6)
  ) {
    return { ...base, kind: "dice", dice: p.dice as number[] };
  }
  if (p.kind === "coin" && (p.coin === "plat" || p.coin === "krone")) {
    return { ...base, kind: "coin", coin: p.coin };
  }
  return null;
}

// "Mikkel blev valgt: henter vand". Giver null, hvis afsenderen eller den valgte ikke er på holdet.
export function describeResult(result: GameResult, members: Person[]) {
  const name = (id: string) => members.find((m) => m.user_id === id)?.name ?? null;
  const from = name(result.from);
  if (!from) return null;
  if (result.kind === "pick") {
    const picked = name(result.pick);
    if (!picked) return null;
    return result.text ? `${picked} blev valgt: ${result.text}` : `${picked} blev valgt`;
  }
  if (result.kind === "dice") {
    const [a, b] = result.dice;
    return b === undefined ? `${from} slog ${a}` : `${from} slog ${a} og ${b} · ${a + b} i alt`;
  }
  return `${from} slog plat eller krone: ${COIN_LABEL[result.coin]}`;
}
