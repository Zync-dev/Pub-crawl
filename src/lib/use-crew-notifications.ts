"use client";

import { useEffect, useRef } from "react";
import { notifyCrew, syncPush } from "./push";
import type { Crawl, Stop } from "./types";

// Beskeder til holdet om timeren og om at gå videre. Selve afsendelsen ligger i push.ts.

// Ankomsttiden kommer både som "…Z" (lokalt) og "…+00:00" (fra databasen), så nøglen bruger millisekunder.
export function arrivalKey(stopId: string, arrivedAt: string) {
  return `${stopId}:${new Date(arrivedAt).getTime()}`;
}

// Er man kommet ind længe efter, at tiden gik, er beskeden for gammel til at give mening.
const LATE_MS = 5 * 60_000;

// Bruges i CrawlApp. Når timeren ved pubben løber ud, sender den første åbne telefon "Sidste omgang" til alle.
export function useCrewNotifications(crawl: Crawl, currentStop: Stop | null, remaining: number | null) {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    void syncPush();
  }, []);

  const due = currentStop && crawl.arrived_at && remaining !== null && remaining <= 0 && remaining > -LATE_MS;
  const key = due ? arrivalKey(currentStop.id, crawl.arrived_at!) : null;
  const stopName = currentStop?.name ?? "";

  useEffect(() => {
    if (!key || sent.current === key) return;
    sent.current = key;
    void notifyCrew(crawl.id, "timer", key, {
      title: `Sidste omgang på ${stopName}`,
      body: "Tiden er gået. Drik op, så går vi videre.",
      url: `/t/${crawl.code}`,
    });
  }, [key, crawl.id, crawl.code, stopName]);
}

// Kaldes, når nogen trykker Videre. Alle andre på holdet får besked.
export function notifyMove(crawl: Crawl, from: Stop, to: Stop | null) {
  if (!crawl.arrived_at) return;
  void notifyCrew(crawl.id, "move", arrivalKey(from.id, crawl.arrived_at), {
    title: to ? `Holdet går videre til ${to.name}` : "Holdet går videre",
    body: to ? "Tjek ind, når du er der." : `Ruten er gået. ${from.name} var sidste pub.`,
    url: `/t/${crawl.code}`,
  });
}
