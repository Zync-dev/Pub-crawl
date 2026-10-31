"use client";

import dynamic from "next/dynamic";
import { useRef, useState, type FormEvent } from "react";
import { DEFAULT_CENTER, distanceMeters, formatDistance, walkingMinutes } from "@/lib/geo";
import { nearbyBars, searchPlaces } from "@/lib/places";
import { formatTime } from "@/lib/timer";
import type { LatLng, Member, NearbyPlace, Stop } from "@/lib/types";
import { useAsk } from "./ask";
import type { CrawlActions } from "./crawl-app";
import { Button, Card, IconButton, Input, SectionTitle, StopCard } from "./ds";

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => <div className="pc-eyebrow flex h-full items-center justify-center text-muted">Henter kortet</div>,
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
  const ask = useAsk();
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
  }

  async function onMapClick(at: LatLng) {
    if (!adding) return;
    setAdding(false);
    const name = await ask.prompt({
      eyebrow: "Ny pub",
      title: "Hvad hedder den?",
      label: "Pubbens navn",
      placeholder: "Fx Charlie's Bar",
      confirm: "Læg på ruten",
    });
    if (name) await add(name, at);
  }

  async function onPickNearby(place: NearbyPlace) {
    const ok = await ask.confirm({
      eyebrow: "Fundet på kortet",
      title: place.name,
      body: "Skal den med på aftenens rute?",
      confirm: "Læg på ruten",
    });
    if (ok) await add(place.name, place);
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
          ? `${fresh.length} pubs og barer her. Tryk på en rød prik for at lægge den på ruten.`
          : "Ingen pubs her. Flyt kortet og prøv igen.",
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
      <div className="relative h-[46dvh] min-h-72" style={{ borderBottom: "var(--rule-double)" }}>
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
          onMapClick={(at) => void onMapClick(at)}
          onPickNearby={(p) => void onPickNearby(p)}
          onCenterChange={(at) => (center.current = at)}
        />
        {adding && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center">
            <span className="pc-badge pc-badge--green">Tryk der, hvor pubben ligger</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] flex items-end justify-between gap-2">
          <div className="pointer-events-auto flex gap-2">
            <Button
              variant={adding ? "gold" : "primary"}
              size="sm"
              icon={adding ? "x" : "plus"}
              onClick={() => setAdding((a) => !a)}
            >
              {adding ? "Fortryd" : "Sæt en pub"}
            </Button>
            <Button variant="primary" size="sm" icon="search" disabled={busy} onClick={() => void findNearby()}>
              Pubs her
            </Button>
          </div>
          {myPosition && (
            <div className="pointer-events-auto">
              <IconButton icon="locate-fixed" label="Vis mig på kortet" variant="primary" onClick={() => focusOn(myPosition)} />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-[18px]">
        <form onSubmit={search} className="flex items-end gap-2">
          <Input
            className="flex-1"
            label="Find en pub"
            icon="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Navn eller adresse"
            enterKeyHint="search"
          />
          <Button type="submit" variant="secondary" disabled={busy} style={{ height: 48 }}>
            Søg
          </Button>
        </form>

        {message && <p className="text-sm text-muted">{message}</p>}

        {results && results.length > 0 && (
          <Card padding="4px 0">
            <ul className="divide-y divide-line">
              {results.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => focusOn(r)}>
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="pc-label text-muted">{r.kind}</span>
                  </button>
                  <Button variant="secondary" size="sm" icon="plus" onClick={() => void add(r.name, r)}>
                    Tilføj
                  </Button>
                </li>
              ))}
            </ul>
            <div className="px-2 pb-1">
              <Button variant="ghost" size="sm" fullWidth onClick={() => setResults(null)}>
                Luk
              </Button>
            </div>
          </Card>
        )}

        <RouteList
          stops={stops}
          currentStopId={currentStopId}
          myPosition={myPosition}
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
  myPosition,
  actions,
  onFocus,
}: {
  stops: Stop[];
  currentStopId: string | null;
  myPosition: LatLng | null;
  actions: CrawlActions;
  onFocus: (at: LatLng) => void;
}) {
  const ask = useAsk();
  const [editing, setEditing] = useState(false);

  if (!stops.length) {
    return (
      <Card variant="framed" className="text-center">
        <p className="pc-label mb-2 text-oxblood-700">Ruten er tom</p>
        <p className="text-muted">
          Tryk på <strong>Pubs her</strong> for at finde pubs omkring kortet, eller <strong>Sæt en pub</strong> for
          at sætte en selv.
        </p>
      </Card>
    );
  }

  const nextId = currentStopId ? null : stops.find((s) => !s.visited_at)?.id;

  return (
    <section>
      <SectionTitle
        eyebrow={editing ? "Ret ruten" : "Tryk for at se på kortet"}
        title="Pubberne"
        right={
          <Button variant="ghost" size="sm" icon={editing ? "check" : "pencil"} onClick={() => setEditing((e) => !e)}>
            {editing ? "Færdig" : "Ret"}
          </Button>
        }
      />
      <ol className="flex flex-col gap-2.5">
        {stops.map((stop, i) => {
          const current = stop.id === currentStopId;
          const status = current ? "current" : stop.visited_at ? "done" : "upcoming";
          const fromPrev = i > 0 ? distanceMeters(stops[i - 1], stop) : null;
          const fromMe = stop.id === nextId && myPosition ? distanceMeters(myPosition, stop) : null;
          const note = [
            `${stop.minutes} min.`,
            fromMe !== null
              ? `${formatDistance(fromMe)} fra dig, ca. ${walkingMinutes(fromMe)} min.`
              : fromPrev !== null
                ? `${formatDistance(fromPrev)} fra forrige`
                : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={stop.id} className="flex flex-col gap-2">
              <StopCard
                number={i + 1}
                total={stops.length}
                name={stop.name}
                time={stop.visited_at && !current ? formatTime(stop.visited_at) : undefined}
                note={note}
                status={status}
                onClick={() => onFocus(stop)}
              >
                {!editing && stop.id === nextId && (
                  <Button
                    variant="gold"
                    size="sm"
                    icon="stamp"
                    onClick={(e) => {
                      e.stopPropagation();
                      void actions.arrive(stop);
                    }}
                  >
                    Tjek ind
                  </Button>
                )}
              </StopCard>
              {editing && (
                <div className="flex flex-wrap items-center gap-2 pl-2">
                  <IconButton icon="arrow-up" label="Flyt op" variant="secondary" size="sm" disabled={i === 0} onClick={() => void actions.moveStop(stop, -1)} />
                  <IconButton icon="arrow-down" label="Flyt ned" variant="secondary" size="sm" disabled={i === stops.length - 1} onClick={() => void actions.moveStop(stop, 1)} />
                  <div className="flex h-[34px] items-center rounded-[var(--radius-sm)] border-[1.5px] border-green-800 px-1 text-green-800">
                    <button type="button" className="h-full w-7 font-semibold" onClick={() => void actions.setMinutes(stop, stop.minutes - 5)} aria-label="5 minutter mindre">
                      −
                    </button>
                    <span className="w-14 text-center text-[13px] font-semibold tabular-nums">{stop.minutes} min.</span>
                    <button type="button" className="h-full w-7 font-semibold" onClick={() => void actions.setMinutes(stop, stop.minutes + 5)} aria-label="5 minutter mere">
                      +
                    </button>
                  </div>
                  <IconButton
                    icon="pencil"
                    label="Omdøb"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      const name = await ask.prompt({
                        eyebrow: `Pub ${i + 1}`,
                        title: "Nyt navn",
                        label: "Pubbens navn",
                        initial: stop.name,
                        confirm: "Gem",
                      });
                      if (name) await actions.renameStop(stop, name);
                    }}
                  />
                  {stop.visited_at && !current && (
                    <Button variant="ghost" size="sm" icon="undo-2" onClick={() => void actions.setVisited(stop, false)}>
                      Ikke besøgt
                    </Button>
                  )}
                  <IconButton
                    icon="trash-2"
                    label="Fjern fra ruten"
                    variant="danger"
                    size="sm"
                    onClick={async () => {
                      const ok = await ask.confirm({
                        eyebrow: "Fjern pub",
                        title: `${stop.name} ryger af ruten?`,
                        body: "Drinks fra pubben bliver i statistikken.",
                        confirm: "Fjern den",
                        danger: true,
                      });
                      if (ok) await actions.deleteStop(stop);
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
