"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { arrangerErrorText, canEditRoute, isArranger, isRouteLocked, type ArrangerCrawl } from "./arranger";
import { forgetCrawl, rememberCrawl } from "./recent";
import { getSupabase } from "./supabase";
import type { Crawl, Member } from "./types";
import type { useCrawl } from "./use-crawl";

type CrawlState = ReturnType<typeof useCrawl>;

// Fejltekst ved fejl, ellers null.
type Result = Promise<string | null>;

// Arrangørens værktøjer (lås ruten, fjern, ny kode, giv rollen videre) og det, alle
// andre skal reagere på: ny kode, og at man selv er blevet fjernet fra holdet.
export function useArranger(state: CrawlState, userId: string) {
  const { crawl, members, loaded, patch, refetch } = state;
  const router = useRouter();
  const crawlId = crawl.id;

  // Ny kode: husk den nye på enheden og ret adressen, så et genindlæs stadig virker.
  const lastCode = useRef(crawl.code);
  useEffect(() => {
    const previous = lastCode.current;
    lastCode.current = crawl.code;
    if (previous === crawl.code) return;
    forgetCrawl(previous);
    rememberCrawl({ code: crawl.code, name: crawl.name });
    if (window.location.pathname.toUpperCase() === `/T/${previous}`) {
      window.history.replaceState(null, "", `/t/${crawl.code}`);
    }
  }, [crawl.code, crawl.name]);

  // Er man ikke længere på holdet (fjernet af arrangøren), sendes man til forsiden.
  const wasMember = useRef(false);
  const meInCrew = members.some((m) => m.user_id === userId);
  useEffect(() => {
    if (!loaded) return;
    if (meInCrew) {
      wasMember.current = true;
      return;
    }
    if (!wasMember.current) return;
    wasMember.current = false;
    forgetCrawl(crawl.code);
    router.replace("/");
  }, [loaded, meInCrew, crawl.code, router]);

  // Slettede deltagere kan ikke filtreres på crawl_id, så vi lytter selv og henter igen.
  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase
      .channel(`arranger:${crawlId}`)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "members" }, (payload) => {
        const old = payload.old as Partial<Member>;
        if (!old.crawl_id || old.crawl_id === crawlId) void refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [crawlId, refetch]);

  function applyCrawl(row: Crawl | null) {
    if (row) patch((p) => ({ ...p, crawl: { ...p.crawl, ...row } }));
  }

  async function callCrawl(fn: string, args: Record<string, unknown>): Result {
    const { data, error } = await getSupabase().rpc(fn, args).single<Crawl>();
    if (error) return arrangerErrorText(error);
    applyCrawl(data);
    return null;
  }

  return {
    isArranger: isArranger(crawl, userId),
    canEditRoute: canEditRoute(crawl, userId),
    async setRouteLocked(locked: boolean): Result {
      const was = isRouteLocked(crawl);
      const set = (value: boolean) =>
        patch((p) => ({ ...p, crawl: { ...p.crawl, route_locked: value } as ArrangerCrawl }));
      set(locked);
      const error = await callCrawl("set_route_locked", { p_crawl: crawlId, p_locked: locked });
      if (error) set(was);
      return error;
    },
    async removeMember(member: Member): Result {
      const { error } = await getSupabase().rpc("remove_member", { p_crawl: crawlId, p_user: member.user_id });
      if (error) return arrangerErrorText(error);
      // Drinks forsvinder med deltageren i databasen, så de fjernes også her.
      patch((p) => ({
        ...p,
        members: p.members.filter((m) => m.user_id !== member.user_id),
        drinks: p.drinks.filter((d) => d.user_id !== member.user_id),
      }));
      return null;
    },
    rotateCode(): Result {
      return callCrawl("rotate_code", { p_crawl: crawlId });
    },
    transferRole(member: Member): Result {
      return callCrawl("transfer_arranger", { p_crawl: crawlId, p_user: member.user_id });
    },
  };
}

export type ArrangerTools = ReturnType<typeof useArranger>;
