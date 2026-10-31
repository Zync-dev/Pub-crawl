"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { drawChallenge } from "@/lib/challenges";
import { getSupabase } from "@/lib/supabase";
import type { Crawl, Drink, DrinkKind, LatLng, Stop } from "@/lib/types";
import { useCrawl, useNow } from "@/lib/use-crawl";
import { useLocationSharing } from "@/lib/use-location";
import { DRINK_BY_KIND } from "@/lib/drinks";
import { CrewTab } from "./crew-tab";
import { DrinksTab } from "./drinks-tab";
import { MapTab } from "./map-tab";
import { NowBar } from "./now-bar";
import { StatsTab } from "./stats-tab";

type Tab = "map" | "drinks" | "stats" | "crew";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "map", label: "Ruten", icon: "🗺️" },
  { id: "drinks", label: "Drinks", icon: "🍺" },
  { id: "stats", label: "Stats", icon: "📊" },
  { id: "crew", label: "Holdet", icon: "👥" },
];

export type CrawlActions = ReturnType<typeof useActions>;

function useActions(
  crawl: Crawl,
  stops: Stop[],
  memberNames: string[],
  userId: string,
  patch: ReturnType<typeof useCrawl>["patch"],
) {
  const supabase = getSupabase();
  const id = crawl.id;

  return {
    async arrive(stop: Stop) {
      const now = new Date().toISOString();
      const challenge = drawChallenge(memberNames, crawl.challenge);
      patch((p) => ({
        ...p,
        crawl: { ...p.crawl, current_stop_id: stop.id, arrived_at: now, challenge },
        stops: p.stops.map((s) => (s.id === stop.id ? { ...s, visited_at: s.visited_at ?? now } : s)),
      }));
      if (!stop.visited_at) {
        await supabase.from("stops").update({ visited_at: now }).eq("id", stop.id);
      }
      await supabase
        .from("crawls")
        .update({ current_stop_id: stop.id, arrived_at: now, challenge })
        .eq("id", id);
    },
    async leave() {
      patch((p) => ({
        ...p,
        crawl: { ...p.crawl, current_stop_id: null, arrived_at: null, challenge: null },
      }));
      await supabase
        .from("crawls")
        .update({ current_stop_id: null, arrived_at: null, challenge: null })
        .eq("id", id);
    },
    async newChallenge() {
      const challenge = drawChallenge(memberNames, crawl.challenge);
      patch((p) => ({ ...p, crawl: { ...p.crawl, challenge } }));
      await supabase.from("crawls").update({ challenge }).eq("id", id);
    },
    async extend(minutes: number) {
      if (!crawl.arrived_at) return;
      // Forlænger ved at skubbe ankomsttiden, så timeren følger med for alle.
      const arrived_at = new Date(new Date(crawl.arrived_at).getTime() + minutes * 60_000).toISOString();
      patch((p) => ({ ...p, crawl: { ...p.crawl, arrived_at } }));
      await supabase.from("crawls").update({ arrived_at }).eq("id", id);
    },
    async addStop(name: string, at: LatLng) {
      const position = stops.length ? Math.max(...stops.map((s) => s.position)) + 1 : 0;
      const { data } = await supabase
        .from("stops")
        .insert({ crawl_id: id, name: name.trim().slice(0, 60), lat: at.lat, lng: at.lng, position })
        .select()
        .single<Stop>();
      if (data) patch((p) => ({ ...p, stops: [...p.stops.filter((s) => s.id !== data.id), data] }));
    },
    async moveStop(stop: Stop, direction: -1 | 1) {
      const index = stops.findIndex((s) => s.id === stop.id);
      const other = stops[index + direction];
      if (!other) return;
      // Positionerne kan være ens efter samtidige tilføjelser, så vi nummererer hele ruten om.
      const order = stops.slice();
      order[index] = other;
      order[index + direction] = stop;
      patch((p) => ({ ...p, stops: order.map((s, i) => ({ ...s, position: i })) }));
      await Promise.all(
        order.map((s, i) =>
          s.position === i ? null : supabase.from("stops").update({ position: i }).eq("id", s.id),
        ),
      );
    },
    async renameStop(stop: Stop, name: string) {
      patch((p) => ({ ...p, stops: p.stops.map((s) => (s.id === stop.id ? { ...s, name } : s)) }));
      await supabase.from("stops").update({ name: name.trim().slice(0, 60) }).eq("id", stop.id);
    },
    async setMinutes(stop: Stop, minutes: number) {
      const clamped = Math.min(240, Math.max(5, Math.round(minutes)));
      patch((p) => ({
        ...p,
        stops: p.stops.map((s) => (s.id === stop.id ? { ...s, minutes: clamped } : s)),
      }));
      await supabase.from("stops").update({ minutes: clamped }).eq("id", stop.id);
    },
    async setVisited(stop: Stop, visited: boolean) {
      const visited_at = visited ? new Date().toISOString() : null;
      patch((p) => ({ ...p, stops: p.stops.map((s) => (s.id === stop.id ? { ...s, visited_at } : s)) }));
      await supabase.from("stops").update({ visited_at }).eq("id", stop.id);
    },
    async deleteStop(stop: Stop) {
      patch((p) => ({ ...p, stops: p.stops.filter((s) => s.id !== stop.id) }));
      await supabase.from("stops").delete().eq("id", stop.id);
    },
    async addDrink(kind: DrinkKind) {
      const { data } = await supabase
        .from("drinks")
        .insert({
          crawl_id: id,
          user_id: userId,
          stop_id: crawl.current_stop_id,
          kind,
          units: DRINK_BY_KIND[kind].units,
        })
        .select()
        .single<Drink>();
      if (data) patch((p) => ({ ...p, drinks: [...p.drinks.filter((d) => d.id !== data.id), data] }));
    },
    async deleteDrink(drink: Drink) {
      patch((p) => ({ ...p, drinks: p.drinks.filter((d) => d.id !== drink.id) }));
      await supabase.from("drinks").delete().eq("id", drink.id);
    },
    async rename(name: string) {
      const clean = name.trim().slice(0, 30);
      if (!clean) return;
      patch((p) => ({
        ...p,
        members: p.members.map((m) => (m.user_id === userId ? { ...m, name: clean } : m)),
      }));
      await supabase.from("members").update({ name: clean }).eq("crawl_id", id).eq("user_id", userId);
    },
    async renameCrawl(name: string) {
      const clean = name.trim().slice(0, 40);
      if (!clean) return;
      patch((p) => ({ ...p, crawl: { ...p.crawl, name: clean } }));
      await supabase.from("crawls").update({ name: clean }).eq("id", id);
    },
    async leaveCrawl() {
      await supabase.from("members").delete().eq("crawl_id", id).eq("user_id", userId);
    },
  };
}

export function CrawlApp({ initial, userId }: { initial: Crawl; userId: string }) {
  const data = useCrawl(initial.id, initial);
  const { crawl, members, stops, drinks } = data;
  const now = useNow(1000);
  const location = useLocationSharing(crawl.id, userId);
  const [tab, setTab] = useState<Tab>("map");

  const memberNames = useMemo(() => members.map((m) => m.name), [members]);
  const actions = useActions(crawl, stops, memberNames, userId, data.patch);
  const currentStop = stops.find((s) => s.id === crawl.current_stop_id) ?? null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="border-b border-line bg-surface/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-muted" aria-label="Til forsiden">
            ‹ Ture
          </Link>
          <h1 className="truncate text-base font-semibold">{crawl.name}</h1>
          <span className="font-mono text-xs text-muted">{crawl.code}</span>
        </div>
        <NowBar
          crawl={crawl}
          stops={stops}
          currentStop={currentStop}
          myPosition={location.position}
          now={now}
          actions={actions}
        />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "map" && (
          <MapTab
            stops={stops}
            members={members}
            userId={userId}
            currentStopId={crawl.current_stop_id}
            myPosition={location.position}
            now={now}
            actions={actions}
          />
        )}
        {tab === "drinks" && (
          <DrinksTab
            drinks={drinks}
            stops={stops}
            userId={userId}
            currentStop={currentStop}
            now={now}
            actions={actions}
          />
        )}
        {tab === "stats" && (
          <StatsTab members={members} drinks={drinks} stops={stops} userId={userId} now={now} />
        )}
        {tab === "crew" && (
          <CrewTab
            crawl={crawl}
            members={members}
            userId={userId}
            now={now}
            location={location}
            actions={actions}
          />
        )}
      </main>

      <nav className="grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
              tab === t.id ? "text-gold" : "text-muted"
            }`}
            aria-current={tab === t.id ? "page" : undefined}
          >
            <span className="text-lg leading-none" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
