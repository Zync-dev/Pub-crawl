"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { byPosition, byTime, mergeSnapshot, touchedNothing, type Touched } from "./crawl-snapshot";
import { liveTopic } from "./realtime";
import { getSupabase } from "./supabase";
import type { Crawl, Drink, Member, Stop } from "./types";

export type CrawlData = {
  crawl: Crawl;
  members: Member[];
  stops: Stop[];
  drinks: Drink[];
};

// Henter hele turen og holder den opdateret med Supabase Realtime.
export function useCrawl(crawlId: string, initial: Crawl) {
  const [data, setData] = useState<CrawlData>({
    crawl: initial,
    members: [],
    stops: [],
    drinks: [],
  });
  const [loaded, setLoaded] = useState(false);
  // Antag forbindelse, indtil vi hører andet, så der ikke blinker en advarsel ved start.
  const [connected, setConnected] = useState(true);
  const [online, setOnline] = useState(true);
  // Genhentninger, der er i gang. Realtime skriver i dem alle, hvad der er ændret imens.
  const pending = useRef(new Set<Touched>());
  const latest = useRef(0);

  const touch = useCallback((mark: (t: Touched) => void) => {
    pending.current.forEach(mark);
  }, []);

  const refetch = useCallback(async () => {
    const supabase = getSupabase();
    const seq = ++latest.current;
    const touched = touchedNothing();
    pending.current.add(touched);
    try {
      const [crawl, members, stops, drinks] = await Promise.all([
        supabase.from("crawls").select("*").eq("id", crawlId).single<Crawl>(),
        supabase.from("members").select("*").eq("crawl_id", crawlId).returns<Member[]>(),
        supabase.from("stops").select("*").eq("crawl_id", crawlId).returns<Stop[]>(),
        supabase.from("drinks").select("*").eq("crawl_id", crawlId).returns<Drink[]>(),
      ]);
      // En nyere genhentning er startet. Den har det nyeste billede, så denne kasseres.
      if (seq !== latest.current) return;
      setData((prev) =>
        mergeSnapshot(
          prev,
          { crawl: crawl.data, members: members.data, stops: stops.data, drinks: drinks.data },
          touched,
        ),
      );
      setLoaded(true);
    } finally {
      pending.current.delete(touched);
    }
  }, [crawlId]);

  useEffect(() => {
    const supabase = getSupabase();
    const filter = `crawl_id=eq.${crawlId}`;
    // Kanalen, vi lukker i oprydningen, melder CLOSED bagefter. Det er ikke et tabt net.
    let closing = false;
    const channel = supabase
      .channel(liveTopic("crawl", crawlId))
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "crawls", filter: `id=eq.${crawlId}` },
        (payload) => {
          touch((t) => {
            t.crawl = true;
          });
          setData((prev) => ({ ...prev, crawl: payload.new as Crawl }));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members", filter },
        (payload) => {
          if (payload.eventType === "DELETE") return void refetch();
          const next = payload.new as Member;
          touch((t) => t.members.add(next.user_id));
          setData((prev) => ({
            ...prev,
            members: [
              ...prev.members.filter((m) => m.user_id !== next.user_id),
              next,
            ].sort((a, b) => a.joined_at.localeCompare(b.joined_at)),
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stops", filter },
        (payload) => {
          if (payload.eventType === "DELETE") return void refetch();
          const next = payload.new as Stop;
          touch((t) => t.stops.add(next.id));
          setData((prev) => ({
            ...prev,
            stops: [...prev.stops.filter((s) => s.id !== next.id), next].sort(byPosition),
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "drinks", filter },
        (payload) => {
          const next = payload.new as Drink;
          touch((t) => t.drinks.add(next.id));
          setData((prev) => ({
            ...prev,
            drinks: [...prev.drinks.filter((d) => d.id !== next.id), next].sort(byTime),
          }));
        },
      )
      // Slettede rækker kan ikke filtreres på crawl_id, så vi henter bare igen.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "drinks" }, () => {
        void refetch();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "stops" }, () => {
        void refetch();
      })
      .subscribe((status) => {
        if (closing) return;
        if (status === "SUBSCRIBED") {
          setConnected(true);
          // Fanger det, vi missede, mens kanalen var nede.
          void refetch();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnected(false);
        }
      });

    // Hent med det samme over REST. Kanalen kan være lang tid om at komme op på et dårligt net.
    void refetch();

    // Når telefonen vågner igen, kan vi have misset noget.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onOnline = () => {
      setOnline(true);
      void refetch();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      closing = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      void supabase.removeChannel(channel);
    };
  }, [crawlId, refetch, touch]);

  // Opdaterer med det samme lokalt, så knapperne føles hurtige. Realtime retter op bagefter.
  const patch = useCallback((update: (prev: CrawlData) => CrawlData) => {
    setData(update);
  }, []);

  return { ...data, loaded, offline: !online || !connected, refetch, patch };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
