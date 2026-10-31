"use client";

import { useEffect, useRef, useState } from "react";
import { distanceMeters, formatDistance, walkingMinutes } from "@/lib/geo";
import type { Crawl, LatLng, Stop } from "@/lib/types";
import type { CrawlActions } from "./crawl-app";
import { Button } from "./ui";

function formatClock(ms: number) {
  const total = Math.ceil(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Den øverste bjælke: timeren og udfordringen ved den pub, I er på, ellers den næste pub.
export function NowBar({
  crawl,
  stops,
  currentStop,
  myPosition,
  now,
  actions,
}: {
  crawl: Crawl;
  stops: Stop[];
  currentStop: Stop | null;
  myPosition: LatLng | null;
  now: number;
  actions: CrawlActions;
}) {
  const [showChallenge, setShowChallenge] = useState(true);
  const buzzed = useRef<string | null>(null);

  const remaining =
    currentStop && crawl.arrived_at
      ? new Date(crawl.arrived_at).getTime() + currentStop.minutes * 60_000 - now
      : null;
  const overtime = remaining !== null && remaining <= 0;

  // Én vibration, når tiden er gået, pr. ankomst.
  useEffect(() => {
    if (!overtime || !crawl.arrived_at) return;
    const key = `${crawl.current_stop_id}:${crawl.arrived_at}`;
    if (buzzed.current === key) return;
    buzzed.current = key;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {}
  }, [overtime, crawl.arrived_at, crawl.current_stop_id]);

  if (currentStop && remaining !== null) {
    const index = stops.findIndex((s) => s.id === currentStop.id);
    const total = currentStop.minutes * 60_000;
    const progress = Math.min(1, Math.max(0, 1 - remaining / total));
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">
              Pub {index + 1} af {stops.length}
            </p>
            <p className="truncate font-semibold">{currentStop.name}</p>
          </div>
          <div className="text-right">
            <p
              className={`font-mono text-2xl font-bold tabular-nums ${overtime ? "text-danger" : "text-gold"}`}
              aria-live="off"
            >
              {overtime ? "+" : ""}
              {formatClock(remaining)}
            </p>
            <p className={`text-xs ${overtime ? "text-danger" : "text-muted"}`}>
              {overtime ? "Tid til at gå videre!" : "tilbage"}
            </p>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-raised">
          <div
            className={`h-full rounded-full ${overtime ? "bg-danger" : "bg-gold"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        {crawl.challenge && (
          <button
            onClick={() => setShowChallenge((v) => !v)}
            className="rounded-xl border border-sky/30 bg-sky/10 px-3 py-2 text-left"
          >
            <span className="text-xs font-medium uppercase tracking-wider text-sky">
              🎲 Udfordring {showChallenge ? "" : "(tryk for at se)"}
            </span>
            {showChallenge && <span className="mt-0.5 block text-[15px]">{crawl.challenge}</span>}
          </button>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1 px-2" onClick={() => void actions.newChallenge()}>
            🎲 Ny
          </Button>
          <Button variant="secondary" className="flex-1 px-2" onClick={() => void actions.extend(10)}>
            +10 min
          </Button>
          <Button
            variant={overtime ? "primary" : "secondary"}
            className="flex-[1.4] px-2"
            onClick={() => void actions.leave()}
          >
            Gå videre →
          </Button>
        </div>
      </div>
    );
  }

  const next = stops.find((s) => !s.visited_at);

  if (!stops.length) {
    return <p className="text-sm text-muted">Tilføj den første pub på kortet for at lave ruten.</p>;
  }

  if (!next) {
    return (
      <p className="text-sm">
        <span className="font-semibold text-gold">Ruten er gennemført 🎉</span>{" "}
        <span className="text-muted">Tilføj flere pubs, hvis aftenen ikke er slut.</span>
      </p>
    );
  }

  const meters = myPosition ? distanceMeters(myPosition, next) : null;
  const index = stops.indexOf(next);

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">
          På vej til pub {index + 1} af {stops.length}
          {meters !== null && ` · ${formatDistance(meters)}, ca. ${walkingMinutes(meters)} min.`}
        </p>
        <p className="truncate font-semibold">{next.name}</p>
      </div>
      <Button onClick={() => void actions.arrive(next)}>Vi er her</Button>
    </div>
  );
}
