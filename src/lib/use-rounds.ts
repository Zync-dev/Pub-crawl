"use client";

import { useCallback, useEffect, useState } from "react";
import { removeRound, sortRounds, upsertRound, type Round } from "./rounds";
import { liveTopic } from "./realtime";
import { getSupabase } from "./supabase";

// Henter turens omgange og holder dem opdateret med deres egen Realtime-kanal.
export function useRounds(crawlId: string) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("rounds")
      .select("*")
      .eq("crawl_id", crawlId)
      .returns<Round[]>();
    if (error || !data) return;
    // Omgange, der stadig er på vej til databasen, bliver liggende.
    setRounds((prev) => sortRounds([...data, ...prev.filter((r) => r.id.startsWith("tmp-"))]));
    setLoaded(true);
  }, [crawlId]);

  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase
      .channel(liveTopic("rounds", crawlId))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rounds", filter: `crawl_id=eq.${crawlId}` },
        (payload) => setRounds((prev) => upsertRound(prev, payload.new as Round)),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rounds", filter: `crawl_id=eq.${crawlId}` },
        (payload) => setRounds((prev) => upsertRound(prev, payload.new as Round)),
      )
      // Slettede rækker kan ikke filtreres på crawl_id, men id'et er med, så vi fjerner bare den.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "rounds" }, (payload) => {
        const id = (payload.old as Partial<Round>).id;
        if (id) setRounds((prev) => removeRound(prev, id));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refetch();
      });

    // Når telefonen vågner igen, kan vi have misset noget.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    const onOnline = () => void refetch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [crawlId, refetch]);

  return { rounds, loaded, setRounds, refetch };
}
