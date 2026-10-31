import type { Crawl, Stop } from "./types";

// Millisekunder tilbage ved den pub, I er på. Negativ, når tiden er gået.
export function remainingMs(crawl: Crawl, stop: Stop | null, now: number) {
  if (!stop || !crawl.arrived_at) return null;
  return new Date(crawl.arrived_at).getTime() + stop.minutes * 60_000 - now;
}

// Én til her: minutterne lægges til det, der er tilbage. Er tiden gået, regnes der fra nu,
// så holdet får de minutter, der står på knappen, og ikke et minus, der bare bliver mindre.
export function extendedArrival(arrivedAt: string, stopMinutes: number, minutes: number, now: number) {
  const start = Math.max(new Date(arrivedAt).getTime(), now - stopMinutes * 60_000);
  return new Date(start + minutes * 60_000).toISOString();
}

export function formatClock(ms: number) {
  const total = Math.ceil(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${ms < 0 ? "+" : ""}${m}:${String(s).padStart(2, "0")}`;
}

// 24-timers tid med kolon (21:15), som designsystemet skriver den.
export function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
