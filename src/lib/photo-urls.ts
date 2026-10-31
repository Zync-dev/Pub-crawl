"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getSupabase } from "./supabase";

// Bucketen er privat, så billederne vises via signerede links. De gælder en time,
// og vi bruger dem i 50 minutter, så et link aldrig udløber, mens det står på skærmen.

const SIGN_SECONDS = 60 * 60;
const KEEP_MS = 50 * 60_000;
const BATCH = 50;

const cache = new Map<string, { url: string; at: number }>();
const inFlight = new Set<string>();
// Fejlede stier prøves først igen efter lidt tid, så et dødt netværk ikke giver en løkke af kald.
const failedAt = new Map<string, number>();
const RETRY_MS = 15_000;
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getVersion = () => version;

function fresh(path: string, now: number) {
  const hit = cache.get(path);
  return hit && now - hit.at < KEEP_MS ? hit.url : undefined;
}

async function sign(paths: string[]) {
  const bucket = getSupabase().storage.from("photos");
  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH);
    batch.forEach((p) => inFlight.add(p));
    try {
      const { data } = await bucket.createSignedUrls(batch, SIGN_SECONDS);
      const at = Date.now();
      for (const row of data ?? []) {
        if (row.path && row.signedUrl && !row.error) {
          cache.set(row.path, { url: row.signedUrl, at });
          failedAt.delete(row.path);
        }
      }
      for (const p of batch) if (cache.get(p)?.at !== at) failedAt.set(p, at);
    } catch {
      batch.forEach((p) => failedAt.set(p, Date.now()));
    } finally {
      batch.forEach((p) => inFlight.delete(p));
    }
  }
  notify();
}

// Kunne linket ikke hentes sidst (typisk uden net)? Så viser appen det i stedet for at spinne.
// Læses i render af komponenter, der bruger usePhotoUrls, så de tegnes om, når det ændrer sig.
export function photoUrlFailed(path: string) {
  return failedAt.has(path) && !cache.has(path);
}

// Giver et opslag fra sti til link. Manglende eller gamle links hentes i samlede kald.
export function usePhotoUrls(paths: string[]) {
  const v = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [tick, setTick] = useState(0);
  const key = paths.join("|");

  useEffect(() => {
    const list = key ? key.split("|") : [];
    const now = Date.now();
    const missing = list.filter(
      (p) => !fresh(p, now) && !inFlight.has(p) && now - (failedAt.get(p) ?? 0) > RETRY_MS,
    );
    if (missing.length) void sign(missing);
    // Når det ældste link nærmer sig de 50 minutter, henter vi nye.
    const due = list.map((p) => {
      const failed = failedAt.get(p);
      if (failed !== undefined && !cache.has(p)) return failed + RETRY_MS;
      const at = cache.get(p)?.at;
      return at === undefined ? undefined : at + KEEP_MS;
    });
    const times = due.filter((t): t is number => t !== undefined);
    if (!times.length) return;
    const wait = Math.max(5_000, Math.min(...times) - now);
    const timer = setTimeout(() => setTick((t) => t + 1), wait);
    return () => clearTimeout(timer);
  }, [key, tick, v]);

  return (path: string) => cache.get(path)?.url;
}
