"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "./supabase";
import type { Drink } from "./types";
import type { CrawlData } from "./use-crawl";
import { newId } from "./uuid";
import {
  addSettled,
  dropSettled,
  entryKey,
  markSent,
  markWaiting as withWaiting,
  mergeDrinks,
  outboxStorageKey,
  parseOutbox,
  pruneSettled,
  queueRemoval,
  queueRestore,
  retryable,
  type OutboxEntry,
  type Settled,
  undoneLater,
  waitingCount,
  waitingDrinkIds,
} from "./drink-outbox";

export type { OutboxEntry } from "./drink-outbox";

// Offline-kø for drinks. Alt går gennem køen, så en drink tæller med det samme og sendes,
// når der er net. Køen ligger i hukommelsen og i localStorage, så den overlever en genindlæsning.

type Patch = (update: (prev: CrawlData) => CrawlData) => void;
type Result = "done" | "retry" | "dropped";

const RETRY_MS = 15_000;
const TIMEOUT_MS = 12_000;
// Svarer serveren hurtigt, når mærket "venter på net" aldrig at blinke frem.
const SLOW_MS = 1_500;
// Sendte drinks bliver liggende lidt, så en forældet genhentning ikke får dem til at blinke.
const SETTLE_MS = 30_000;

function load(key: string): OutboxEntry[] {
  return stored(key) ?? [];
}

// null, når localStorage ikke kan læses. Så stoler vi på køen i hukommelsen.
function stored(key: string): OutboxEntry[] | null {
  try {
    return parseOutbox(localStorage.getItem(key));
  } catch {
    return null;
  }
}

const sameQueue = (a: OutboxEntry[], b: OutboxEntry[]) =>
  a.length === b.length && a.every((e, i) => entryKey(e) === entryKey(b[i]));

function save(key: string, entries: OutboxEntry[]) {
  try {
    if (entries.length) localStorage.setItem(key, JSON.stringify(entries));
    else localStorage.removeItem(key);
  } catch {}
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
  const key = outboxStorageKey(crawlId, userId);
  const [entries, setEntries] = useState<OutboxEntry[]>(() => load(key));
  const [settled, setSettled] = useState<Settled[]>([]);
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
      const next = withWaiting(queue.current, only);
      if (next !== queue.current) commit(next);
    },
    [commit],
  );

  const settle = useCallback((id: string, drink: Drink | null) => {
    const until = Date.now() + SETTLE_MS;
    setSettled((list) => addSettled(list, id, drink, until));
    setTimeout(() => setSettled((list) => pruneSettled(list, Date.now())), SETTLE_MS + 50);
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
        // Fortrudt, mens den var på vej op: kun sletningen sendes.
        if (undoneLater(queue.current, 0)) {
          commit(queue.current.filter((e) => entryKey(e) !== k));
          continue;
        }
        inFlight.current = k;
        const slow = setTimeout(() => markWaiting(k), SLOW_MS);
        const { result, drink } = await send(entry);
        clearTimeout(slow);
        inFlight.current = null;
        if (result === "retry") {
          // Svaret kan være gået tabt på vejen, så drinken kan godt ligge på serveren.
          const sent = markSent(queue.current, k);
          if (sent !== queue.current) commit(sent);
          markWaiting();
          break;
        }
        commit(queue.current.filter((e) => entryKey(e) !== k));
        if (result === "dropped") {
          dropped.current(entry);
        } else if (entry.op === "insert" && drink) {
          settle(drink.id, drink);
          patch((p) => (p.drinks.some((d) => d.id === drink.id) ? p : { ...p, drinks: [...p.drinks, drink] }));
        } else if (entry.op === "delete" && !queue.current.some((e) => entryKey(e) === `insert:${entry.id}`)) {
          // Er den fortrudt imens, ligger den i køen igen og skal ikke skjules.
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
      const change = queueRemoval(queue.current, drink.id, inFlight.current);
      if (!change) return;
      commit(change.next);
      if (change.flush) void flush();
    },
    [commit, flush],
  );

  // Fortryd en slettet drink. Den kommer tilbage med samme id, tid og pub.
  const restore = useCallback(
    (drink: Drink) => {
      const next = queueRestore(queue.current, drink, inFlight.current);
      if (!next) return;
      setSettled((list) => dropSettled(list, drink.id));
      commit(next);
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
    // Activity: turen og regnskabet har hver sin kø i hukommelsen, men deler localStorage.
    // Har den anden side sendt køen, mens denne var skjult, tager vi det gemte, før vi sender.
    const resync = () => {
      if (flushing.current) return;
      const saved = stored(key);
      if (saved && !sameQueue(saved, queue.current)) commit(saved);
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisible);
    const first = setTimeout(() => {
      resync();
      kick();
    }, 0);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush, key, commit]);

  const pending = entries.length > 0;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void flush(), RETRY_MS);
    return () => clearInterval(timer);
  }, [pending, flush]);

  // Ventende drinks lægges oven på det, useCrawl har hentet. Ventende sletninger skjules.
  const merged = useMemo(() => mergeDrinks(drinks, entries, settled), [drinks, entries, settled]);

  const waitingIds = useMemo(() => waitingDrinkIds(entries), [entries]);
  const waiting = waitingCount(entries);

  return { drinks: merged, waitingIds, waiting, add, remove, restore, flush };
}
