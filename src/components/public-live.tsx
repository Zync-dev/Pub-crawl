"use client";

import { KeyRound, Radio } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchPublicCrawl, formatCopenhagenTime, liveStatus, type PublicCrawl } from "@/lib/live-link";
import type { Stop } from "@/lib/types";
import { DirectionsButton } from "./directions-button";
import { Badge, Card, Header, Icon, SectionTitle, Spinner, StopCard } from "./ds";

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-cream-300 text-green-800">
      <Spinner size={24} />
      <span className="pc-eyebrow text-muted">Henter kortet</span>
    </div>
  ),
});

// Gæster har ingen Realtime, så siden spørger selv hvert halve minut, mens den er synlig.
const POLL_MS = 30_000;

const noop = () => {};

export function PublicLiveHeader({ eyebrow }: { eyebrow: string }) {
  return (
    <Header
      eyebrow={eyebrow}
      title="Find holdet"
      right={
        <Badge tone="gold" icon={Radio}>
          Live
        </Badge>
      }
    />
  );
}

// Den offentlige side bag et live-link. Logger ikke ind og viser hverken navne, positioner eller drinks.
// initial er undefined, hvis serveren ikke kunne hente turen, og null, hvis linket ikke findes.
export function PublicLive({ token, initial }: { token: string; initial: PublicCrawl | null | undefined }) {
  const [crawl, setCrawl] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let controller: AbortController | null = null;

    async function poll() {
      controller?.abort();
      const own = new AbortController();
      controller = own;
      try {
        const next = await fetchPublicCrawl(token, { signal: own.signal });
        // Samme svar som sidst: behold objektet, så kortet ikke tegnes om.
        setCrawl((prev) => (prev && next && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        setUpdatedAt(new Date().toISOString());
        setFailed(false);
      } catch {
        if (!own.signal.aborted) setFailed(true);
      }
    }
    function start() {
      if (timer === null) timer = setInterval(() => void poll(), POLL_MS);
    }
    function stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      controller?.abort();
    }
    // Pause, når fanen er skjult. Når den kommer frem igen, hentes der med det samme.
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void poll();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") {
      if (initial === undefined) void poll();
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [token, initial]);

  // Kortet forventer hele Stop-rækker. Gæsterne får kun det nødvendige.
  const publicStops = crawl?.stops;
  const stops = useMemo<Stop[]>(
    () => (publicStops ?? []).map((s) => ({ ...s, crawl_id: "", created_at: "" })),
    [publicStops],
  );

  const footer = (
    <p className="text-center text-[13px] text-muted" role="status">
      {failed
        ? "Ingen forbindelse lige nu. Vi prøver igen."
        : updatedAt
          ? `Opdateret ${formatCopenhagenTime(updatedAt)} · hvert halve minut`
          : "Opdateres hvert halve minut"}
    </p>
  );

  if (crawl === undefined) {
    return (
      <Shell eyebrow="Sent på den?">
        <div className="flex flex-col items-center gap-3 py-10 text-green-800">
          <Spinner size={26} label="Henter turen" />
          <p className="pc-eyebrow text-muted">Henter turen</p>
        </div>
        {footer}
      </Shell>
    );
  }

  if (crawl === null) {
    return (
      <Shell eyebrow="Sent på den?">
        <Card variant="framed" className="pc-enter flex flex-col gap-2 text-center">
          <p className="pc-label text-oxblood-700">Linket virker ikke</p>
          <p className="font-serif text-[24px] leading-tight">Det er skiftet ud, eller turen er slut.</p>
          <p className="text-muted">Spørg holdet om et nyt link.</p>
        </Card>
      </Shell>
    );
  }

  const { current, next, started } = liveStatus(crawl);
  const total = crawl.stops.length;
  const numberOf = (id: string) => crawl.stops.findIndex((s) => s.id === id) + 1;
  const crew = crawl.member_count === 1 ? "1 på holdet" : `${crawl.member_count} på holdet`;

  return (
    <Shell eyebrow={crawl.name}>
      <Card variant="framed" className="pc-enter flex flex-col gap-3">
        {current ? (
          <>
            <p className="pc-label text-oxblood-700">
              Pub {numberOf(current.id)} af {total} · {crew}
            </p>
            <p className="font-serif text-[28px] leading-[1.1]">
              Lige nu: {current.name}
              {crawl.arrived_at && (
                <span className="text-muted"> · ankom {formatCopenhagenTime(crawl.arrived_at)}</span>
              )}
            </p>
            <DirectionsButton to={current} name={current.name} variant="gold" size="lg" fullWidth />
          </>
        ) : next ? (
          <>
            <p className="pc-label text-oxblood-700">
              {started ? "På vej" : "Ikke startet endnu"} · {crew}
            </p>
            <p className="font-serif text-[28px] leading-[1.1]">
              {started ? `På vej til ${next.name}` : `Første pub: ${next.name}`}
            </p>
            <DirectionsButton to={next} name={next.name} variant="gold" size="lg" fullWidth />
          </>
        ) : (
          <>
            <p className="pc-label text-oxblood-700">{total ? "Sidste omgang er drukket" : crew}</p>
            <p className="font-serif text-[28px] leading-[1.1]">
              {total ? "Ruten er gået for i aften." : "Ruten er ikke lagt endnu."}
            </p>
          </>
        )}
      </Card>

      {current && next && (
        <section className="pc-enter">
          <SectionTitle eyebrow="Bagefter" title="Næste pub" />
          <StopCard
            number={numberOf(next.id)}
            total={total}
            name={next.name}
            note={`${next.minutes} min. der`}
            status="upcoming"
          >
            <DirectionsButton to={next} name={next.name} iconOnly />
          </StopCard>
        </section>
      )}

      {total > 0 && (
        <section className="pc-enter flex flex-col gap-2.5">
          <SectionTitle eyebrow={`${total} pubs`} title="Ruten" />
          <div
            className="relative h-[40dvh] min-h-64 overflow-hidden rounded-[var(--radius-md)]"
            style={{ border: "var(--rule-double)" }}
          >
            {/* Samme kort som i appen, bare uden holdet og uden at kunne rette noget. */}
            <MapView
              stops={stops}
              members={[]}
              userId=""
              myPosition={null}
              currentStopId={crawl.current_stop_id}
              nearby={[]}
              adding={false}
              focus={null}
              now={0}
              onMapClick={noop}
              onPickNearby={noop}
              onViewChange={noop}
              visible
              interactive={false}
            />
          </div>
          <ol className="flex flex-col gap-2.5">
            {crawl.stops.map((stop, i) => {
              const isCurrent = stop.id === crawl.current_stop_id;
              return (
                <li key={stop.id}>
                  <StopCard
                    number={i + 1}
                    total={total}
                    name={stop.name}
                    time={stop.visited_at && !isCurrent ? formatCopenhagenTime(stop.visited_at) : undefined}
                    note={`${stop.minutes} min. ${isCurrent ? "her" : "der"}`}
                    status={isCurrent ? "current" : stop.visited_at ? "done" : "upcoming"}
                  />
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <Card className="flex items-center gap-3" padding="14px 16px">
        <Icon name={KeyRound} size={20} color="var(--green-800)" />
        <p className="min-w-0 flex-1 text-[14px]">Vil du med? Få koden af holdet.</p>
        <Link href="/" className="pc-btn pc-btn--secondary">
          Gå med
        </Link>
      </Card>

      {footer}
    </Shell>
  );
}

function Shell({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-cream-200">
      <PublicLiveHeader eyebrow={eyebrow} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[18px]">
        {children}
      </main>
    </div>
  );
}
