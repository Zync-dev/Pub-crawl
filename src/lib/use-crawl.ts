"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import type { Crawl, Drink, Member, Stop } from "./types";

export type CrawlData = {
  crawl: Crawl;
  members: Member[];
  stops: Stop[];
  drinks: Drink[];
};

const byPosition = (a: Stop, b: Stop) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);
const byTime = (a: Drink, b: Drink) => a.created_at.localeCompare(b.created_at);

// Henter hele turen og holder den opdateret med Supabase Realtime.
export function useCrawl(crawlId: string, initial: Crawl) {
  const [data, setData] = useState<CrawlData>({
    crawl: initial,
    members: [],
    stops: [],
    drinks: [],
  });
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const supabase = getSupabase();
    const [crawl, members, stops, drinks] = await Promise.all([
      supabase.from("crawls").select("*").eq("id", crawlId).single<Crawl>(),
      supabase.from("members").select("*").eq("crawl_id", crawlId).returns<Member[]>(),
      supabase.from("stops").select("*").eq("crawl_id", crawlId).returns<Stop[]>(),
      supabase.from("drinks").select("*").eq("crawl_id", crawlId).returns<Drink[]>(),
    ]);
    setData((prev) => ({
      crawl: crawl.data ?? prev.crawl,
      members: members.data ?? prev.members,
      stops: (stops.data ?? prev.stops).slice().sort(byPosition),
      drinks: (drinks.data ?? prev.drinks).slice().sort(byTime),
    }));
    setLoaded(true);
  }, [crawlId]);

  useEffect(() => {
    const supabase = getSupabase();
    const filter = `crawl_id=eq.${crawlId}`;
    const channel = supabase
      .channel(`crawl:${crawlId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "crawls", filter: `id=eq.${crawlId}` },
        (payload) => setData((prev) => ({ ...prev, crawl: payload.new as Crawl })),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members", filter },
        (payload) => {
          if (payload.eventType === "DELETE") return void refetch();
          const next = payload.new as Member;
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
        if (status === "SUBSCRIBED") void refetch();
      });

    // Når telefonen vågner igen, kan vi have misset noget.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [crawlId, refetch]);

  // Opdaterer med det samme lokalt, så knapperne føles hurtige. Realtime retter op bagefter.
  const patch = useCallback((update: (prev: CrawlData) => CrawlData) => {
    setData(update);
  }, []);

  return { ...data, loaded, refetch, patch };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
