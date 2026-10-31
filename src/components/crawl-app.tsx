"use client";

import { CloudOff, Dices } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { arrangerErrorText } from "@/lib/arranger";
import { DRINK_BY_KIND, formatGenstande } from "@/lib/drinks";
import { distanceMeters, formatDistance } from "@/lib/geo";
import { formatPubs, nextStopOnRoute } from "@/lib/route";
import { getSupabase } from "@/lib/supabase";
import { once } from "@/lib/undo-fields";
import { formatClock, formatTime, remainingMs } from "@/lib/timer";
import type { Crawl, Drink, DrinkKind, LatLng, Stop } from "@/lib/types";
import { useArranger } from "@/lib/use-arranger"; // arranger
import { useCrawl, useNow } from "@/lib/use-crawl";
import { useCrewNotifications, useRollCallNotification } from "@/lib/use-crew-notifications";
import { usePushNudge } from "./use-push-nudge";
import { useDrinkOutbox, type DrinkOutbox } from "@/lib/use-drink-outbox";
import { useHolds } from "@/lib/use-holds";
import { useLocationSharing } from "@/lib/use-location";
import { useAsk } from "./ask";
import { CrewTab } from "./crew-tab";
import { Badge, Header, Icon, Spinner, TabBar, type IconName } from "./ds";
import { GamesProvider } from "./games/games-provider";
import { GamesTab } from "./games/games-tab";
import { MapTab } from "./map-tab";
import { NowTab } from "./now-tab";
import { OutboxBadge } from "./outbox-badge";
import { RollCallBadge, RollCallProvider, useRollCallWithToasts } from "./roll-call"; // Er alle med? (rollcall)
import { RoundsProvider } from "./rounds"; // Omgange
import { StatsTab } from "./stats-tab";
import { HomeLink, StatusScreen } from "./status-screen";
import { useUndoableActions, type UndoableActions } from "./use-undoable-actions";

type Tab = "now" | "route" | "stats" | "crew" | "games";

const TABS = [
  { id: "now", label: "Nu", icon: "stamp" },
  { id: "route", label: "Ruten", icon: "route" },
  { id: "stats", label: "Stillingen", icon: "chart-column" },
  { id: "crew", label: "Holdet", icon: "users" },
  // games: fanen Spil
  { id: "games", label: "Spil", icon: Dices },
] as const satisfies { id: Tab; label: string; icon: IconName }[];

export type CrawlActions = ReturnType<typeof useActions>;

function useActions(
  crawl: Crawl,
  stops: Stop[],
  userId: string,
  patch: ReturnType<typeof useCrawl>["patch"],
  refetch: ReturnType<typeof useCrawl>["refetch"],
  // offline-undo: drinks går gennem køen, og Tjek ind, Videre og Fjern pub kan fortrydes.
  outbox: DrinkOutbox,
  undoable: UndoableActions,
) {
  const supabase = getSupabase();
  const ask = useAsk();
  const id = crawl.id;

  // Skriver fejl ud som en toast, så ingen tror, at noget er gemt, når det ikke er.
  // Det, vi viste på forhånd, rettes ved at hente turen igen, så vi ser det samme som holdet.
  async function run(request: PromiseLike<{ error: unknown }>) {
    const { error } = await request;
    if (error) {
      // Net, eller fx en rute, arrangøren har låst.
      ask.toast(arrangerErrorText(error), "danger");
      void refetch();
    }
    return !error;
  }

  return {
    // offline-undo: med Fortryd i toasten. Se use-undoable-actions.ts.
    // games: udfordringsrækken og current_challenge_id skrives også dér.
    arrive: (stop: Stop) => undoable.arrive(stop),
    leave: (onUndone?: () => void, onCommitted?: () => void) => undoable.leave(onUndone, onCommitted),
    // Med Fortryd, og de tjekker, at turen ikke er ændret imens. Se use-undoable-actions.ts.
    newChallenge: () => undoable.newChallenge(),
    extend: (minutes: number) => undoable.extend(minutes),
    async addStop(name: string, at: LatLng) {
      const position = stops.length ? Math.max(...stops.map((s) => s.position)) + 1 : 0;
      const { data, error } = await supabase
        .from("stops")
        .insert({ crawl_id: id, name: name.trim().slice(0, 60), lat: at.lat, lng: at.lng, position })
        .select()
        .single<Stop>();
      if (error || !data) {
        ask.toast("Pubben blev ikke lagt på ruten.", "danger");
        return false;
      }
      patch((p) => ({ ...p, stops: [...p.stops.filter((s) => s.id !== data.id), data] }));
      ask.toast(`${data.name} er lagt på ruten`);
      return true;
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
    // offline-undo: med Fortryd i toasten. Se use-undoable-actions.ts.
    deleteStop: (stop: Stop) => undoable.deleteStop(stop),
    // offline-undo: drinken får sit id i browseren og sendes gennem køen, så den også tæller uden net.
    async addDrink(kind: DrinkKind) {
      outbox.add({
        crawl_id: id,
        user_id: userId,
        stop_id: crawl.current_stop_id,
        kind,
        units: DRINK_BY_KIND[kind].units,
      });
    },
    // offline-undo: venter den stadig, fjernes den bare fra køen. Ellers sættes sletningen i kø.
    // Fortryd i toasten lægger den samme drink ind igen, med sin tid og sin pub.
    async deleteDrink(drink: Drink) {
      outbox.remove(drink);
      const label = DRINK_BY_KIND[drink.kind]?.label ?? "Drinken";
      ask.toast(`${label} er fjernet`, {
        action: { label: "Fortryd", onClick: once(async () => outbox.restore(drink)) },
      });
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
    // nav-live: et nyt live-link gælder med det samme, også hvis Realtime ikke sender rækken.
    setShareToken(token: string) {
      patch((p) => ({ ...p, crawl: { ...p.crawl, share_token: token } as Crawl }));
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
  // offline-undo: fastholdte ændringer (Fortryd) og ventende drinks lægges oven på det, useCrawl har.
  const ask = useAsk();
  const held = useHolds(data.crawl, data.stops);
  const outbox = useDrinkOutbox(initial.id, userId, data.drinks, data.patch, () =>
    ask.toast("En drink kunne ikke gemmes.", "danger"),
  );
  const { members } = data;
  const { crawl, stops } = held;
  const { drinks } = outbox;
  const now = useNow(1000);
  const location = useLocationSharing(crawl.id, userId);
  // arranger: arrangørens værktøjer, ny kode og fjernet fra holdet.
  // wiring: med den fastholdte tur, så låsen og rollen følger Fortryd som resten af appen.
  const arranger = useArranger({ ...data, crawl, stops }, userId);
  const [tab, setTab] = useState<Tab>("now");
  const [mapMounted, setMapMounted] = useState(false);
  const scroller = useRef<HTMLElement>(null);
  // Kort og lister behøver ikke at tegnes om hvert sekund.
  const slowNow = Math.floor(now / 30_000) * 30_000;

  function changeTab(next: Tab) {
    if (next === "route") setMapMounted(true);
    if (next !== tab) scroller.current?.scrollTo({ top: 0 });
    setTab(next);
  }

  const undoable = useUndoableActions({
    crawl,
    stops,
    members,
    patch: data.patch,
    refetch: data.refetch,
    hold: held.hold,
  });
  const actions = useActions(crawl, stops, userId, data.patch, data.refetch, outbox, undoable);
  const currentStop = stops.find((s) => s.id === crawl.current_stop_id) ?? null;
  const nextStop = currentStop ? null : nextStopOnRoute(stops, null);
  const remaining = remainingMs(crawl, currentStop, now);
  const overtime = remaining !== null && remaining <= 0;
  // Én vibration pr. ankomst, når tiden er gået. Her og ikke i Nu, så den også kommer på de andre
  // faner og ikke kommer igen, hver gang man går tilbage til Nu.
  const buzzed = useRef<string | null>(null);
  useEffect(() => {
    if (!overtime || !crawl.arrived_at) return;
    const key = `${crawl.current_stop_id}:${crawl.arrived_at}`;
    if (buzzed.current === key) return;
    buzzed.current = key;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {}
  }, [overtime, crawl.arrived_at, crawl.current_stop_id]);
  // Er alle med? (rollcall): opråbet deles af Nu, headeren og Videre-flowet via RollCallProvider.
  const rollCall = useRollCallWithToasts(crawl.id, userId, members, now);
  // pwa-push: "Sidste omgang" til holdet, når timeren løber ud.
  useCrewNotifications(crawl, currentStop, remaining);
  // pwa-push: spørg én gang, om telefonen skal have beskeder, når holdet er tjekket ind.
  usePushNudge(crawl.current_stop_id !== null);
  // wiring: "Er alle med?" til holdet, når du starter et opråb.
  useRollCallNotification(crawl, rollCall.call, rollCall.open, rollCall.startedByMe);

  const back = (
    <Link href="/" className="pc-btn pc-btn--ghost pc-btn--sm" style={{ paddingLeft: 6 }}>
      <Icon name="chevron-left" size={16} />
      Ture
    </Link>
  );

  // Timeren følger med i toppen, når man kigger på de andre faner.
  const timerBadge =
    tab !== "now" && remaining !== null ? (
      <button
        type="button"
        onClick={() => changeTab("now")}
        aria-label={`${remaining < 0 ? "Tiden er gået" : `${formatClock(remaining)} tilbage`}. Gå til timeren`}
        className="relative rounded-full"
        style={{ background: "none", border: 0, padding: 0 }}
      >
        {/* Større trykflade end selve mærket. */}
        <span aria-hidden className="absolute -inset-x-2 -inset-y-2.5" />
        <Badge tone={remaining < 0 ? "oxblood" : "gold"} icon="timer">
          <span className="tabular-nums">{formatClock(remaining)}</span>
        </Badge>
      </button>
    ) : undefined;

  // Er alle med? (rollcall): mærket følger med på de andre faner, mens opråbet er åbent.
  const rollCallBadge =
    tab !== "now" && rollCall.open ? <RollCallBadge onOpen={() => changeTab("now")} /> : undefined;

  // Uden net står det, der venter, i samme mærke, så titlen ikke bliver klemt.
  const offlineBadge = data.offline ? (
    <span className="pc-fade-in" role="status">
      <Badge tone="oxblood" icon={CloudOff}>
        {outbox.waiting > 0 ? `Ingen net · ${outbox.waiting} venter` : "Ingen net"}
      </Badge>
    </span>
  ) : undefined;
  // offline-undo: drinks, der venter på net.
  const outboxBadge = outbox.waiting > 0 ? <OutboxBadge count={outbox.waiting} /> : undefined;

  // Ét mærke ad gangen: opråbet, så forbindelsen, så timeren og til sidst køen.
  const headerRight = rollCallBadge ?? offlineBadge ?? timerBadge ?? outboxBadge;

  const header = (() => {
    // Før turen er hentet, ved vi ikke, hvor I er. Så hellere bare turens navn.
    if (!data.loaded) return { eyebrow: `Kode ${crawl.code}`, title: crawl.name };
    if (tab === "now") {
      if (currentStop) {
        const index = stops.indexOf(currentStop);
        // Ankomsten er pubbens visited_at. arrived_at flytter sig med Én til her.
        const arrived = currentStop.visited_at ?? crawl.arrived_at;
        return {
          eyebrow: `Pub ${index + 1} af ${stops.length}${arrived ? ` · ankom ${formatTime(arrived)}` : ""}`,
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
        eyebrow: `${crawl.name} · ${formatPubs(stops.length)}${stops.length > 1 ? ` · ${formatDistance(meters)}` : ""}`,
        title: "Aftenens rute",
      };
    }
    // games: overskrift for Spil
    if (tab === "games") {
      return { eyebrow: `${members.length} på holdet · lad tilfældet bestemme`, title: "Spil" };
    }
    if (tab === "stats") {
      const units = drinks.reduce((sum, d) => sum + Number(d.units), 0);
      return { eyebrow: `${formatGenstande(units)} i alt`, title: "Stillingen" };
    }
    return {
      eyebrow: `${members.length} på holdet · kode ${crawl.code}`,
      title: "Holdet",
    };
  })();

  const page = (
    <div className="flex h-dvh flex-col overflow-hidden bg-cream-200">
      {/* På vej skifter afstanden hele tiden. Eyebrowen toner kun ind, når fanen eller pubben skifter. */}
      <Header
        eyebrow={header.eyebrow}
        eyebrowKey={tab === "now" && data.loaded ? `now:${currentStop?.id ?? nextStop?.id ?? ""}` : undefined}
        title={header.title}
        left={back}
        right={headerRight}
      />

      <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {!data.loaded ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-green-800">
            <Spinner size={28} label="Henter turen" />
            <p className="pc-eyebrow text-muted">Henter turen</p>
          </div>
        ) : (
          <>
            {tab === "now" && (
              <div key="now" className="pc-enter">
                <NowTab
                  crawl={crawl}
                  stops={stops}
                  members={members}
                  drinks={drinks}
                  currentStop={currentStop}
                  nextStop={nextStop}
                  remaining={remaining}
                  userId={userId}
                  now={now}
                  actions={actions}
                  onOpenRoute={() => changeTab("route")}
                  canEditRoute={arranger.canEditRoute}
                  pendingDrinkIds={outbox.waitingIds}
                />
              </div>
            )}
            {/* Kortet bliver liggende, så det ikke skal hente fliserne igen ved hvert fanebyt. */}
            {mapMounted && (
              <div className={tab === "route" ? "pc-enter" : "hidden"}>
                <MapTab
                  visible={tab === "route"}
                  stops={stops}
                  members={members}
                  userId={userId}
                  currentStopId={crawl.current_stop_id}
                  myPosition={location.position}
                  now={slowNow}
                  actions={actions}
                  routeLocked={!arranger.canEditRoute}
                />
              </div>
            )}
            {tab === "stats" && (
              <div key="stats" className="pc-enter">
                <StatsTab code={crawl.code} members={members} drinks={drinks} stops={stops} userId={userId} now={slowNow} />
              </div>
            )}
            {tab === "crew" && (
              <div key="crew" className="pc-enter">
                <CrewTab
                  crawl={crawl}
                  members={members}
                  drinks={drinks}
                  userId={userId}
                  now={slowNow}
                  location={location}
                  actions={actions}
                  arranger={arranger}
                />
              </div>
            )}
            {/* games: fanen Spil */}
            {tab === "games" && (
              <div key="games" className="pc-enter">
                <GamesTab
                  onOpenPoints={() => {
                    changeTab("stats");
                    setTimeout(() => document.getElementById("udfordringer")?.scrollIntoView({ block: "start" }), 60);
                  }}
                />
              </div>
            )}
          </>
        )}
      </main>

      <TabBar items={[...TABS]} value={tab} onChange={changeTab} />
    </div>
  );

  // arranger: taget af holdet. Turen er glemt på enheden, så vi siger hvorfor i stedet for bare at forsvinde.
  if (arranger.removed) {
    return (
      <StatusScreen eyebrow={crawl.name} title="Du er ikke længere på holdet" actions={<HomeLink variant="primary" />}>
        Arrangøren har taget dig af holdet. Spørg arrangøren, hvis det er en fejl.
      </StatusScreen>
    );
  }

  // games: GamesProvider deler udfordringspoint og spilresultater mellem Nu, Stillingen og Spil.
  return (
    <GamesProvider
      crawlId={crawl.id}
      userId={userId}
      members={members}
      currentChallengeId={crawl.current_challenge_id ?? null}
      toastResults={tab !== "games"}
    >
      {/* Omgange: deler omgangene med Nu, Stillingen og Holdet. */}
      <RoundsProvider crawlId={crawl.id} userId={userId} members={members} stops={stops} currentStopId={crawl.current_stop_id}>
        {/* Er alle med? (rollcall) */}
        <RollCallProvider value={rollCall}>{page}</RollCallProvider>
      </RoundsProvider>
    </GamesProvider>
  );
}
