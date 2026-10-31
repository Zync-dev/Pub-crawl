"use client";

import { useCallback, useEffect, useState } from "react";
import type { Challenge, ChallengeVote } from "./games-types";
import type { RecapStop } from "./recap";
import type { RollCall, RollCallAnswer } from "./roll-call";
import type { Round } from "./rounds";
import { getSupabase } from "./supabase";
import type { Crawl, Drink, Member } from "./types";

// Aftenens regnskab: alt, hvad turen har skrevet ned, hentet på én gang.
// Ingen Realtime-kanal her: siden er et øjebliksbillede, der hentes igen, når man kommer tilbage
// til den, når nettet er tilbage, og hvert minut, mens den er åben. Stjerner og billeder kommer
// fra den fælles useReviews-butik.

export type RecapData = {
  crawl: Crawl;
  members: Member[];
  stops: RecapStop[];
  drinks: Drink[];
  rounds: Round[];
  challenges: Challenge[];
  votes: ChallengeVote[];
  rollCalls: RollCall[];
  rollCallAnswers: RollCallAnswer[];
};

const REFRESH_MS = 60_000;

export function useRecapData(initial: Crawl) {
  const crawlId = initial.id;
  const [data, setData] = useState<RecapData>({
    crawl: initial,
    members: [],
    stops: [],
    drinks: [],
    rounds: [],
    challenges: [],
    votes: [],
    rollCalls: [],
    rollCallAnswers: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const refetch = useCallback(async () => {
    const supabase = getSupabase();
    const byCrawl = (table: string) => supabase.from(table).select("*").eq("crawl_id", crawlId);
    try {
      const [crawl, members, stops, drinks, rounds, challenges, votes, rollCalls, answers] = await Promise.all([
        supabase.from("crawls").select("*").eq("id", crawlId).maybeSingle<Crawl>(),
        byCrawl("members").returns<Member[]>(),
        byCrawl("stops").returns<RecapStop[]>(),
        byCrawl("drinks").returns<Drink[]>(),
        byCrawl("rounds").returns<Round[]>(),
        byCrawl("challenges").returns<Challenge[]>(),
        byCrawl("challenge_votes").returns<ChallengeVote[]>(),
        byCrawl("roll_calls").returns<RollCall[]>(),
        byCrawl("roll_call_answers").returns<RollCallAnswer[]>(),
      ]);
      // Kernetabellerne skal svare. De andre er ekstra: fejler én, bruger vi det, vi havde.
      if (crawl.error || members.error || stops.error || drinks.error) throw crawl.error ?? members.error ?? stops.error ?? drinks.error;
      setData((prev) => ({
        crawl: crawl.data ?? prev.crawl,
        members: (members.data ?? prev.members).slice().sort((a, b) => a.joined_at.localeCompare(b.joined_at)),
        stops: (stops.data ?? prev.stops).slice().sort((a, b) => a.position - b.position),
        drinks: drinks.data ?? prev.drinks,
        rounds: rounds.data ?? prev.rounds,
        challenges: challenges.data ?? prev.challenges,
        votes: votes.data ?? prev.votes,
        rollCalls: rollCalls.data ?? prev.rollCalls,
        rollCallAnswers: answers.data ?? prev.rollCallAnswers,
      }));
      setFailed(false);
      setLoaded(true);
    } catch {
      setFailed(true);
    }
  }, [crawlId]);

  useEffect(() => {
    // Activity skjuler siden i stedet for at fjerne den, så effekten kører igen, når man vender tilbage.
    // refetch sætter først state, når svaret er kommet, så det er ikke en synkron opdatering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    const onOnline = () => void refetch();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refetch]);

  return { ...data, loaded, failed, refetch };
}
