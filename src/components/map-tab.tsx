"use client";

import { Minus } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState, type FormEvent } from "react";
import { DEFAULT_CENTER, distanceMeters, formatDistance, walkingMinutes } from "@/lib/geo";
import { boundsAround, nearbyBars, searchPlaces, type Bounds } from "@/lib/places";
import { formatTime } from "@/lib/timer";
import type { LatLng, Member, NearbyPlace, Stop } from "@/lib/types";
import { RouteLockedNote } from "./arranger-card"; // arranger: låst rute
import { useAsk } from "./ask";
import type { CrawlActions } from "./crawl-app";
// nav-live: Vis vej
import { DirectionsButton } from "./directions-button";
import { Button, Card, IconButton, Input, SectionTitle, Spinner, StopCard } from "./ds";
import { StopReviewNote, StopReviewRating } from "./reviews/stop-review-note"; // pub-reviews

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-cream-300 text-green-800">
      <Spinner size={24} />
      <span className="pc-eyebrow text-muted">Henter kortet</span>
    </div>
  ),
});

export function MapTab({
  visible,
  stops,
  members,
  userId,
  currentStopId,
  myPosition,
  now,
  actions,
  routeLocked = false,
}: {
  visible: boolean;
  stops: Stop[];
  members: Member[];
  userId: string;
  currentStopId: string | null;
  myPosition: LatLng | null;
  now: number;
  actions: CrawlActions;
  // arranger: sand, når arrangøren har låst ruten, og man ikke selv er arrangør.
  routeLocked?: boolean;
}) {
  const ask = useAsk();
  const view = useRef<Bounds>(boundsAround(DEFAULT_CENTER, 0.01));
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [results, setResults] = useState<NearbyPlace[] | null>(null);
  const [busy, setBusy] = useState<"nearby" | "search" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ at: LatLng; seq: number } | null>(null);
  // Den pub, der er ved at blive lagt på ruten. Et ekstra tryk imens giver ellers en dublet.
  const [saving, setSaving] = useState<string | null>(null);
  const savingRef = useRef(false);
  const mapBox = useRef<HTMLDivElement>(null);
  const [wasVisible, setWasVisible] = useState(visible);

  // arranger: låses ruten, slutter "Sæt en pub". Ellers dukker den op igen, når låsen tages af.
  if (routeLocked && adding) setAdding(false);
  // De røde prikker fra "Pubs her" hører til planlægningen og ryddes, når man forlader fanen.
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) {
      setNearby([]);
      setMessage(null);
    }
  }

  function focusOn(at: LatLng) {
    setFocus((f) => ({ at, seq: (f?.seq ?? 0) + 1 }));
    // Kortet ligger øverst, så et tryk længere nede i listen skal også vise det.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapBox.current?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }

  async function add(name: string, at: LatLng, key: string) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(key);
    let ok = false;
    try {
      ok = await actions.addStop(name, at);
    } finally {
      savingRef.current = false;
      setSaving(null);
    }
    // Gik det galt, bliver søgningen og prikkerne, så man kan prøve igen.
    if (!ok) return;
    setNearby((list) => list.filter((p) => p.lat !== at.lat || p.lng !== at.lng));
    setResults(null);
    setMessage(null);
  }

  async function onMapClick(at: LatLng) {
    if (!adding || routeLocked) return;
    setAdding(false);
    const name = await ask.prompt({
      eyebrow: "Ny pub",
      title: "Hvad hedder den?",
      label: "Pubbens navn",
      placeholder: "Fx Charlie's Bar",
      confirm: "Læg på ruten",
    });
    if (name) await add(name, at, "map");
  }

  async function onPickNearby(place: NearbyPlace) {
    if (routeLocked || savingRef.current) return;
    const ok = await ask.confirm({
      eyebrow: "Fundet på kortet",
      title: place.name,
      body: "Skal den med på aftenens rute?",
      confirm: "Læg på ruten",
    });
    if (ok) await add(place.name, place, place.id);
  }

  async function findNearby() {
    setBusy("nearby");
    setMessage(null);
    try {
      const b = view.current;
      const found = await nearbyBars(b);
      const onRoute = (p: NearbyPlace) => stops.some((s) => distanceMeters(s, p) < 25);
      // Nærmest midten af kortet først i listen under kortet.
      const center = { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
      const fresh = found
        .filter((p) => !onRoute(p))
        .sort((x, y) => distanceMeters(center, x) - distanceMeters(center, y));
      setNearby(fresh);
      setResults(null);
      setMessage(fresh.length ? null : "Ingen pubs her. Flyt kortet og prøv igen.");
    } catch {
      setMessage("Kunne ikke hente pubs lige nu. Prøv igen om lidt.");
    } finally {
      setBusy(null);
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    setMessage(null);
    try {
      const found = await searchPlaces(query, view.current);
      setResults(found);
      if (!found.length) setMessage("Ingen resultater.");
    } catch {
      setMessage("Søgningen virker ikke lige nu.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col">
      <div ref={mapBox} className="relative h-[46dvh] min-h-72" style={{ borderBottom: "var(--rule-double)" }}>
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
          onViewChange={(b) => (view.current = b)}
          visible={visible}
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
              icon={adding ? "x" : "plus"}
              disabled={routeLocked}
              onClick={() => setAdding((a) => !a)}
            >
              {adding ? "Fortryd" : "Sæt en pub"}
            </Button>
            <Button
              variant="primary"
              icon="search"
              loading={busy === "nearby"}
              disabled={busy !== null || routeLocked}
              onClick={() => void findNearby()}
            >
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
        {routeLocked && <RouteLockedNote />}
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
          <Button
            type="submit"
            variant="secondary"
            loading={busy === "search"}
            disabled={busy !== null}
            style={{ height: 48 }}
          >
            Søg
          </Button>
        </form>

        {message && (
          <p key={message} className="pc-fade-in text-sm text-muted" role="status">
            {message}
          </p>
        )}

        {results && results.length > 0 && (
          <PlaceList
            places={results}
            saving={saving}
            locked={routeLocked}
            onFocus={focusOn}
            onAdd={(p) => void add(p.name, p, p.id)}
            onClose={() => setResults(null)}
            closeLabel="Luk"
          />
        )}

        {/* "Pubs her" også som liste, så man ikke skal ramme de små prikker på kortet. */}
        {nearby.length > 0 && !results?.length && (
          <section className="pc-enter">
            <SectionTitle eyebrow="Fundet på kortet" title={`${nearby.length} pubs og barer`} />
            <PlaceList
              places={nearby}
              saving={saving}
              locked={routeLocked}
              myPosition={myPosition}
              onFocus={focusOn}
              onAdd={(p) => void add(p.name, p, p.id)}
              onClose={() => {
                setNearby([]);
                setMessage(null);
              }}
              closeLabel="Skjul prikkerne"
            />
          </section>
        )}

        <RouteList
          stops={stops}
          currentStopId={currentStopId}
          myPosition={myPosition}
          actions={actions}
          onFocus={focusOn}
          locked={routeLocked}
          members={members}
        />
      </div>
    </div>
  );
}

function PlaceList({
  places,
  saving,
  locked,
  myPosition = null,
  onFocus,
  onAdd,
  onClose,
  closeLabel,
}: {
  places: NearbyPlace[];
  saving: string | null;
  locked: boolean;
  myPosition?: LatLng | null;
  onFocus: (at: LatLng) => void;
  onAdd: (place: NearbyPlace) => void;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <Card padding="4px 0" className="pc-enter">
      <ul className="divide-y divide-line">
        {places.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2">
            <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => onFocus(p)}>
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="pc-label text-muted">
                {[p.kind, myPosition ? `${formatDistance(distanceMeters(myPosition, p))} fra dig` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
            <Button
              variant="secondary"
              icon="plus"
              loading={saving === p.id}
              disabled={locked || saving !== null}
              onClick={() => onAdd(p)}
            >
              Tilføj
            </Button>
          </li>
        ))}
      </ul>
      <div className="px-2 pb-1">
        <Button variant="ghost" fullWidth onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
    </Card>
  );
}

function RouteList({
  stops,
  currentStopId,
  myPosition,
  actions,
  onFocus,
  locked = false,
  members,
}: {
  stops: Stop[];
  currentStopId: string | null;
  myPosition: LatLng | null;
  actions: CrawlActions;
  onFocus: (at: LatLng) => void;
  locked?: boolean;
  // wiring: viseren viser, hvem der tog billedet.
  members: Member[];
}) {
  const ask = useAsk();
  const [editingState, setEditing] = useState(false);
  // arranger: en låst rute kan ikke rettes, heller ikke hvis man var i gang.
  const editing = editingState && !locked;

  if (!stops.length) {
    return (
      <Card variant="framed" className="text-center">
        <p className="pc-label mb-2 text-oxblood-700">Ruten er tom</p>
        <p className="text-muted">
          {locked ? (
            "Arrangøren lægger ruten."
          ) : (
            <>
              Find pubs med <strong>Pubs her</strong>, eller sæt en selv.
            </>
          )}
        </p>
      </Card>
    );
  }

  const nextId = currentStopId ? null : stops.find((s) => !s.visited_at)?.id;
  // nav-live: mens holdet er tjekket ind, kan man stadig få vej til pubben bagefter.
  const currentIndex = stops.findIndex((s) => s.id === currentStopId);
  const followingId = currentIndex >= 0 ? stops.slice(currentIndex + 1).find((s) => !s.visited_at)?.id : undefined;

  return (
    <section>
      <SectionTitle
        eyebrow={editing ? "Ret ruten" : "Tryk for at se på kortet"}
        title="Pubberne"
        right={
          <Button variant="ghost" size="sm" icon={editing ? "check" : "pencil"} disabled={locked} onClick={() => setEditing(!editing)}>
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
          // Opholdet og gåturen må ikke kunne forveksles.
          const note = [
            `${stop.minutes} min. ${current ? "her" : "der"}`,
            fromMe !== null
              ? `${formatDistance(fromMe)} fra dig, ca. ${walkingMinutes(fromMe)} min. at gå`
              : fromPrev !== null
                ? `${formatDistance(fromPrev)} fra forrige`
                : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const rating = !editing && status !== "upcoming";
          const checkIn = !editing && stop.id === nextId;
          const directions = !editing && (checkIn || current || stop.id === followingId);
          return (
            <li
              key={stop.id}
              className="pc-enter flex flex-col gap-2"
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <StopCard
                number={i + 1}
                total={stops.length}
                name={stop.name}
                time={stop.visited_at && !current ? formatTime(stop.visited_at) : undefined}
                note={<StopReviewNote stop={stop} text={note} /> /* pub-reviews */}
                status={status}
                onClick={() => onFocus(stop)}
                // Knapperne og stjernerne får deres egen linje, så navnet har hele bredden.
                footer={
                  rating || directions ? (
                    <>
                      {rating && <StopReviewRating stop={stop} status={status} members={members} />}
                      {directions && (
                        <div className="flex gap-2">
                          {checkIn && (
                            <Button
                              variant="gold"
                              icon="stamp"
                              className="flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                void actions.arrive(stop);
                              }}
                            >
                              Tjek ind
                            </Button>
                          )}
                          {/* nav-live: Vis vej til den næste, den nuværende og pubben bagefter. */}
                          <DirectionsButton
                            to={stop}
                            name={stop.name}
                            iconOnly={checkIn}
                            variant={current ? "gold" : "secondary"}
                          />
                        </div>
                      )}
                    </>
                  ) : undefined
                }
              />
              {editing && (
                <div className="pc-enter flex flex-wrap items-center gap-2 pl-2">
                  <IconButton icon="arrow-up" label="Flyt op" variant="secondary" disabled={i === 0} onClick={() => void actions.moveStop(stop, -1)} />
                  <IconButton icon="arrow-down" label="Flyt ned" variant="secondary" disabled={i === stops.length - 1} onClick={() => void actions.moveStop(stop, 1)} />
                  <div className="flex items-center gap-1 text-green-800">
                    <IconButton icon={Minus} label="5 minutter mindre" variant="secondary" onClick={() => void actions.setMinutes(stop, stop.minutes - 5)} />
                    <span className="w-14 text-center text-[13px] font-semibold tabular-nums">{stop.minutes} min.</span>
                    <IconButton icon="plus" label="5 minutter mere" variant="secondary" onClick={() => void actions.setMinutes(stop, stop.minutes + 5)} />
                  </div>
                  <IconButton
                    icon="pencil"
                    label="Omdøb"
                    variant="secondary"
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
                    <Button variant="ghost" icon="undo-2" onClick={() => void actions.setVisited(stop, false)}>
                      Ikke besøgt
                    </Button>
                  )}
                  <IconButton
                    icon="trash-2"
                    label="Fjern fra ruten"
                    variant="danger"
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
