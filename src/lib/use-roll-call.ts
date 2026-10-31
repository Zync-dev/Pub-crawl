"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LAST_IN_SHOW_MS,
  isRollCallOpen,
  lastIn as findLastIn,
  rollCallEndedAt,
  type RollCall,
  type RollCallAnswer,
} from "./roll-call";
import { getSupabase } from "./supabase";
import type { Member } from "./types";

export type RollCallState = ReturnType<typeof useRollCall>;

type Busy = "start" | "answer" | "close" | null;

const errorTexts: Record<string, string> = {
  roll_call_closed: "Opråbet er allerede lukket.",
  roll_call_not_found: "Opråbet findes ikke længere.",
  too_many_roll_calls: "I har talt holdet rigeligt i aften.",
};

function errorText(error: { message?: string } | null) {
  const message = error?.message ?? "";
  for (const [key, text] of Object.entries(errorTexts)) if (message.includes(key)) return text;
  return "Det blev ikke gemt. Tjek forbindelsen.";
}

// Er alle med? Holder turens seneste opråb og svarene på det opdateret med Realtime.
// Alle skrivninger går gennem RPC'erne i 0004_rollcall.sql.
export function useRollCall(
  crawlId: string,
  userId: string,
  members: Member[],
  now: number,
  onError?: (text: string) => void,
) {
  const [call, setCall] = useState<RollCall | null>(null);
  const [allAnswers, setAllAnswers] = useState<RollCallAnswer[]>([]);
  const [busy, setBusy] = useState<Busy>(null);

  // Nyere opråb erstatter ældre. Samme opråb opdateres (fx når det lukker).
  const takeCall = useCallback((next: RollCall) => {
    setCall((prev) => (!prev || prev.id === next.id || next.created_at >= prev.created_at ? next : prev));
  }, []);

  const addAnswers = useCallback((rows: RollCallAnswer[]) => {
    setAllAnswers((prev) => {
      const key = (a: RollCallAnswer) => `${a.roll_call_id}:${a.user_id}`;
      const fresh = new Map(rows.map((a) => [key(a), a]));
      return [...prev.filter((a) => !fresh.has(key(a))), ...fresh.values()];
    });
  }, []);

  // Tælles op ved hver lokal skrivning. Et svar på en hentning, der gik i gang før, kan mangle
  // ens eget svar, så det smides væk, og vi henter igen.
  const writes = useRef(0);

  const refetch = useCallback(async () => {
    const supabase = getSupabase();
    for (let attempt = 0; attempt < 3; attempt++) {
      const version = writes.current;
      const { data } = await supabase
        .from("roll_calls")
        .select("*")
        .eq("crawl_id", crawlId)
        .order("created_at", { ascending: false })
        .limit(1)
        .returns<RollCall[]>();
      const latest = data?.[0] ?? null;
      if (!latest) return;
      const answers = await supabase
        .from("roll_call_answers")
        .select("*")
        .eq("roll_call_id", latest.id)
        .returns<RollCallAnswer[]>();
      if (version !== writes.current) continue;
      setCall(latest);
      // Svarene for det seneste opråb erstattes helt, så svar fra folk, der er gået hjem, forsvinder.
      if (answers.data) {
        const rows = answers.data;
        setAllAnswers((prev) => [...prev.filter((a) => a.roll_call_id !== latest.id), ...rows]);
      }
      return;
    }
  }, [crawlId]);

  useEffect(() => {
    const supabase = getSupabase();
    const filter = `crawl_id=eq.${crawlId}`;
    const channel = supabase
      .channel(`roll-call:${crawlId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "roll_calls", filter }, (payload) => {
        if (payload.eventType === "DELETE") return void refetch();
        takeCall(payload.new as RollCall);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "roll_call_answers", filter }, (payload) => {
        addAnswers([payload.new as RollCallAnswer]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refetch();
      });

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
  }, [crawlId, refetch, takeCall, addAnswers]);

  const derived = useMemo(() => {
    const answers = call ? allAnswers.filter((a) => a.roll_call_id === call.id) : [];
    const answeredIds = new Set(answers.map((a) => a.user_id));
    // Kun dem, der stadig er på holdet, tæller.
    const answered = members.filter((m) => answeredIds.has(m.user_id));
    const missing = members.filter((m) => !answeredIds.has(m.user_id));
    const open = isRollCallOpen(call, now);
    const last = call ? findLastIn(answers, members) : null;
    return {
      answers,
      answeredIds,
      count: answered.length,
      total: members.length,
      missing,
      everyoneIn: members.length > 0 && missing.length === 0,
      open,
      mine: answeredIds.has(userId),
      startedByMe: call?.started_by === userId,
      // Hvem der kom sidst med på det seneste opråb, uanset hvor længe siden.
      lastIn: last,
      // Vises i Nu et stykke tid efter lukningen.
      showLastIn: Boolean(call && !open && last && now - rollCallEndedAt(call) < LAST_IN_SHOW_MS),
    };
  }, [call, allAnswers, members, now, userId]);

  async function start(fromStopId: string | null = null, toStopId: string | null = null) {
    // Et opråb giver kun mening, når man er flere.
    if (members.length < 2 || busy) return false;
    setBusy("start");
    writes.current++;
    const { data, error } = await getSupabase()
      .rpc("start_roll_call", { p_crawl: crawlId, p_from_stop: fromStopId, p_to_stop: toStopId })
      .single<RollCall>();
    writes.current++;
    setBusy(null);
    if (error || !data) {
      onError?.(errorText(error));
      return false;
    }
    takeCall(data);
    // Den, der starter, er med med det samme.
    addAnswers([{ roll_call_id: data.id, user_id: userId, crawl_id: crawlId, answered_at: data.created_at }]);
    void refetch();
    return true;
  }

  async function answer() {
    if (!call || derived.mine || busy) return false;
    const temp: RollCallAnswer = {
      roll_call_id: call.id,
      user_id: userId,
      crawl_id: crawlId,
      answered_at: new Date().toISOString(),
    };
    addAnswers([temp]);
    setBusy("answer");
    writes.current++;
    const { data, error } = await getSupabase()
      .rpc("answer_roll_call", { p_roll_call: call.id })
      .single<RollCall>();
    writes.current++;
    setBusy(null);
    if (error || !data) {
      setAllAnswers((prev) => prev.filter((a) => a !== temp));
      onError?.(errorText(error));
      void refetch();
      return false;
    }
    takeCall(data);
    return true;
  }

  async function close() {
    if (!call || busy) return false;
    setBusy("close");
    const { data, error } = await getSupabase()
      .rpc("close_roll_call", { p_roll_call: call.id })
      .single<RollCall>();
    setBusy(null);
    if (error || !data) {
      onError?.(errorText(error));
      return false;
    }
    takeCall(data);
    return true;
  }

  // Er nogen gået hjem, og har resten svaret, lukker én telefon opråbet: den, der startede, ellers den første på holdet.
  const closer = members.some((m) => m.user_id === call?.started_by) ? call?.started_by : members[0]?.user_id;
  const shouldClose = derived.open && derived.everyoneIn && closer === userId && !busy;
  const callId = call?.id;
  useEffect(() => {
    if (!shouldClose || !callId) return;
    void getSupabase()
      .rpc("close_roll_call", { p_roll_call: callId })
      .single<RollCall>()
      .then(({ data }) => data && takeCall(data));
  }, [shouldClose, callId, takeCall]);

  return { call, members, ...derived, busy, start, answer, close, refetch };
}
