"use client";

import { useEffect, useRef } from "react";
import { arrangerErrorText } from "@/lib/arranger";
import { insertChallenge } from "@/lib/challenge-rows";
import { drawChallenge, needsVote } from "@/lib/challenges";
import { getSupabase } from "@/lib/supabase";
import { extendedArrival } from "@/lib/timer";
import type { Crawl, Member, Stop } from "@/lib/types";
import type { CrawlData } from "@/lib/use-crawl";
import {
  ARRIVAL,
  CHALLENGE,
  crawlRow,
  type CrawlFields,
  fieldsOf,
  NOBODY,
  once,
  undoFailedText,
  whereStill,
  withCrawl,
  withoutStop,
  withStopBack,
} from "@/lib/undo-fields";
import type { HeldView, HoldChange, HoldHandle } from "@/lib/use-holds";
import { useAsk } from "./ask";

// Tjek ind, Videre, Én til her, Træk en ny og Fjern pub med "Fortryd" i toasten i ca. 6 sekunder.
// Hver skrivning tjekker, at turen stadig ser ud, som telefonen så den, så en telefon med et
// forældet billede ikke skriver oven i holdet, og et dobbelttryk gør ingenting anden gang.

const UNDO_MS = 6_000;
// Fjern pub sendes lidt efter, at toasten er væk, så et tryk på Fortryd i sidste øjeblik når frem.
const DELETE_AFTER_MS = UNDO_MS + 400;

export type UndoableActions = ReturnType<typeof useUndoableActions>;

type Written = { data: unknown[] | null; error: { code?: string } | null };

export function useUndoableActions({
  crawl,
  stops,
  members,
  patch,
  refetch,
  hold,
}: {
  crawl: Crawl;
  stops: Stop[];
  members: Member[];
  patch: (update: (prev: CrawlData) => CrawlData) => void;
  refetch: () => Promise<void>;
  hold: (key: string, change: HoldChange) => HoldHandle;
}) {
  const supabase = getSupabase();
  const ask = useAsk();
  const id = crawl.id;
  // Fjern pub venter, til Fortryd er forbi. Her ligger de sletninger, der ikke er sendt endnu.
  const pendingDeletes = useRef(new Map<string, () => void>());

  // Lukkes appen, eller går man fra turen, sendes de ventende sletninger med det samme.
  useEffect(() => {
    const deletes = pendingDeletes.current;
    const flushAll = () => [...deletes.values()].forEach((send) => send());
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      flushAll();
    };
  }, []);

  // Ændringen lægges i data og holdes fast, til skrivningen er færdig og ekkoet er kommet.
  function show(key: string, change: HoldChange) {
    patch((p) => ({ ...p, ...change({ crawl: p.crawl, stops: p.stops }) }));
    return hold(key, change);
  }

  // Skrivningen lykkedes ikke: vis det, vi havde, og hent turen igen, så vi ser det samme som holdet.
  function rejected(held: HoldHandle, back: HoldChange, error: { code?: string } | null) {
    held.drop();
    patch((p) => ({ ...p, ...back({ crawl: p.crawl, stops: p.stops } satisfies HeldView) }));
    void refetch();
    // Uden fejl betyder det, at holdet nåede at ændre turen. Ellers net, eller fx en låst rute.
    ask.toast(error ? arrangerErrorText(error) : "Holdet nåede at ændre det.", "danger");
  }

  // Fortryd lykkedes ikke: vis det, vi havde, og hent turen igen, så vi ser det samme som holdet.
  function failed(back: HoldHandle, redo: HoldChange, error: { code?: string } | null) {
    back.drop();
    patch((p) => ({ ...p, ...redo({ crawl: p.crawl, stops: p.stops } satisfies HeldView) }));
    void refetch();
    ask.toast(undoFailedText(error), "danger");
  }

  const saved = ({ data, error }: Written) => !error && Boolean(data?.length);

  function offerUndo(message: string, undo: () => Promise<void>) {
    ask.toast(message, { action: { label: "Fortryd", onClick: once(undo) }, duration: UNDO_MS });
  }

  // Skriver turens felter, hvis den stadig ser ud som `seen`. Giver true, når rækken blev skrevet.
  function writeCrawl(row: Record<string, unknown>, seen: CrawlFields, keys: readonly (keyof CrawlFields)[]) {
    return whereStill(supabase.from("crawls").update(row).eq("id", id), seen, keys).select("id");
  }

  return {
    async arrive(stop: Stop) {
      const now = new Date().toISOString();
      const before = fieldsOf(crawl);
      // games: udfordringen gemmes også som en række, så holdet kan stemme om den.
      const drawn = drawChallenge(members, crawl.challenge);
      const after: CrawlFields = {
        current_stop_id: stop.id,
        arrived_at: now,
        challenge: drawn.text,
        current_challenge_id: null,
      };
      const visitedBefore = stop.visited_at;
      const back = withCrawl(before, { stopId: stop.id, at: visitedBefore });
      let forward = withCrawl(after, { stopId: stop.id, at: visitedBefore ?? now });
      let held = show("crawl", forward);
      if (!visitedBefore) {
        // Har en anden allerede sat den, beholder pubben den første ankomst.
        const { error } = await supabase
          .from("stops")
          .update({ visited_at: now })
          .eq("id", stop.id)
          .is("visited_at", null);
        if (error) return rejected(held, back, error);
      }
      // En udfordring uden noget at klare får ingen række og ingen afstemning.
      const challengeId = needsVote(drawn.text)
        ? await insertChallenge(supabase, {
            crawl_id: id,
            stop_id: stop.id,
            text: drawn.text,
            target_user_id: drawn.target?.user_id ?? null,
          })
        : null;
      if (challengeId) {
        after.current_challenge_id = challengeId;
        forward = withCrawl(after, { stopId: stop.id, at: visitedBefore ?? now });
        // Samme nøgle, så det nye hold erstatter det første.
        held = show("crawl", forward);
      }
      const written = await writeCrawl(crawlRow(after, before), before, ARRIVAL);
      if (!saved(written)) {
        if (!visitedBefore) {
          // Er holdet ikke tjekket ind her, skal pubben heller ikke stå som besøgt.
          const current = await supabase
            .from("crawls")
            .select("current_stop_id")
            .eq("id", id)
            .maybeSingle<Pick<Crawl, "current_stop_id">>();
          if (current.data && current.data.current_stop_id !== stop.id) {
            await supabase.from("stops").update({ visited_at: null }).eq("id", stop.id).eq("visited_at", now);
          }
        }
        return rejected(held, back, written.error);
      }
      held.release();

      offerUndo(`Tjekket ind på ${stop.name}`, async () => {
        const undo = show("crawl", back);
        const result = await writeCrawl(crawlRow(before, after), after, ARRIVAL);
        if (!saved(result)) return failed(undo, forward, result.error);
        if (!visitedBefore) {
          const visited = await supabase
            .from("stops")
            .update({ visited_at: null })
            .eq("id", stop.id)
            .eq("visited_at", now);
          if (visited.error) return failed(undo, withCrawl(before), visited.error);
        }
        undo.release();
        ask.toast("Tjek ind er fortrudt");
      });
    },

    // wiring: onUndone kaldes, når Videre er fortrudt, så opråbet, Videre startede, også kan lukkes.
    // pwa-push: onCommitted kaldes, når Videre står fast: Fortryd blev ikke trykket i tide, eller det mislykkedes.
    // Så får holdet aldrig besked om et Videre, der blev fortrudt.
    async leave(onUndone?: () => void, onCommitted?: () => void) {
      const before = fieldsOf(crawl);
      const stop = stops.find((s) => s.id === crawl.current_stop_id);
      const forward = withCrawl(NOBODY);
      const held = show("crawl", forward);
      // Kun fra den pub og den ankomst, vi så. Er holdet tjekket ind et andet sted imens, sker der intet.
      const written = await writeCrawl(crawlRow(NOBODY, before), before, ARRIVAL);
      if (!saved(written)) {
        rejected(held, withCrawl(before), written.error);
        return false;
      }
      held.release();
      if (!before.current_stop_id) return true;

      let undoing = false;
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        onCommitted?.();
      };
      // Lidt længere end toasten, så et tryk i sidste øjeblik også når at tælle.
      setTimeout(() => {
        if (!undoing) commit();
      }, UNDO_MS + 500);

      offerUndo(stop ? `Videre fra ${stop.name}` : "I er videre", async () => {
        undoing = true;
        const back = show("crawl", withCrawl(before));
        // Kun hvis ingen er tjekket ind et andet sted i mellemtiden.
        const { data, error } = await supabase
          .from("crawls")
          .update(crawlRow(before, NOBODY))
          .eq("id", id)
          .is("current_stop_id", null)
          .select("id");
        if (error || !data?.length) {
          commit();
          return failed(back, forward, error);
        }
        back.release();
        onUndone?.();
        ask.toast(stop ? `Tilbage på ${stop.name}` : "Videre er fortrudt");
      });
      return true;
    },

    // Én til her: flere minutter på pubben for hele holdet.
    async extend(minutes: number) {
      const stop = stops.find((s) => s.id === crawl.current_stop_id);
      if (!crawl.arrived_at || !stop) return;
      const before = fieldsOf(crawl);
      const after: CrawlFields = {
        ...before,
        arrived_at: extendedArrival(crawl.arrived_at, stop.minutes, minutes, Date.now()),
      };
      // Samme nøgle som Tjek ind, så den nyeste ændring vinder over ankomsten, der stadig holdes fast.
      const forward = withCrawl(after);
      const held = show("crawl", forward);
      const written = await writeCrawl({ arrived_at: after.arrived_at }, before, ARRIVAL);
      if (!saved(written)) return rejected(held, withCrawl(before), written.error);
      held.release();

      offerUndo(`${minutes} min. mere på ${stop.name}`, async () => {
        const back = show("crawl", withCrawl(before));
        const result = await writeCrawl({ arrived_at: before.arrived_at }, after, ARRIVAL);
        if (!saved(result)) return failed(back, forward, result.error);
        back.release();
        ask.toast("Én til her er fortrudt");
      });
    },

    // Træk en ny: en ny udfordring til hele holdet. Den gamle beholder sine stemmer og kan fås tilbage.
    async newChallenge() {
      const before = fieldsOf(crawl);
      const drawn = drawChallenge(members, crawl.challenge);
      const after: CrawlFields = { ...before, challenge: drawn.text, current_challenge_id: null };
      let forward = withCrawl(after);
      let held = show("crawl", forward);
      // games: en ny række for hver udfordring. Den gamle beholder sine stemmer.
      const challengeId = needsVote(drawn.text)
        ? await insertChallenge(supabase, {
            crawl_id: id,
            stop_id: crawl.current_stop_id,
            text: drawn.text,
            target_user_id: drawn.target?.user_id ?? null,
          })
        : null;
      if (challengeId) {
        after.current_challenge_id = challengeId;
        forward = withCrawl(after);
        held = show("crawl", forward);
      }
      const written = await writeCrawl(crawlRow(after, before), before, CHALLENGE);
      if (!saved(written)) return rejected(held, withCrawl(before), written.error);
      held.release();

      offerUndo("Ny udfordring trukket", async () => {
        const back = show("crawl", withCrawl(before));
        const result = await writeCrawl(crawlRow(before, after), after, CHALLENGE);
        if (!saved(result)) return failed(back, forward, result.error);
        back.release();
        ask.toast("Den gamle udfordring er tilbage");
      });
    },

    // Fjern pub. Pubben skjules med det samme, men slettes først, når Fortryd er forbi.
    // Så mister den ikke sine stjerner, og drinks, billeder og omgange bliver ved pubben.
    async deleteStop(stop: Stop) {
      const wasCurrent = crawl.current_stop_id === stop.id;
      const before = fieldsOf(crawl);
      const key = `stop:${stop.id}`;
      // Databasen sætter current_stop_id til null, når den nuværende pub slettes. Det gør vi også.
      const removed = withoutStop(stop, wasCurrent);
      const held = hold(key, removed);
      const deletes = pendingDeletes.current;

      async function send() {
        clearTimeout(timer);
        deletes.delete(stop.id);
        const { error } = await supabase.from("stops").delete().eq("id", stop.id);
        if (error) {
          held.drop();
          void refetch();
          ask.toast(arrangerErrorText(error), "danger");
          return;
        }
        patch((p) => ({ ...p, ...removed({ crawl: p.crawl, stops: p.stops }) }));
        held.release();
      }
      const timer = setTimeout(() => void send(), DELETE_AFTER_MS);
      deletes.set(stop.id, () => void send());

      offerUndo(`${stop.name} er fjernet fra ruten`, async () => {
        if (deletes.has(stop.id)) {
          // Ikke sendt endnu: der er intet at skrive.
          clearTimeout(timer);
          deletes.delete(stop.id);
          held.drop();
          ask.toast(`${stop.name} er tilbage på ruten`);
          return;
        }
        // Sletningen nåede at blive sendt, fx fordi appen blev lukket imens. Så lægges pubben ind igen.
        const back = show(key, withStopBack(stop, wasCurrent, before));
        const { error } = await supabase.from("stops").upsert(
          {
            id: stop.id,
            crawl_id: stop.crawl_id,
            name: stop.name,
            lat: stop.lat,
            lng: stop.lng,
            position: stop.position,
            minutes: stop.minutes,
            visited_at: stop.visited_at,
            created_at: stop.created_at,
          },
          { onConflict: "id", ignoreDuplicates: true },
        );
        if (error) return failed(back, removed, error);
        if (wasCurrent) {
          // Var det pubben, vi stod på, står vi der igen, medmindre holdet er gået et andet sted hen.
          await supabase.from("crawls").update(crawlRow(before, NOBODY)).eq("id", id).is("current_stop_id", null);
        }
        back.release();
        ask.toast(`${stop.name} er tilbage på ruten`);
      });
    },
  };
}
