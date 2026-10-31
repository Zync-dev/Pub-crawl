import type { Crawl, Stop } from "./types";

// Millisekunder tilbage ved den pub, I er på. Negativ, når tiden er gået.
export function remainingMs(crawl: Crawl, stop: Stop | null, now: number) {
  if (!stop || !crawl.arrived_at) return null;
  return new Date(crawl.arrived_at).getTime() + stop.minutes * 60_000 - now;
}

export function formatClock(ms: number) {
  const total = Math.ceil(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${ms < 0 ? "+" : ""}${m}:${String(s).padStart(2, "0")}`;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}
