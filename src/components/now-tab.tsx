"use client";

import { useEffect, useRef, useState } from "react";
import { DRINK_BY_KIND, DRINK_KINDS, formatUnits } from "@/lib/drinks";
import { formatAgo } from "@/lib/geo";
import { formatClock } from "@/lib/timer";
import type { Crawl, Drink, DrinkKind, Stop } from "@/lib/types";
import { useAsk } from "./ask";
import type { CrawlActions } from "./crawl-app";
import { Button, Card, Icon, SectionTitle } from "./ds";
import { NextRoundCard } from "./rounds"; // Omgange

export function NowTab({
  crawl,
  stops,
  drinks,
  currentStop,
  nextStop,
  remaining,
  userId,
  now,
  actions,
  onOpenRoute,
}: {
  crawl: Crawl;
  stops: Stop[];
  drinks: Drink[];
  currentStop: Stop | null;
  nextStop: Stop | null;
  remaining: number | null;
  userId: string;
  now: number;
  actions: CrawlActions;
  onOpenRoute: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-4 py-[18px]">
      {currentStop && remaining !== null ? (
        <AtPub crawl={crawl} stops={stops} stop={currentStop} remaining={remaining} actions={actions} />
      ) : (
        <OnTheWay stops={stops} nextStop={nextStop} actions={actions} onOpenRoute={onOpenRoute} />
      )}
      {/* Omgange: hvis tur er det til at give? */}
      <NextRoundCard />
      <Drinks drinks={drinks} stops={stops} userId={userId} currentStop={currentStop} now={now} actions={actions} />
    </div>
  );
}

function AtPub({
  crawl,
  stops,
  stop,
  remaining,
  actions,
}: {
  crawl: Crawl;
  stops: Stop[];
  stop: Stop;
  remaining: number;
  actions: CrawlActions;
}) {
  const ask = useAsk();
  const buzzed = useRef<string | null>(null);
  const overtime = remaining <= 0;
  const progress = Math.min(1, Math.max(0, 1 - remaining / (stop.minutes * 60_000)));
  const index = stops.indexOf(stop);
  const following = stops.slice(index + 1).find((s) => !s.visited_at) ?? null;

  // Én vibration pr. ankomst, når tiden er gået.
  useEffect(() => {
    if (!overtime || !crawl.arrived_at) return;
    const key = `${crawl.current_stop_id}:${crawl.arrived_at}`;
    if (buzzed.current === key) return;
    buzzed.current = key;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {}
  }, [overtime, crawl.arrived_at, crawl.current_stop_id]);

  async function moveOn() {
    const ok = await ask.confirm({
      eyebrow: "Drik op",
      title: following ? `Videre til ${following.name}?` : "Videre?",
      body: following ? "Timeren stopper for alle på holdet." : "Det var den sidste pub på ruten.",
      confirm: "Ja, vi går videre",
      cancel: "Ikke endnu",
    });
    if (ok) await actions.leave();
  }

  return (
    <>
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
      </Card>

      {crawl.challenge && (
        <Card key={crawl.challenge} variant="inverse" className="pc-on-dark pc-enter flex flex-col gap-3">
          <p className="pc-eyebrow" style={{ color: "var(--gold-500)" }}>
            Udfordring
          </p>
          <p className="font-serif text-[24px] leading-[1.15]">{crawl.challenge}</p>
          <div>
            <Button variant="ghost" size="sm" icon="dices" onClick={() => void actions.newChallenge()}>
              Træk en ny
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}

function OnTheWay({
  stops,
  nextStop,
  actions,
  onOpenRoute,
}: {
  stops: Stop[];
  nextStop: Stop | null;
  actions: CrawlActions;
  onOpenRoute: () => void;
}) {
  if (!stops.length) {
    return (
      <Card variant="framed" className="flex flex-col gap-3 text-center">
        <p className="pc-label text-oxblood-700">Ingen pubs endnu</p>
        <p className="font-serif text-[24px] leading-tight">Hvor starter vi?</p>
        <p className="text-muted">Læg aftenens pubs på kortet, så kan alle følge med.</p>
        <Button variant="primary" icon="route" fullWidth onClick={onOpenRoute}>
          Lav ruten
        </Button>
      </Card>
    );
  }

  if (!nextStop) {
    return (
      <Card variant="framed" className="flex flex-col gap-3 text-center">
        <p className="pc-label text-oxblood-700">Sidste omgang er drukket</p>
        <p className="font-serif text-[24px] leading-tight">Ruten er gået. Godt gået.</p>
        <Button variant="secondary" icon="plus" fullWidth onClick={onOpenRoute}>
          Én pub mere
        </Button>
      </Card>
    );
  }

  return (
    <Card variant="framed" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="map-pin" size={18} color="var(--oxblood-700)" />
        <span className="text-sm text-muted">Næste stop. Tjek ind, når I er der.</span>
      </div>
      <Button variant="gold" size="lg" icon="stamp" fullWidth onClick={() => void actions.arrive(nextStop)}>
        Tjek ind
      </Button>
      <Button variant="ghost" size="sm" icon="route" onClick={onOpenRoute}>
        Se ruten
      </Button>
    </Card>
  );
}

function Drinks({
  drinks,
  stops,
  userId,
  currentStop,
  now,
  actions,
}: {
  drinks: Drink[];
  stops: Stop[];
  userId: string;
  currentStop: Stop | null;
  now: number;
  actions: CrawlActions;
}) {
  const [flash, setFlash] = useState<DrinkKind | null>(null);
  const [floats, setFloats] = useState<{ id: number; kind: DrinkKind }[]>([]);
  const floatId = useRef(0);
  const mine = drinks.filter((d) => d.user_id === userId);
  const units = mine.reduce((sum, d) => sum + Number(d.units), 0);
  const water = mine.filter((d) => d.kind === "water").length;
  const alcoholic = mine.length - water;
  const stopName = (id: string | null) => stops.find((s) => s.id === id)?.name;

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
    <>
      <section className="mt-2">
        <SectionTitle
          eyebrow={currentStop ? `Skrives på ${currentStop.name}` : "Mellem to pubs"}
          title="Hvad har du fået?"
        />
        <div className="grid grid-cols-2 gap-2.5">
          {DRINK_KINDS.map((d) => (
            <button
              key={d.kind}
              type="button"
              onClick={() => void add(d.kind)}
              className="relative flex min-h-16 items-center gap-3 rounded-[var(--radius-md)] border px-3.5 text-left transition-[background,color,border-color,transform] duration-150 active:translate-y-px"
              style={{
                background: flash === d.kind ? "var(--green-800)" : "var(--surface-card)",
                color: flash === d.kind ? "var(--cream-100)" : "var(--text-body)",
                borderColor: flash === d.kind ? "var(--gold-500)" : "var(--border-subtle)",
                boxShadow: "var(--shadow-card)",
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
