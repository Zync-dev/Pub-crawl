"use client";

import { useEffect, useRef } from "react";
import { notifyCrew, syncPush } from "./push";
import type { Crawl, Stop } from "./types";

// Beskeder til holdet om timeren, om at gå videre og om opråbet. Selve afsendelsen ligger i push.ts,
// og serveren skriver teksten ud fra turen. Her afgøres kun, hvornår og med hvilken nøgle.

// Ankomsttiden kommer både som "…Z" (lokalt) og "…+00:00" (fra databasen), så nøglen bruger millisekunder.
export function arrivalKey(stopId: string, arrivedAt: string) {
  return `${stopId}:${new Date(arrivedAt).getTime()}`;
}

// Timerens nøgle er tidspunktet, hvor tiden går. Både "Én til her" og flere minutter i Ruten flytter det,
// så der kommer en ny "Sidste omgang", og alle telefoner regner den samme nøgle ud.
export function deadlineKey(stopId: string, arrivedAt: string, minutes: number) {
  return `${stopId}:${new Date(arrivedAt).getTime() + minutes * 60_000}`;
}

// Så længe efter, at tiden er gået, giver "Sidste omgang" stadig mening. Serveren bruger samme grænse.
export const LATE_MS = 15 * 60_000;
// Uden svar prøves der igen så ofte, og når nettet eller appen kommer tilbage.
export const RETRY_MS = 20_000;

// Prøver at sende, indtil send() giver true, eller til der ryddes op (eller maxMs er gået).
// Databasen sender hver (kind, key) én gang, så flere forsøg giver aldrig flere beskeder.
export function retryUntilDone(send: () => Promise<boolean>, onDone: () => void = () => {}, maxMs?: number) {
  let stopped = false;
  let busy = false;
  const hasWindow = typeof window !== "undefined" && typeof document !== "undefined";
  const attempt = () => {
    if (stopped || busy) return;
    busy = true;
    void send().then((done) => {
      busy = false;
      if (!done) return;
      stop();
      onDone();
    });
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") attempt();
  };
  const timer = setInterval(attempt, RETRY_MS);
  const giveUp = maxMs ? setTimeout(() => stop(), maxMs) : null;
  if (hasWindow) {
    window.addEventListener("online", attempt);
    document.addEventListener("visibilitychange", onVisible);
  }
  function stop() {
    stopped = true;
    clearInterval(timer);
    if (giveUp) clearTimeout(giveUp);
    if (hasWindow) {
      window.removeEventListener("online", attempt);
      document.removeEventListener("visibilitychange", onVisible);
    }
  }
  attempt();
  return stop;
}

// Bruges i CrawlApp. Når timeren ved pubben løber ud, sender den første åbne telefon "Sidste omgang" til alle.
// Den bliver ved at prøve, mens tiden er gået, så et hul i nettet ikke koster beskeden.
export function useCrewNotifications(crawl: Crawl, currentStop: Stop | null, remaining: number | null) {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    void syncPush();
  }, []);

  const due = currentStop && crawl.arrived_at && remaining !== null && remaining <= 0 && remaining > -LATE_MS;
  const key = due ? deadlineKey(currentStop.id, crawl.arrived_at!, currentStop.minutes) : null;

  useEffect(() => {
    if (!key || sent.current === key) return;
    return retryUntilDone(
      () => notifyCrew(crawl.id, "timer", key),
      () => {
        sent.current = key;
      },
    );
  }, [key, crawl.id]);
}

// Kaldes, når Videre står fast (Fortryd blev ikke trykket). Alle andre på holdet får besked.
// Den lever uden for fanerne, så et skift af fane ikke stopper den, og den giver op efter fem minutter.
export function notifyMove(crawl: Crawl, from: Stop) {
  if (!crawl.arrived_at) return;
  const key = arrivalKey(from.id, crawl.arrived_at);
  retryUntilDone(() => notifyCrew(crawl.id, "move", key), undefined, 5 * 60_000);
}

// wiring: "Er alle med?" til holdet, når et opråb starter. Kun telefonen, der startede det, sender,
// for afsenderen får ikke selv beskeden. Databasen sender hvert opråb én gang (nøglen er opråbets id).
export function useRollCallNotification(
  crawl: Crawl,
  call: { id: string } | null,
  open: boolean,
  startedByMe: boolean,
) {
  const sent = useRef<string | null>(null);
  const id = open && startedByMe ? (call?.id ?? null) : null;

  useEffect(() => {
    if (!id || sent.current === id) return;
    return retryUntilDone(
      () => notifyCrew(crawl.id, "rollcall", id),
      () => {
        sent.current = id;
      },
    );
  }, [id, crawl.id]);
}
