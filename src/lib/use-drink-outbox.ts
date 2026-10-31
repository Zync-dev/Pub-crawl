"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "./supabase";
import type { Drink } from "./types";
import type { CrawlData } from "./use-crawl";
import { newId } from "./uuid";

// Offline-kø for drinks. Alt går gennem køen, så en drink tæller med det samme og sendes,
// når der er net. Køen ligger i hukommelsen og i localStorage, så den overlever en genindlæsning.

export type OutboxEntry =
  | { op: "insert"; drink: Drink; waiting?: boolean }
  | { op: "delete"; id: string; waiting?: boolean };

type Patch = (update: (prev: CrawlData) => CrawlData) => void;
type Result = "done" | "retry" | "dropped";

const RETRY_MS = 15_000;
const TIMEOUT_MS = 12_000;
// Svarer serveren hurtigt, når mærket "venter på net" aldrig at blinke frem.
const SLOW_MS = 1_500;
// Sendte drinks bliver liggende lidt, så en forældet genhentning ikke får dem til at blinke.
const SETTLE_MS = 30_000;

const entryId = (e: OutboxEntry) => (e.op === "insert" ? e.drink.id : e.id);
const entryKey = (e: OutboxEntry) => `${e.op}:${entryId(e)}`;
const byTime = (a: Drink, b: Drink) => Date.parse(a.created_at) - Date.parse(b.created_at);

function valid(e: unknown): e is OutboxEntry {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  if (x.op === "delete") return typeof x.id === "string";
  if (x.op !== "insert" || !x.drink || typeof x.drink !== "object") return false;
  const d = x.drink as Record<string, unknown>;
  return typeof d.id === "string" && typeof d.crawl_id === "string" && typeof d.kind === "string";
}

function load(key: string): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Det, der lå tilbage fra sidst, har ventet. Så får det mærket med det samme.
    return parsed.filter(valid).map((e) => ({ ...e, waiting: true }));
  } catch {
    return [];
  }
}

function save(key: string, entries: OutboxEntry[]) {
  try {
    if (entries.length) localStorage.setItem(key, JSON.stringify(entries));
    else localStorage.removeItem(key);
  } catch {}
}

// Intet svar (intet net, timeout), udløbet login og serverfejl prøves igen. Resten er endelige afslag.
function retryable(status: number, code?: string) {
  return !code || status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

async function send(entry: OutboxEntry): Promise<{ result: Result; drink?: Drink }> {
  const supabase = getSupabase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    if (entry.op === "delete") {
      const { error, status } = await supabase
        .from("drinks")
        .delete()
        .eq("id", entry.id)
        .abortSignal(controller.signal);
      if (!error) return { result: "done" };
      return { result: retryable(status, error.code) ? "retry" : "dropped" };
    }
    // Samme id hver gang, og dubletter ignoreres. Så kan et svar, der gik tabt, sendes igen uden at tælle dobbelt.
    const upsert = (drink: Drink) =>
      supabase
        .from("drinks")
        .upsert(drink, { onConflict: "id", ignoreDuplicates: true })
        .abortSignal(controller.signal);
    let drink = entry.drink;
    let { error, status } = await upsert(drink);
    // Pubben kan være fjernet fra ruten, mens drinken ventede. Så gemmes den uden pub.
    if (error?.code === "23503" && drink.stop_id) {
      drink = { ...drink, stop_id: null };
      ({ error, status } = await upsert(drink));
    }
    if (!error) return { result: "done", drink };
    return { result: retryable(status, error.code) ? "retry" : "dropped" };
  } catch {
    return { result: "retry" };
  } finally {
    clearTimeout(timer);
  }
}

export type DrinkOutbox = ReturnType<typeof useDrinkOutbox>;

export function useDrinkOutbox(
  crawlId: string,
  userId: string,
  drinks: Drink[],
  patch: Patch,
  onDropped: (entry: OutboxEntry) => void,
) {
  const key = `pc-drink-outbox:${crawlId}:${userId}`;
  const [entries, setEntries] = useState<OutboxEntry[]>(() => load(key));
  const [settled, setSettled] = useState<{ id: string; drink: Drink | null; until: number }[]>([]);
  // Køen selv ligger i en ref, så sendeløkken altid læser den nyeste udgave.
  const queue = useRef(entries);
  const inFlight = useRef<string | null>(null);
  const flushing = useRef(false);
  const dropped = useRef(onDropped);
  useEffect(() => {
    dropped.current = onDropped;
  });

  const commit = useCallback(
    (next: OutboxEntry[]) => {
      queue.current = next;
      save(key, next);
      setEntries(next);
    },
    [key],
  );

  // Uden nøgle får alt i køen mærket.
  const markWaiting = useCallback(
    (only?: string) => {
      const hit = (e: OutboxEntry) => !only || entryKey(e) === only;
      if (queue.current.every((e) => e.waiting || !hit(e))) return;
      commit(queue.current.map((e) => (hit(e) && !e.waiting ? { ...e, waiting: true } : e)));
    },
    [commit],
  );

  const settle = useCallback((id: string, drink: Drink | null) => {
    const until = Date.now() + SETTLE_MS;
    setSettled((list) => [...list.filter((s) => s.id !== id), { id, drink, until }]);
    setTimeout(() => setSettled((list) => list.filter((s) => s.until > Date.now())), SETTLE_MS + 50);
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current || !queue.current.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      markWaiting();
      return;
    }
    flushing.current = true;
    try {
      while (queue.current.length) {
        const entry = queue.current[0];
        const k = entryKey(entry);
        inFlight.current = k;
        const slow = setTimeout(() => markWaiting(k), SLOW_MS);
        const { result, drink } = await send(entry);
        clearTimeout(slow);
        inFlight.current = null;
        if (result === "retry") {
          markWaiting();
          break;
        }
        commit(queue.current.filter((e) => entryKey(e) !== k));
        if (result === "dropped") {
          dropped.current(entry);
        } else if (entry.op === "insert" && drink) {
          settle(drink.id, drink);
          patch((p) => (p.drinks.some((d) => d.id === drink.id) ? p : { ...p, drinks: [...p.drinks, drink] }));
        } else if (entry.op === "delete") {
          settle(entry.id, null);
          patch((p) => ({ ...p, drinks: p.drinks.filter((d) => d.id !== entry.id) }));
        }
      }
    } finally {
      flushing.current = false;
      inFlight.current = null;
    }
  }, [commit, markWaiting, patch, settle]);

  const add = useCallback(
    (row: Omit<Drink, "id" | "created_at">) => {
      const drink: Drink = { ...row, id: newId(), created_at: new Date().toISOString() };
      commit([...queue.current, { op: "insert", drink }]);
      void flush();
      return drink;
    },
    [commit, flush],
  );

  const remove = useCallback(
    (drink: Drink) => {
      const insertKey = `insert:${drink.id}`;
      const deleteKey = `delete:${drink.id}`;
      const queued = queue.current.some((e) => entryKey(e) === insertKey);
      if (queued && inFlight.current !== insertKey) {
        // Den nåede aldrig serveren, så den skal bare ud af køen.
        commit(queue.current.filter((e) => entryKey(e) !== insertKey));
        return;
      }
      if (queue.current.some((e) => entryKey(e) === deleteKey)) return;
      // Er den på vej op lige nu, sendes sletningen bagefter i samme kø.
      commit([...queue.current, { op: "delete", id: drink.id }]);
      void flush();
    },
    [commit, flush],
  );

  // Prøv igen, når nettet kommer tilbage, når telefonen vågner, og hvert 15. sekund, så længe noget venter.
  useEffect(() => {
    const kick = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") kick();
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisible);
    const first = setTimeout(kick, 0);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  const pending = entries.length > 0;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void flush(), RETRY_MS);
    return () => clearInterval(timer);
  }, [pending, flush]);

  // Ventende drinks lægges oven på det, useCrawl har hentet. Ventende sletninger skjules.
  const merged = useMemo(() => {
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
  }, [drinks, entries, settled]);

  const waitingIds = useMemo(
    () => new Set(entries.flatMap((e) => (e.op === "insert" && e.waiting ? [e.drink.id] : []))),
    [entries],
  );
  const waiting = entries.filter((e) => e.waiting).length;

  return { drinks: merged, waitingIds, waiting, add, remove, flush };
}
