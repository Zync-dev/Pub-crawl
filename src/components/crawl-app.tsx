"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { drawChallenge } from "@/lib/challenges";
import { DRINK_BY_KIND, formatUnits } from "@/lib/drinks";
import { distanceMeters, formatDistance } from "@/lib/geo";
import { getSupabase } from "@/lib/supabase";
import { formatClock, formatTime, remainingMs } from "@/lib/timer";
import type { Crawl, Drink, DrinkKind, LatLng, Stop } from "@/lib/types";
import { useCrawl, useNow } from "@/lib/use-crawl";
import { useLocationSharing } from "@/lib/use-location";
import { useAsk } from "./ask";
import { CrewTab } from "./crew-tab";
import { Badge, Header, Icon, TabBar } from "./ds";
import { MapTab } from "./map-tab";
import { NowTab } from "./now-tab";
import { StatsTab } from "./stats-tab";

type Tab = "now" | "route" | "stats" | "crew";

const TABS = [
  { id: "now", label: "Nu", icon: "stamp" },
  { id: "route", label: "Ruten", icon: "route" },
  { id: "stats", label: "Stillingen", icon: "chart-column" },
  { id: "crew", label: "Holdet", icon: "users" },
] as const satisfies { id: Tab; label: string; icon: string }[];

export type CrawlActions = ReturnType<typeof useActions>;

function useActions(
  crawl: Crawl,
  stops: Stop[],
  memberNames: string[],
  userId: string,
  patch: ReturnType<typeof useCrawl>["patch"],
) {
  const supabase = getSupabase();
  const ask = useAsk();
  const id = crawl.id;

  // Skriver fejl ud som en toast, så ingen tror, at noget er gemt, når det ikke er.
  async function run(request: PromiseLike<{ error: unknown }>) {
    const { error } = await request;
    if (error) ask.toast("Det blev ikke gemt. Tjek forbindelsen.", "danger");
    return !error;
  }

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
        await run(supabase.from("stops").update({ visited_at: now }).eq("id", stop.id));
      }
      if (await run(supabase.from("crawls").update({ current_stop_id: stop.id, arrived_at: now, challenge }).eq("id", id))) {
        ask.toast(`Tjekket ind på ${stop.name}`);
      }
    },
    async leave() {
      patch((p) => ({
        ...p,
        crawl: { ...p.crawl, current_stop_id: null, arrived_at: null, challenge: null },
      }));
      await run(
        supabase.from("crawls").update({ current_stop_id: null, arrived_at: null, challenge: null }).eq("id", id),
      );
    },
    async newChallenge() {
      const challenge = drawChallenge(memberNames, crawl.challenge);
      patch((p) => ({ ...p, crawl: { ...p.crawl, challenge } }));
      await run(supabase.from("crawls").update({ challenge }).eq("id", id));
    },
    async extend(minutes: number) {
      if (!crawl.arrived_at) return;
      // Forlænger ved at skubbe ankomsttiden, så timeren følger med for alle.
      const arrived_at = new Date(new Date(crawl.arrived_at).getTime() + minutes * 60_000).toISOString();
      patch((p) => ({ ...p, crawl: { ...p.crawl, arrived_at } }));
      await run(supabase.from("crawls").update({ arrived_at }).eq("id", id));
    },
    async addStop(name: string, at: LatLng) {
      const position = stops.length ? Math.max(...stops.map((s) => s.position)) + 1 : 0;
      const { data, error } = await supabase
        .from("stops")
        .insert({ crawl_id: id, name: name.trim().slice(0, 60), lat: at.lat, lng: at.lng, position })
        .select()
        .single<Stop>();
      if (error || !data) {
        ask.toast("Pubben blev ikke lagt på ruten.", "danger");
        return;
      }
      patch((p) => ({ ...p, stops: [...p.stops.filter((s) => s.id !== data.id), data] }));
      ask.toast(`${data.name} er lagt på ruten`);
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
          s.position === i ? null : run(supabase.from("stops").update({ position: i }).eq("id", s.id)),
        ),
      );
    },
    async renameStop(stop: Stop, name: string) {
      patch((p) => ({ ...p, stops: p.stops.map((s) => (s.id === stop.id ? { ...s, name } : s)) }));
      await run(supabase.from("stops").update({ name: name.trim().slice(0, 60) }).eq("id", stop.id));
    },
    async setMinutes(stop: Stop, minutes: number) {
      const clamped = Math.min(240, Math.max(5, Math.round(minutes)));
      patch((p) => ({
        ...p,
        stops: p.stops.map((s) => (s.id === stop.id ? { ...s, minutes: clamped } : s)),
      }));
      await run(supabase.from("stops").update({ minutes: clamped }).eq("id", stop.id));
    },
    async setVisited(stop: Stop, visited: boolean) {
      const visited_at = visited ? new Date().toISOString() : null;
      patch((p) => ({ ...p, stops: p.stops.map((s) => (s.id === stop.id ? { ...s, visited_at } : s)) }));
      await run(supabase.from("stops").update({ visited_at }).eq("id", stop.id));
    },
    async deleteStop(stop: Stop) {
      patch((p) => ({ ...p, stops: p.stops.filter((s) => s.id !== stop.id) }));
      await run(supabase.from("stops").delete().eq("id", stop.id));
    },
    async addDrink(kind: DrinkKind) {
      const { data, error } = await supabase
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
      if (error || !data) {
        ask.toast("Den kom ikke med. Prøv igen.", "danger");
        return;
      }
      patch((p) => ({ ...p, drinks: [...p.drinks.filter((d) => d.id !== data.id), data] }));
      ask.toast(`${DRINK_BY_KIND[kind].label} skrevet på`);
    },
    async deleteDrink(drink: Drink) {
      patch((p) => ({ ...p, drinks: p.drinks.filter((d) => d.id !== drink.id) }));
      await run(supabase.from("drinks").delete().eq("id", drink.id));
    },
    async rename(name: string) {
      const clean = name.trim().slice(0, 30);
      if (!clean) return;
      patch((p) => ({
        ...p,
        members: p.members.map((m) => (m.user_id === userId ? { ...m, name: clean } : m)),
      }));
      await run(supabase.from("members").update({ name: clean }).eq("crawl_id", id).eq("user_id", userId));
    },
    async renameCrawl(name: string) {
      const clean = name.trim().slice(0, 40);
      if (!clean) return;
      patch((p) => ({ ...p, crawl: { ...p.crawl, name: clean } }));
      await run(supabase.from("crawls").update({ name: clean }).eq("id", id));
    },
    async leaveCrawl() {
      return run(supabase.from("members").delete().eq("crawl_id", id).eq("user_id", userId));
    },
  };
}

export function CrawlApp({ initial, userId }: { initial: Crawl; userId: string }) {
  const data = useCrawl(initial.id, initial);
  const { crawl, members, stops, drinks } = data;
  const now = useNow(1000);
  const location = useLocationSharing(crawl.id, userId);
  const [tab, setTab] = useState<Tab>("now");

  const memberNames = useMemo(() => members.map((m) => m.name), [members]);
  const actions = useActions(crawl, stops, memberNames, userId, data.patch);
  const currentStop = stops.find((s) => s.id === crawl.current_stop_id) ?? null;
  const nextStop = currentStop ? null : (stops.find((s) => !s.visited_at) ?? null);
  const remaining = remainingMs(crawl, currentStop, now);

  const back = (
    <Link href="/" className="pc-btn pc-btn--ghost pc-btn--sm" style={{ paddingLeft: 6 }}>
      <Icon name="chevron-left" size={16} />
      Ture
    </Link>
  );

  // Timeren følger med i toppen, når man kigger på de andre faner.
  const timerBadge =
    tab !== "now" && remaining !== null ? (
      <button onClick={() => setTab("now")} aria-label="Gå til timeren" style={{ background: "none", border: 0, padding: 0 }}>
        <Badge tone={remaining < 0 ? "oxblood" : "gold"} icon="timer">
          {formatClock(remaining)}
        </Badge>
      </button>
    ) : undefined;

  const header = (() => {
    if (tab === "now") {
      if (currentStop) {
        const index = stops.indexOf(currentStop);
        return {
          eyebrow: `Pub ${index + 1} af ${stops.length} · ankom ${crawl.arrived_at ? formatTime(crawl.arrived_at) : ""}`,
          title: currentStop.name,
        };
      }
      if (nextStop) {
        const index = stops.indexOf(nextStop);
        const meters = location.position ? distanceMeters(location.position, nextStop) : null;
        return {
          eyebrow: `På vej · pub ${index + 1} af ${stops.length}${meters !== null ? ` · ${formatDistance(meters)}` : ""}`,
          title: nextStop.name,
        };
      }
      return {
        eyebrow: crawl.name,
        title: stops.length ? "Ruten er gået" : "Aftenens rute",
      };
    }
    if (tab === "route") {
      const meters = stops.slice(1).reduce((sum, s, i) => sum + distanceMeters(stops[i], s), 0);
      return {
        eyebrow: `${crawl.name} · ${stops.length} pubs${stops.length > 1 ? ` · ${formatDistance(meters)}` : ""}`,
        title: "Aftenens rute",
      };
    }
    if (tab === "stats") {
      const units = drinks.reduce((sum, d) => sum + Number(d.units), 0);
      return { eyebrow: `${formatUnits(units)} genstande i alt`, title: "Stillingen" };
    }
    return {
      eyebrow: `${members.length} på holdet · kode ${crawl.code}`,
      title: "Holdet",
    };
  })();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-cream-200">
      <Header eyebrow={header.eyebrow} title={header.title} left={back} right={timerBadge} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "now" && (
          <NowTab
            crawl={crawl}
            stops={stops}
            drinks={drinks}
            currentStop={currentStop}
            nextStop={nextStop}
            remaining={remaining}
            userId={userId}
            now={now}
            actions={actions}
            onOpenRoute={() => setTab("route")}
          />
        )}
        {tab === "route" && (
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
        {tab === "stats" && (
          <StatsTab members={members} drinks={drinks} stops={stops} userId={userId} now={now} />
        )}
        {tab === "crew" && (
          <CrewTab
            crawl={crawl}
            members={members}
            drinks={drinks}
            userId={userId}
            now={now}
            location={location}
            actions={actions}
          />
        )}
      </main>

      <TabBar items={[...TABS]} value={tab} onChange={setTab} />
    </div>
  );
}
