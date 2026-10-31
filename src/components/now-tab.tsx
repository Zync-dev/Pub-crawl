"use client";

import { CloudOff } from "lucide-react";
import { useRef, useState } from "react";
import { needsVote } from "@/lib/challenges";
import { DRINK_BY_KIND, DRINK_KINDS, formatUnits } from "@/lib/drinks";
import { formatAgo } from "@/lib/geo";
import { nextStopOnRoute } from "@/lib/route";
import { formatClock } from "@/lib/timer";
import { notifyMove } from "@/lib/use-crew-notifications";
import { closeUnansweredRollCall } from "@/lib/roll-call-undo";
import type { Crawl, Drink, DrinkKind, Member, Stop } from "@/lib/types";
import { useAsk } from "./ask";
import type { CrawlActions } from "./crawl-app";
// nav-live: Vis vej
import { DirectionsButton } from "./directions-button";
import { Button, Card, Icon, SectionTitle } from "./ds";
import { ChallengeVoting } from "./games/challenge-voting"; // games: stemmer om udfordringen
import { RollCallCard, RollCallStarter, useRollCallContext } from "./roll-call"; // Er alle med? (rollcall)
import { NextRoundCard } from "./rounds"; // Omgange
import { AtPubReviews } from "./reviews/at-pub-reviews"; // pub-reviews
import { RecapButton } from "./recap/recap-link"; // recap: Aftenens regnskab

export function NowTab({
  crawl,
  stops,
  members,
  drinks,
  currentStop,
  nextStop,
  remaining,
  userId,
  now,
  actions,
  onOpenRoute,
  canEditRoute,
  pendingDrinkIds,
}: {
  crawl: Crawl;
  stops: Stop[];
  // wiring: billedviseren viser, hvem der tog billedet.
  members: Member[];
  drinks: Drink[];
  currentStop: Stop | null;
  nextStop: Stop | null;
  remaining: number | null;
  userId: string;
  now: number;
  actions: CrawlActions;
  onOpenRoute: () => void;
  // arranger: på en låst rute kan kun arrangøren lægge pubber på.
  canEditRoute: boolean;
  // offline-undo: drinks, der venter på net, får et lille mærke i Dine seneste.
  pendingDrinkIds?: ReadonlySet<string>;
}) {
  const rollCall = useRollCallContext();
  // Én guldknap ad gangen. Venter opråbet på dit svar, er det "Jeg er med".
  const answerFirst = rollCall.open && Boolean(rollCall.call) && !rollCall.mine;
  const atPub = currentStop && remaining !== null ? currentStop : null;

  return (
    <div className="flex flex-col gap-4 px-4 py-[18px]">
      {/* Er alle med? (rollcall): kortet øverst, mens opråbet er åbent. */}
      <RollCallCard stops={stops} />
      {atPub && remaining !== null ? (
        <AtPub crawl={crawl} stops={stops} stop={atPub} remaining={remaining} userId={userId} actions={actions} />
      ) : (
        <OnTheWay
          stops={stops}
          nextStop={nextStop}
          actions={actions}
          onOpenRoute={onOpenRoute}
          canEditRoute={canEditRoute}
          quiet={answerFirst}
        />
      )}
      {/* Drinks er det, man gør oftest, så de ligger lige under timeren. */}
      <DrinkGrid stops={stops} currentStop={currentStop} nextStop={nextStop} actions={actions} />
      {atPub && crawl.challenge && <ChallengeCard crawl={crawl} actions={actions} />}
      {/* Er alle med? (rollcall): "Sidst med" og knappen til at starte et opråb. */}
      <RollCallStarter userId={userId} fromStopId={currentStop?.id ?? null} />
      {/* Omgange: hvis tur er det til at give? Kun på pubben. */}
      {currentStop && <NextRoundCard />}
      {/* pub-reviews: stjerner og billeder fra pubben, I er på */}
      {currentStop && <AtPubReviews stop={currentStop} members={members} />}
      <DrinkSummary
        drinks={drinks}
        stops={stops}
        userId={userId}
        now={now}
        actions={actions}
        pendingDrinkIds={pendingDrinkIds}
      />
    </div>
  );
}

function AtPub({
  crawl,
  stops,
  stop,
  remaining,
  userId,
  actions,
}: {
  crawl: Crawl;
  stops: Stop[];
  stop: Stop;
  remaining: number;
  userId: string;
  actions: CrawlActions;
}) {
  const ask = useAsk();
  const rollCall = useRollCallContext(); // Er alle med? (rollcall)
  const overtime = remaining <= 0;
  const progress = Math.min(1, Math.max(0, 1 - remaining / (stop.minutes * 60_000)));
  // Samme regel som "På vej" bagefter, så dialogen, beskeden og opråbet nævner den samme pub.
  const following = nextStopOnRoute(stops, stop.id);

  async function moveOn() {
    const ok = await ask.confirm({
      eyebrow: "Drik op",
      title: following ? `Videre til ${following.name}?` : "Videre?",
      body: following ? "Timeren stopper for alle på holdet." : "Det var den sidste pub på ruten.",
      confirm: "Ja, vi går videre",
      cancel: "Ikke endnu",
    });
    if (!ok) return;
    // wiring: fortrydes Videre, lukkes opråbet, Videre startede, hvis kun du har svaret.
    // Fortryd kan først trykkes, når leave() har svaret, så started er sat til den tid.
    let started: Promise<boolean> = Promise.resolve(false);
    const undone = () =>
      void started.then(async (began) => {
        if (began && (await closeUnansweredRollCall(crawl.id, stop.id, userId))) void rollCall.refetch();
      });
    // offline-undo: leave() giver true, når Videre er gemt. Først da får holdet besked og opråb.
    if (!(await actions.leave(undone))) return;
    // pwa-push: de andre får besked om, at holdet går videre.
    notifyMove(crawl, stop, following);
    // Er alle med? (rollcall): tæl holdet, når I går videre.
    started = rollCall.start(stop.id, following?.id ?? null);
  }

  return (
    <Card variant="framed" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="pc-label" style={{ color: overtime ? "var(--oxblood-700)" : "var(--text-muted)" }}>
            {overtime ? "Sidste omgang" : "Tid tilbage her"}
          </p>
          <p
            className="mt-2 font-serif tabular-nums leading-none"
            style={{
              fontSize: 60,
              color: overtime ? "var(--oxblood-700)" : "var(--green-800)",
              transition: "color var(--dur-base) var(--ease)",
            }}
            aria-label={overtime ? "Tiden er gået" : `${formatClock(remaining)} tilbage`}
          >
            {formatClock(remaining)}
          </p>
        </div>
        <p className="pb-1 text-right text-[13px] text-muted">{stop.minutes} min. her</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-cream-300">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{
            width: `${progress * 100}%`,
            background: overtime ? "var(--oxblood-500)" : "var(--gold-500)",
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => void actions.extend(10)}>
          Én til her
        </Button>
        <Button
          variant={overtime ? "gold" : "primary"}
          className="flex-1"
          iconRight="chevron-right"
          onClick={() => void moveOn()}
        >
          Videre
        </Button>
      </div>
      {/* nav-live: Vis vej hertil, til dem, der ikke er nået frem endnu. */}
      <DirectionsButton to={stop} name={stop.name} variant="ghost" label="Vis vej hertil" />
    </Card>
  );
}

function ChallengeCard({ crawl, actions }: { crawl: Crawl; actions: CrawlActions }) {
  if (!crawl.challenge) return null;
  return (
    <Card key={crawl.challenge} variant="inverse" className="pc-on-dark pc-enter flex flex-col gap-3">
      <p className="pc-eyebrow" style={{ color: "var(--gold-500)" }}>
        Udfordring
      </p>
      <p className="font-serif text-[24px] leading-[1.15]">{crawl.challenge}</p>
      {/* games: Klaret / Ikke klaret. Ikke når der intet er at klare. */}
      {needsVote(crawl.challenge) && (
        <ChallengeVoting challengeId={crawl.current_challenge_id} text={crawl.challenge} />
      )}
      {/* Luft til stemmeknapperne, så et skævt tryk ikke trækker en ny til hele holdet. Kan fortrydes. */}
      <div className="mt-3">
        <Button variant="ghost" size="sm" icon="dices" onClick={() => void actions.newChallenge()}>
          Træk en ny
        </Button>
      </div>
    </Card>
  );
}

function OnTheWay({
  stops,
  nextStop,
  actions,
  onOpenRoute,
  canEditRoute,
  quiet,
}: {
  stops: Stop[];
  nextStop: Stop | null;
  actions: CrawlActions;
  onOpenRoute: () => void;
  canEditRoute: boolean;
  // Er der en anden guldknap på skærmen, er Tjek ind grøn.
  quiet: boolean;
}) {
  if (!stops.length) {
    return (
      <Card variant="framed" className="flex flex-col gap-3 text-center">
        <p className="pc-label text-oxblood-700">Ingen pubber endnu</p>
        <p className="font-serif text-[24px] leading-tight">Hvor starter vi?</p>
        {canEditRoute ? (
          <>
            <p className="text-muted">Læg aftenens pubber på kortet, så kan alle følge med.</p>
            <Button variant="primary" icon="route" fullWidth onClick={onOpenRoute}>
              Lav ruten
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted">Arrangøren lægger ruten.</p>
            <Button variant="secondary" icon="route" fullWidth onClick={onOpenRoute}>
              Se ruten
            </Button>
          </>
        )}
      </Card>
    );
  }

  if (!nextStop) {
    return (
      <Card variant="framed" className="flex flex-col gap-3 text-center">
        <p className="pc-label text-oxblood-700">Sidste omgang er drukket</p>
        <p className="font-serif text-[24px] leading-tight">Ruten er gået. Godt gået.</p>
        {/* recap: Aftenens regnskab */}
        <RecapButton />
        {canEditRoute && (
          <Button variant="secondary" icon="plus" fullWidth onClick={onOpenRoute}>
            Én pub mere
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card variant="framed" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="map-pin" size={18} color="var(--oxblood-700)" />
        <span className="text-sm text-muted">Næste stop. Tjek ind, når I er der.</span>
      </div>
      <Button
        variant={quiet ? "primary" : "gold"}
        size="lg"
        icon="stamp"
        fullWidth
        onClick={() => void actions.arrive(nextStop)}
      >
        Tjek ind
      </Button>
      {/* nav-live: Vis vej */}
      <DirectionsButton to={nextStop} name={nextStop.name} fullWidth />
      <Button variant="ghost" size="sm" icon="route" onClick={onOpenRoute}>
        Se ruten
      </Button>
    </Card>
  );
}

// Hvor drinken skrives. Uden en pub siger vi, hvor på aftenen I er.
function drinkEyebrow(stops: Stop[], currentStop: Stop | null, nextStop: Stop | null) {
  if (currentStop) return `Skrives på ${currentStop.name}`;
  if (!stops.length) return "Uden for pubben";
  if (!nextStop) return "Efter ruten";
  return stops.some((s) => s.visited_at) ? "Mellem to pubber" : "Før første pub";
}

function DrinkGrid({
  stops,
  currentStop,
  nextStop,
  actions,
}: {
  stops: Stop[];
  currentStop: Stop | null;
  nextStop: Stop | null;
  actions: CrawlActions;
}) {
  const [flash, setFlash] = useState<DrinkKind | null>(null);
  const [floats, setFloats] = useState<{ id: number; kind: DrinkKind }[]>([]);
  const floatId = useRef(0);

  async function add(kind: DrinkKind) {
    setFlash(kind);
    const id = ++floatId.current;
    setFloats((list) => [...list, { id, kind }]);
    try {
      navigator.vibrate?.(30);
    } catch {}
    setTimeout(() => setFlash((f) => (f === kind ? null : f)), 500);
    setTimeout(() => setFloats((list) => list.filter((f) => f.id !== id)), 750);
    await actions.addDrink(kind);
  }

  return (
    <section className="mt-2">
      <SectionTitle eyebrow={drinkEyebrow(stops, currentStop, nextStop)} title="Hvad har du fået?" />
      <div className="grid grid-cols-2 gap-2.5">
        {DRINK_KINDS.map((d) => (
          <button
            key={d.kind}
            type="button"
            onClick={() => void add(d.kind)}
            // Skyggen er en klasse og ikke inline, så fokusringen fra globals.css kan vinde over den.
            className="relative flex min-h-16 items-center gap-3 rounded-[var(--radius-md)] border px-3.5 text-left shadow-[var(--shadow-card)] transition-[background,color,border-color,transform] duration-150 active:translate-y-px"
            style={{
              background: flash === d.kind ? "var(--green-800)" : "var(--surface-card)",
              color: flash === d.kind ? "var(--cream-100)" : "var(--text-body)",
              borderColor: flash === d.kind ? "var(--gold-500)" : "var(--border-subtle)",
            }}
          >
            <Icon name={d.icon} size={22} color={flash === d.kind ? "var(--gold-500)" : "var(--green-800)"} />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">{d.label}</span>
              <span className="block text-xs opacity-75">
                {d.detail}
                {d.units > 0 && ` · ${formatUnits(d.units)} gst.`}
              </span>
            </span>
            {floats
              .filter((f) => f.kind === d.kind)
              .map((f) => (
                <span key={f.id} className="pc-float pc-badge pc-badge--gold" aria-hidden>
                  {d.units > 0 ? `+${formatUnits(d.units)}` : "Skål"}
                </span>
              ))}
          </button>
        ))}
      </div>
    </section>
  );
}

function DrinkSummary({
  drinks,
  stops,
  userId,
  now,
  actions,
  pendingDrinkIds,
}: {
  drinks: Drink[];
  stops: Stop[];
  userId: string;
  now: number;
  actions: CrawlActions;
  pendingDrinkIds?: ReadonlySet<string>;
}) {
  const mine = drinks.filter((d) => d.user_id === userId);
  const units = mine.reduce((sum, d) => sum + Number(d.units), 0);
  const water = mine.filter((d) => d.kind === "water").length;
  const alcoholic = mine.length - water;
  const stopName = (id: string | null) => stops.find((s) => s.id === id)?.name;

  return (
    <>
      <section>
        <SectionTitle eyebrow="Din aften" title="Indtil nu" />
        <div className="grid grid-cols-3 gap-2.5">
          <Figure value={formatUnits(units)} label="Genstande" />
          <Figure value={String(alcoholic)} label="Drinks" />
          <Figure value={String(water)} label="Vand" />
        </div>
        {alcoholic >= 3 && water * 3 < alcoholic && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Icon name="droplet" size={16} color="var(--green-500)" />
            Tag et glas vand ind imellem. Aftenen er lang.
          </p>
        )}
      </section>

      {mine.length > 0 && (
        <section>
          <SectionTitle eyebrow="Kan fortrydes" title="Dine seneste" />
          <Card padding="4px 0">
            <ul className="divide-y divide-line">
              {mine
                .slice()
                .reverse()
                .slice(0, 10)
                .map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2">
                    <Icon name={DRINK_BY_KIND[d.kind].icon} size={20} color="var(--green-800)" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{DRINK_BY_KIND[d.kind].label}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {formatAgo(d.created_at, now)}
                        {stopName(d.stop_id) && ` · ${stopName(d.stop_id)}`}
                        {pendingDrinkIds?.has(d.id) && (
                          <>
                            {" · "}
                            <Icon name={CloudOff} size={12} style={{ display: "inline", verticalAlign: "-1px" }} />
                            {" venter på net"}
                          </>
                        )}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="undo-2"
                      onClick={() => void actions.deleteDrink(d)}
                      aria-label={`Fortryd ${DRINK_BY_KIND[d.kind].label}`}
                    >
                      Fortryd
                    </Button>
                  </li>
                ))}
            </ul>
          </Card>
        </section>
      )}
    </>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <Card padding="14px 12px" className="text-center">
      <p key={value} className="pc-pop font-serif text-[34px] leading-none tabular-nums text-green-800">
        {value}
      </p>
      <p className="pc-label mt-2 text-muted">{label}</p>
    </Card>
  );
}
