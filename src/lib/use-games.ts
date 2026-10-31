"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseGameResult } from "./games";
import type { Challenge, ChallengeVote, GameResult } from "./games-types";
import { getSupabase } from "./supabase";

const FEED_SIZE = 6;
const byCreated = (a: Challenge, b: Challenge) => a.created_at.localeCompare(b.created_at);

type Options = {
  // Kaldes, når en anden på holdet har trukket, slået eller kastet noget.
  onRemoteResult: (result: GameResult) => void;
  onError: () => void;
};

// Udfordringer, stemmer og spilresultater for én tur, på sin egen Realtime-kanal.
export function useGames(crawlId: string, userId: string, { onRemoteResult, onError }: Options) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [votes, setVotes] = useState<ChallengeVote[]>([]);
  const [feed, setFeed] = useState<GameResult[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const requested = useRef(new Set<string>());
  const handlers = useRef({ onRemoteResult, onError });

  useEffect(() => {
    handlers.current = { onRemoteResult, onError };
  }, [onRemoteResult, onError]);

  const refetch = useCallback(async () => {
    const supabase = getSupabase();
    const [c, v] = await Promise.all([
      supabase.from("challenges").select("*").eq("crawl_id", crawlId).returns<Challenge[]>(),
      supabase.from("challenge_votes").select("*").eq("crawl_id", crawlId).returns<ChallengeVote[]>(),
    ]);
    if (c.data) setChallenges(c.data.slice().sort(byCreated));
    if (v.data) setVotes(v.data);
  }, [crawlId]);

  const addToFeed = useCallback((result: GameResult) => {
    setFeed((list) => [result, ...list.filter((r) => r.id !== result.id)].slice(0, FEED_SIZE));
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    const filter = `crawl_id=eq.${crawlId}`;
    const channel = supabase
      .channel(`games:${crawlId}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "challenges", filter }, (payload) => {
        const next = payload.new as Challenge;
        setChallenges((list) => [...list.filter((c) => c.id !== next.id), next].sort(byCreated));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "challenge_votes", filter }, (payload) => {
        if (payload.eventType === "DELETE") return void refetch();
        const next = payload.new as ChallengeVote;
        setVotes((list) => [
          ...list.filter((v) => !(v.challenge_id === next.challenge_id && v.user_id === next.user_id)),
          next,
        ]);
      })
      .on("broadcast", { event: "result" }, ({ payload }) => {
        const result = parseGameResult(payload);
        if (!result || result.from === userId) return;
        addToFeed(result);
        handlers.current.onRemoteResult(result);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refetch();
      });
    channelRef.current = channel;

    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [crawlId, userId, refetch, addToFeed]);

  // Den nye udfordring kan nå frem i crawls, før Realtime har sendt rækken.
  const ensureChallenge = useCallback(
    (id: string | null | undefined) => {
      if (!id || requested.current.has(id)) return;
      requested.current.add(id);
      void refetch();
    },
    [refetch],
  );

  const vote = useCallback(
    async (challenge: Challenge, done: boolean) => {
      const row: ChallengeVote = {
        challenge_id: challenge.id,
        crawl_id: challenge.crawl_id,
        user_id: userId,
        done,
        voted_at: new Date().toISOString(),
      };
      setVotes((list) => [
        ...list.filter((v) => !(v.challenge_id === challenge.id && v.user_id === userId)),
        row,
      ]);
      const { error } = await getSupabase().rpc("vote_challenge", { p_challenge: challenge.id, p_done: done });
      if (error) {
        handlers.current.onError();
        void refetch();
      }
    },
    [userId, refetch],
  );

  // Viser resultatet her med det samme og sender det til resten af holdet.
  const share = useCallback(
    (result: GameResult) => {
      addToFeed(result);
      const channel = channelRef.current;
      if (channel) void channel.send({ type: "broadcast", event: "result", payload: result });
    },
    [addToFeed],
  );

  return useMemo(
    () => ({ challenges, votes, feed, ensureChallenge, vote, share }),
    [challenges, votes, feed, ensureChallenge, vote, share],
  );
}
