"use client";

import { insertChallenge } from "@/lib/challenge-rows";
import { drawChallenge } from "@/lib/challenges";
import { getSupabase } from "@/lib/supabase";
import type { Crawl, Member, Stop } from "@/lib/types";
import type { CrawlData } from "@/lib/use-crawl";
import type { HeldView, HoldChange, HoldHandle } from "@/lib/use-holds";
import { useAsk } from "./ask";

// Tjek ind, Videre og Fjern pub med "Fortryd" i toasten i ca. 6 sekunder.
// Fortryd skriver kun, hvis turen stadig ser ud, som vi efterlod den, så to telefoner
// ikke fortryder hinandens ændringer, og et dobbelttryk gør ingenting anden gang.

// games: current_challenge_id følger med, så Fortryd også giver den gamle udfordring og dens stemmer tilbage.
type CrawlFields = Pick<Crawl, "current_stop_id" | "arrived_at" | "challenge"> & {
  current_challenge_id: string | null;
};

const UNDO_MS = 6_000;
const NOBODY: CrawlFields = { current_stop_id: null, arrived_at: null, challenge: null, current_challenge_id: null };

const byPosition = (a: Stop, b: Stop) => a.position - b.position || a.created_at.localeCompare(b.created_at);

const fieldsOf = (crawl: Crawl): CrawlFields => ({
  current_stop_id: crawl.current_stop_id,
  arrived_at: crawl.arrived_at,
  challenge: crawl.challenge,
  current_challenge_id: crawl.current_challenge_id ?? null,
});

// games: rækken til crawls. current_challenge_id skrives kun, når der er noget at skrive
// (en ny værdi, eller en gammel, der skal ryddes), så det også virker uden migration 0006.
function crawlRow(fields: CrawlFields, replacing: CrawlFields) {
  const { current_challenge_id, ...rest } = fields;
  return current_challenge_id || replacing.current_challenge_id ? { ...rest, current_challenge_id } : rest;
}

// Sætter turens felter og eventuelt én pubs visited_at.
function withCrawl(fields: CrawlFields, visited?: { stopId: string; at: string | null }): HoldChange {
  return (v) => ({
    crawl: { ...v.crawl, ...fields },
    stops: visited ? v.stops.map((s) => (s.id === visited.stopId ? { ...s, visited_at: visited.at } : s)) : v.stops,
  });
}

// Kan kun køres én gang, uanset hvor mange gange der trykkes.
function once(fn: () => Promise<void>) {
  let used = false;
  return () => {
    if (used) return;
    used = true;
    void fn();
  };
}

export type UndoableActions = ReturnType<typeof useUndoableActions>;

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

  async function run(request: PromiseLike<{ error: unknown }>) {
    const { error } = await request;
    if (error) ask.toast("Det blev ikke gemt. Tjek forbindelsen.", "danger");
    return !error;
  }

  // Ændringen lægges i data og holdes fast, til skrivningen er færdig og ekkoet er kommet.
  function show(key: string, change: HoldChange) {
    patch((p) => ({ ...p, ...change({ crawl: p.crawl, stops: p.stops }) }));
    return hold(key, change);
  }

  // Fortryd lykkedes ikke: vis det, vi havde, og hent turen igen, så vi ser det samme som holdet.
  function failed(back: HoldHandle, redo: HoldChange, error: { code?: string } | null) {
    back.drop();
    patch((p) => ({ ...p, ...redo({ crawl: p.crawl, stops: p.stops } satisfies HeldView) }));
    void refetch();
    ask.toast(
      !error
        ? "Holdet nåede at ændre det."
        : error.code === "23503"
          ? "Pubben er ikke på ruten længere."
          : "Det blev ikke fortrudt. Tjek forbindelsen.",
      "danger",
    );
  }

  function offerUndo(message: string, undo: () => Promise<void>) {
    ask.toast(message, { action: { label: "Fortryd", onClick: once(undo) }, duration: UNDO_MS });
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
      let forward = withCrawl(after, { stopId: stop.id, at: visitedBefore ?? now });
      let held = show("crawl", forward);
      let ok = true;
      if (!visitedBefore) {
        ok = await run(supabase.from("stops").update({ visited_at: now }).eq("id", stop.id));
      }
      const challengeId = await insertChallenge(supabase, {
        crawl_id: id,
        stop_id: stop.id,
        text: drawn.text,
        target_user_id: drawn.target?.user_id ?? null,
      });
      if (challengeId) {
        after.current_challenge_id = challengeId;
        forward = withCrawl(after, { stopId: stop.id, at: visitedBefore ?? now });
        // Samme nøgle, så det nye hold erstatter det første.
        held = show("crawl", forward);
      }
      ok = (await run(supabase.from("crawls").update(crawlRow(after, before)).eq("id", id))) && ok;
      held.release();
      if (!ok) return;

      offerUndo(`Tjekket ind på ${stop.name}`, async () => {
        const back = show("crawl", withCrawl(before, { stopId: stop.id, at: visitedBefore }));
        const { data, error } = await supabase
          .from("crawls")
          .update(crawlRow(before, after))
          .eq("id", id)
          .eq("current_stop_id", stop.id)
          .eq("arrived_at", now)
          .select("id");
        if (error || !data?.length) return failed(back, forward, error);
        if (!visitedBefore) {
          const visited = await supabase
            .from("stops")
            .update({ visited_at: null })
            .eq("id", stop.id)
            .eq("visited_at", now);
          if (visited.error) return failed(back, withCrawl(before), visited.error);
        }
        back.release();
        ask.toast("Tjek ind er fortrudt");
      });
    },

    async leave() {
      const before = fieldsOf(crawl);
      const stop = stops.find((s) => s.id === crawl.current_stop_id);
      const forward = withCrawl(NOBODY);
      const held = show("crawl", forward);
      const ok = await run(supabase.from("crawls").update(crawlRow(NOBODY, before)).eq("id", id));
      held.release();
      if (!ok) return false;
      if (!before.current_stop_id) return true;

      offerUndo(stop ? `Videre fra ${stop.name}` : "I er videre", async () => {
        const back = show("crawl", withCrawl(before));
        // Kun hvis ingen er tjekket ind et andet sted i mellemtiden.
        const { data, error } = await supabase
          .from("crawls")
          .update(crawlRow(before, NOBODY))
          .eq("id", id)
          .is("current_stop_id", null)
          .select("id");
        if (error || !data?.length) return failed(back, forward, error);
        back.release();
        ask.toast(stop ? `Tilbage på ${stop.name}` : "Videre er fortrudt");
      });
      return true;
    },

    async deleteStop(stop: Stop) {
      const wasCurrent = crawl.current_stop_id === stop.id;
      const before = fieldsOf(crawl);
      const key = `stop:${stop.id}`;
      // Databasen sætter current_stop_id til null, når den nuværende pub slettes. Det gør vi også.
      const removed: HoldChange = (v) => ({
        crawl: wasCurrent && v.crawl.current_stop_id === stop.id ? { ...v.crawl, current_stop_id: null } : v.crawl,
        stops: v.stops.filter((s) => s.id !== stop.id),
      });
      const held = show(key, removed);
      const ok = await run(supabase.from("stops").delete().eq("id", stop.id));
      held.release();
      if (!ok) return;

      offerUndo(`${stop.name} er fjernet fra ruten`, async () => {
        const restored: HoldChange = (v) => ({
          crawl: wasCurrent && !v.crawl.current_stop_id ? { ...v.crawl, ...before } : v.crawl,
          stops: [...v.stops.filter((s) => s.id !== stop.id), stop].sort(byPosition),
        });
        const back = show(key, restored);
        // Samme id, så det er den samme pub igen. Findes den allerede, sker der ingenting.
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
