"use client";

import dynamic from "next/dynamic";
import { useRef, useState, type FormEvent } from "react";
import { DEFAULT_CENTER, distanceMeters, formatDistance } from "@/lib/geo";
import { nearbyBars, searchPlaces } from "@/lib/places";
import type { LatLng, Member, NearbyPlace, Stop } from "@/lib/types";
import type { CrawlActions } from "./crawl-app";
import { Button, Input } from "./ui";

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-muted">Henter kort…</div>,
});

export function MapTab({
  stops,
  members,
  userId,
  currentStopId,
  myPosition,
  now,
  actions,
}: {
  stops: Stop[];
  members: Member[];
  userId: string;
  currentStopId: string | null;
  myPosition: LatLng | null;
  now: number;
  actions: CrawlActions;
}) {
  const center = useRef<LatLng>(DEFAULT_CENTER);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [results, setResults] = useState<NearbyPlace[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ at: LatLng; seq: number } | null>(null);

  function focusOn(at: LatLng) {
    setFocus((f) => ({ at, seq: (f?.seq ?? 0) + 1 }));
  }

  async function add(name: string, at: LatLng) {
    await actions.addStop(name, at);
    setNearby((list) => list.filter((p) => p.lat !== at.lat || p.lng !== at.lng));
    setResults(null);
    setMessage(`${name} er lagt på ruten.`);
  }

  function onMapClick(at: LatLng) {
    if (!adding) return;
    const name = window.prompt("Hvad hedder pubben?");
    if (name?.trim()) {
      void add(name, at);
      setAdding(false);
    }
  }

  function onPickNearby(place: NearbyPlace) {
    if (window.confirm(`Læg ${place.name} på ruten?`)) void add(place.name, place);
  }

  async function findNearby() {
    setBusy(true);
    setMessage(null);
    try {
      const found = await nearbyBars(center.current);
      const onRoute = (p: NearbyPlace) => stops.some((s) => distanceMeters(s, p) < 25);
      const fresh = found.filter((p) => !onRoute(p));
      setNearby(fresh);
      setMessage(
        fresh.length
          ? `${fresh.length} pubs og barer i nærheden. Tryk på en blå prik for at lægge den på ruten.`
          : "Fandt ingen pubs her. Prøv at flytte kortet.",
      );
    } catch {
      setMessage("Kunne ikke hente pubs lige nu. Prøv igen om lidt.");
    } finally {
      setBusy(false);
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const found = await searchPlaces(query, center.current);
      setResults(found);
      if (!found.length) setMessage("Ingen resultater.");
    } catch {
      setMessage("Søgningen virker ikke lige nu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="relative h-[52dvh] min-h-72">
        <MapView
          stops={stops}
          members={members}
          userId={userId}
          myPosition={myPosition}
          currentStopId={currentStopId}
          nearby={nearby}
          adding={adding}
          focus={focus}
          now={now}
          onMapClick={onMapClick}
          onPickNearby={onPickNearby}
          onCenterChange={(at) => (center.current = at)}
        />
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] flex justify-between gap-2">
          <div className="pointer-events-auto flex gap-2">
            <Button
              variant={adding ? "primary" : "secondary"}
              className="shadow-lg"
              onClick={() => setAdding((a) => !a)}
            >
              {adding ? "Tryk på kortet…" : "＋ Pub"}
            </Button>
            <Button variant="secondary" className="shadow-lg" disabled={busy} onClick={() => void findNearby()}>
              🔎 Pubs her
            </Button>
          </div>
          {myPosition && (
            <Button
              variant="secondary"
              className="pointer-events-auto shadow-lg"
              onClick={() => focusOn(myPosition)}
              aria-label="Vis mig på kortet"
            >
              ◎
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <form onSubmit={search} className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søg efter en pub eller adresse"
            enterKeyHint="search"
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            Søg
          </Button>
        </form>

        {message && <p className="text-sm text-muted">{message}</p>}

        {results && results.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-1">
            {results.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-2 py-1">
                <button className="min-w-0 flex-1 text-left" onClick={() => focusOn(r)}>
                  <span className="block truncate">{r.name}</span>
                  <span className="text-xs text-muted">{r.kind}</span>
                </button>
                <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={() => void add(r.name, r)}>
                  Tilføj
                </Button>
              </li>
            ))}
            <li>
              <Button variant="ghost" className="w-full text-sm" onClick={() => setResults(null)}>
                Luk
              </Button>
            </li>
          </ul>
        )}

        <RouteList
          stops={stops}
          currentStopId={currentStopId}
          actions={actions}
          onFocus={focusOn}
        />
      </div>
    </div>
  );
}

function RouteList({
  stops,
  currentStopId,
  actions,
  onFocus,
}: {
  stops: Stop[];
  currentStopId: string | null;
  actions: CrawlActions;
  onFocus: (at: LatLng) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!stops.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
        Ruten er tom. Tryk på <strong className="text-ink">🔎 Pubs her</strong> for at finde pubs
        omkring kortet, eller <strong className="text-ink">＋ Pub</strong> for at sætte en selv.
      </div>
    );
  }

  const totalMeters = stops.slice(1).reduce((sum, s, i) => sum + distanceMeters(stops[i], s), 0);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold">
          Ruten <span className="text-sm font-normal text-muted">· {stops.length} pubs, {formatDistance(totalMeters)}</span>
        </h2>
        <Button variant="ghost" className="min-h-9 px-2 text-sm" onClick={() => setEditing((e) => !e)}>
          {editing ? "Færdig" : "Ret"}
        </Button>
      </div>
      <ol className="flex flex-col gap-2">
        {stops.map((stop, i) => {
          const current = stop.id === currentStopId;
          return (
            <li
              key={stop.id}
              className={`rounded-xl border p-3 ${
                current ? "border-gold bg-gold/10" : "border-line bg-surface"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    current
                      ? "bg-gold text-gold-ink"
                      : stop.visited_at
                        ? "bg-line text-muted"
                        : "bg-ink text-night"
                  }`}
                >
                  {stop.visited_at && !current ? "✓" : i + 1}
                </span>
                <button className="min-w-0 flex-1 text-left" onClick={() => onFocus(stop)}>
                  <span className={`block truncate ${stop.visited_at && !current ? "text-muted line-through" : ""}`}>
                    {stop.name}
                  </span>
                  <span className="text-xs text-muted">
                    {stop.minutes} min.
                    {i > 0 && ` · ${formatDistance(distanceMeters(stops[i - 1], stop))} fra forrige`}
                  </span>
                </button>
                {!editing && !current && (
                  <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={() => void actions.arrive(stop)}>
                    Vi er her
                  </Button>
                )}
              </div>
              {editing && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="secondary" className="min-h-9 px-3" disabled={i === 0} onClick={() => void actions.moveStop(stop, -1)} aria-label="Flyt op">
                    ↑
                  </Button>
                  <Button variant="secondary" className="min-h-9 px-3" disabled={i === stops.length - 1} onClick={() => void actions.moveStop(stop, 1)} aria-label="Flyt ned">
                    ↓
                  </Button>
                  <div className="flex items-center gap-1 rounded-xl border border-line px-1">
                    <button className="h-9 w-8 text-lg" onClick={() => void actions.setMinutes(stop, stop.minutes - 5)} aria-label="5 minutter mindre">−</button>
                    <span className="w-14 text-center text-sm tabular-nums">{stop.minutes} min.</span>
                    <button className="h-9 w-8 text-lg" onClick={() => void actions.setMinutes(stop, stop.minutes + 5)} aria-label="5 minutter mere">+</button>
                  </div>
                  <Button
                    variant="secondary"
                    className="min-h-9 px-3 text-sm"
                    onClick={() => {
                      const name = window.prompt("Nyt navn", stop.name);
                      if (name?.trim()) void actions.renameStop(stop, name);
                    }}
                  >
                    Omdøb
                  </Button>
                  {stop.visited_at && !current && (
                    <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={() => void actions.setVisited(stop, false)}>
                      Ikke besøgt
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    className="min-h-9 px-3 text-sm"
                    onClick={() => {
                      if (window.confirm(`Fjern ${stop.name} fra ruten?`)) void actions.deleteStop(stop);
                    }}
                  >
                    Fjern
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
