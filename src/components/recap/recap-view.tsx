"use client";

import {
  Timer,
  Camera,
  ChevronLeft,
  Footprints,
  Megaphone,
  Share2,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { memberTone } from "@/lib/colors";
import { DRINK_BY_KIND, formatUnits } from "@/lib/drinks";
import { formatDistance } from "@/lib/geo";
import { usePhotoUrls } from "@/lib/photo-urls";
import {
  buildRecap,
  formatDuration,
  formatLeg,
  formatPoints,
  formatRecapDay,
  formatTimes,
  joinAll,
  recapFileName,
  shareCard,
  type Recap,
} from "@/lib/recap";
import { renderRecapImage, shareRecapImage } from "@/lib/recap-image";
import type { Photo } from "@/lib/reviews-types";
import { formatRoundCount } from "@/lib/rounds";
import type { Crawl, Member } from "@/lib/types";
import { useNow } from "@/lib/use-crawl";
import { useDrinkOutbox } from "@/lib/use-drink-outbox";
import { useRecapData } from "@/lib/use-recap-data";
import { formatStars, useReviews } from "@/lib/use-reviews";
import { useAsk } from "../ask";
import { Avatar, Badge, Button, Card, Header, Icon, SectionTitle, Spinner, StopCard } from "../ds";
import { PhotoViewer } from "../reviews/photo-viewer";
import { StarsShown } from "../reviews/star-rating";

// Aftenens regnskab: hele turen samlet på én side, klar til at dele som billede.
export function RecapView({ initial, userId }: { initial: Crawl; userId: string }) {
  const data = useRecapData(initial);
  const reviews = useReviews(initial.id);
  const now = useNow(30_000);
  const ask = useAsk();
  const { crawl, refetch } = data;

  // Drinks i telefonens offline-kø tæller med her og sendes også herfra, for turens side er skjult
  // (eller slet ikke åbnet), mens man står på regnskabet. Når noget er sendt, hentes regnskabet igen.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchSoon = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void refetch(), 400);
  }, [refetch]);
  useEffect(
    () => () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    },
    [],
  );
  const outbox = useDrinkOutbox(initial.id, userId, data.drinks, refetchSoon, () =>
    ask.toast("En drink kunne ikke gemmes.", "danger"),
  );

  // Ny kode, mens regnskabet er åbent: ret adressen, så et genindlæs stadig finder turen.
  const shownCode = useRef(initial.code);
  useEffect(() => {
    const previous = shownCode.current;
    shownCode.current = crawl.code;
    if (previous === crawl.code) return;
    if (window.location.pathname.toUpperCase() === `/T/${previous.toUpperCase()}/REGNSKAB`) {
      window.history.replaceState(null, "", `/t/${crawl.code}/regnskab`);
    }
  }, [crawl.code]);

  const [retrying, setRetrying] = useState(false);
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      if (!(await refetch())) ask.toast("Stadig ingen forbindelse. Prøv igen om lidt.", "danger");
    } finally {
      setRetrying(false);
    }
  }

  const recap = useMemo(
    () =>
      buildRecap({
        crawl,
        members: data.members,
        stops: data.stops,
        drinks: outbox.drinks,
        rounds: data.rounds,
        challenges: data.challenges,
        votes: data.votes,
        ratings: reviews.ratings,
        photos: reviews.photos,
        rollCalls: data.rollCalls,
        rollCallAnswers: data.rollCallAnswers,
        now,
      }),
    [crawl, data.members, data.stops, outbox.drinks, data.rounds, data.challenges, data.votes, data.rollCalls, data.rollCallAnswers, reviews.ratings, reviews.photos, now],
  );

  const card = useMemo(() => shareCard(recap), [recap]);
  const cardKey = useMemo(() => JSON.stringify(card), [card]);
  const [image, setImage] = useState<{ key: string; blob: Blob } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);

  // Billedet tegnes på forhånd, så Del kan åbne delearket i samme tryk (Safari kræver det).
  useEffect(() => {
    if (!data.loaded) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      renderRecapImage(JSON.parse(cardKey))
        .then((blob) => !cancelled && setImage({ key: cardKey, blob }))
        .catch(() => {});
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cardKey, data.loaded]);

  // Siden bevares med Activity. Billedviseren skal ikke stå åben, når man kommer tilbage.
  useLayoutEffect(() => () => setViewer(null), []);

  async function share() {
    if (sharing) return;
    setSharing(true);
    try {
      const blob = image?.key === cardKey ? image.blob : await renderRecapImage(card);
      const result = await shareRecapImage(blob, recapFileName(recap.name), `Aftenens regnskab · ${recap.name}`);
      if (result === "downloaded") ask.toast("Billedet er hentet");
      else if (result === "retry") ask.toast("Billedet er klar. Tryk på Del igen.");
    } catch {
      ask.toast("Billedet blev ikke til. Prøv igen.", "danger");
    } finally {
      setSharing(false);
    }
  }

  const back = (
    <Link href={`/t/${encodeURIComponent(crawl.code)}`} className="pc-btn pc-btn--ghost pc-btn--sm" style={{ paddingLeft: 6 }}>
      <Icon name={ChevronLeft} size={16} />
      Turen
    </Link>
  );

  // Uden data endnu er datoen og status gæt (turens oprettelse, "Ikke begyndt"), så de venter.
  if (!data.loaded && !data.failed) return <RecapLoading left={back} />;

  if (!data.loaded) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-cream-200">
        <Header title="Aftenens regnskab" left={back} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-green-800">
          <Card variant="framed" className="mx-4 flex flex-col gap-3 text-center">
            <p className="pc-label text-oxblood-700">Ingen forbindelse</p>
            <p className="text-muted">Regnskabet kunne ikke hentes.</p>
            <Button variant="primary" loading={retrying} onClick={() => void retry()}>
              Prøv igen
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const nothing = recap.status === "empty" && recap.totals.drinks + recap.totals.water === 0;
  const stopName = (id: string | null) => data.stops.find((s) => s.id === id)?.name;

  // Status står i heroen. Sidehovedet har kun datoen, så den ikke klippes af på en telefon.
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-cream-200">
      <Header eyebrow={formatRecapDay(recap.date)} title="Aftenens regnskab" left={back} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-[18px]">
          {nothing ? (
            // Intet at dele endnu: ét kort og vejen tilbage, ingen delknapper med nuller.
            <Card variant="framed" className="pc-enter text-center">
              <p className="pc-label mb-2 text-oxblood-700">Aftenen venter</p>
              <p className="mb-1 font-serif text-[24px] italic leading-tight">{recap.name}</p>
              <p className="text-muted">Tjek ind på første pub, så begynder regnskabet.</p>
            </Card>
          ) : (
            <Hero recap={recap} sharing={sharing} onShare={() => void share()} />
          )}

          {nothing ? null : (
            <>
              <Standings recap={recap} userId={userId} />
              <RouteSection recap={recap} />
              <DrinksSection recap={recap} />
              <BestPubSection recap={recap} />
              <RoundsSection recap={recap} userId={userId} />
              <ChallengesSection recap={recap} />
              <PhotosSection photos={recap.photos.mosaic} count={recap.photos.count} all={reviews.photos} onOpen={setViewer} />
              <RollCallSection recap={recap} />
            </>
          )}

          <div className="flex flex-col gap-2.5">
            {!nothing && (
              <Button variant="gold" size="lg" icon={Share2} fullWidth loading={sharing} onClick={() => void share()}>
                {sharing ? "Gør billedet klar" : "Del regnskabet"}
              </Button>
            )}
            <Link href={`/t/${encodeURIComponent(crawl.code)}`} className="pc-btn pc-btn--ghost pc-btn--full">
              <Icon name={ChevronLeft} size={18} />
              Tilbage til turen
            </Link>
          </div>
        </div>
      </main>

      {viewer !== null && reviews.photos.length > 0 && (
        <PhotoViewer
          crawlId={crawl.id}
          photos={sortedPhotos(reviews.photos)}
          startIndex={viewer}
          stopName={stopName}
          members={data.members}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

function sortedPhotos(photos: Photo[]) {
  return photos.slice().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function Hero({ recap, sharing, onShare }: { recap: Recap; sharing: boolean; onShare: () => void }) {
  const visited = recap.route.length;
  const figures = [
    { value: formatUnits(recap.totals.units), label: "Genstande" },
    { value: String(recap.totals.drinks), label: "Drinks" },
    { value: recap.plannedStops > visited ? `${visited}/${recap.plannedStops}` : String(visited), label: "Pubs" },
    { value: formatDistance(recap.walkedMeters), label: "Gået" },
  ];
  return (
    <Card variant="inverse" className="pc-card--framed pc-on-dark pc-enter flex flex-col gap-4">
      <div>
        <p className="pc-eyebrow" style={{ color: "var(--gold-500)" }}>
          {recap.status === "done" ? "Ruten er gået. Godt gået." : recap.status === "live" ? "Regnskabet indtil nu" : "Aftenen venter"}
        </p>
        <p className="mt-2 font-serif text-[34px] italic leading-[1.05]">{recap.name}</p>
      </div>
      {/* To og to på en telefon: fire kolonner er for smalle til "Genstande" og "1,2 km". */}
      <div
        className="grid grid-cols-2 gap-x-2 gap-y-4 border-t pt-4 min-[440px]:grid-cols-4"
        style={{ borderColor: "rgba(201,162,74,.4)" }}
      >
        {figures.map((f) => (
          <div key={f.label} className="min-w-0 text-center">
            <p className="whitespace-nowrap font-serif text-[24px] leading-none tabular-nums">{f.value}</p>
            <p className="pc-label mt-2 truncate" style={{ color: "var(--gold-300)" }}>
              {f.label}
            </p>
          </div>
        ))}
      </div>
      <Button variant="gold" icon={Share2} fullWidth loading={sharing} onClick={onShare}>
        {sharing ? "Gør billedet klar" : "Del regnskabet"}
      </Button>
    </Card>
  );
}

function Standings({ recap, userId }: { recap: Recap; userId: string }) {
  if (!recap.top.length) return null;
  return (
    <section>
      <SectionTitle eyebrow="Flest genstande" title="Top 3" />
      <ol className="flex flex-col gap-2.5">
        {recap.top.map((t, i) => (
          <li key={t.member.user_id} className="pc-enter" style={{ animationDelay: `${i * 40}ms` }}>
            <Card padding="12px 14px" variant={i === 0 ? "framed" : "plain"}>
              <div className="flex items-center gap-3">
                <span className="w-5 text-center font-serif text-[22px] text-muted">{i + 1}</span>
                <Avatar name={t.member.name} tone={memberTone(t.member.color)} size={40} ring={t.member.user_id === userId} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-[20px] leading-tight">{t.member.name}</span>
                  <span className="block text-[13px] text-muted">{t.drinks === 1 ? "1 drink" : `${t.drinks} drinks`}</span>
                </span>
                <span className="text-right">
                  <span className="block font-serif text-[28px] leading-none tabular-nums text-green-800">{formatUnits(t.units)}</span>
                  <span className="pc-label text-muted">Gst.</span>
                </span>
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RouteSection({ recap }: { recap: Recap }) {
  if (!recap.route.length) return null;
  const estimated = recap.route.some((l) => l.leftEstimated);
  const total = recap.route.reduce((s, l) => s + l.stayMs, 0);
  return (
    <section>
      <SectionTitle
        eyebrow={`${recap.route.length === 1 ? "1 pub" : `${recap.route.length} pubs`} · ${formatDuration(total)} på pub`}
        title="Ruten"
      />
      <ol className="flex flex-col gap-2.5">
        {recap.route.map((leg, i) => (
          <li key={leg.stop.id} className="pc-enter" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
            <StopCard
              number={leg.order}
              total={recap.plannedStops}
              name={leg.stop.name}
              status={leg.here ? "current" : "done"}
              note={
                <>
                  <span className="block">{formatLeg(leg)}</span>
                  <span className="block">
                    {leg.drinks === 1 ? "1 drink" : `${leg.drinks} drinks`}
                    {leg.walkMeters > 0 && ` · ${formatDistance(leg.walkMeters)} herhen`}
                  </span>
                </>
              }
            />
          </li>
        ))}
      </ol>
      {recap.walkedMeters > 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Icon name={Footprints} size={16} color="var(--green-800)" />
          {formatDistance(recap.walkedMeters)} gået i lige linjer mellem pubberne.
        </p>
      )}
      {estimated && <p className="mt-1 text-[13px] text-muted">ca. = anslået, fordi ingen trykkede Videre.</p>}
    </section>
  );
}

function DrinksSection({ recap }: { recap: Recap }) {
  const { totals, popular } = recap;
  if (!totals.drinks && !totals.water) return null;
  return (
    <section>
      <SectionTitle eyebrow="Hele holdet" title="Hvad drak vi?" />
      <Card className="flex flex-col gap-3">
        {popular && (
          <div className="flex items-center gap-3">
            <span
              className="flex shrink-0 items-center justify-center rounded-full bg-green-800"
              style={{ width: 44, height: 44, color: "var(--gold-500)" }}
              aria-hidden
            >
              <Icon name={DRINK_BY_KIND[popular.kind].icon} size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="pc-label block text-oxblood-700">Mest bestilt</span>
              <span className="block font-serif text-[24px] leading-tight">{popular.label}</span>
            </span>
            <span className="text-right">
              <span className="block font-serif text-[28px] leading-none tabular-nums text-green-800">{popular.count}</span>
              <span className="pc-label text-muted">{Math.round(popular.share * 100)} %</span>
            </span>
          </div>
        )}
        <p className="border-t border-line pt-3 text-sm text-muted">
          {formatUnits(totals.units)} genstande · {totals.drinks === 1 ? "1 drink" : `${totals.drinks} drinks`} ·{" "}
          {totals.water === 1 ? "1 glas vand" : `${totals.water} glas vand`}
        </p>
      </Card>
    </section>
  );
}

function BestPubSection({ recap }: { recap: Recap }) {
  const [best, ...rest] = recap.pubs;
  if (!best) return null;
  return (
    <section>
      <SectionTitle eyebrow="Holdets stjerner" title="Aftenens bedste pub" />
      <Card variant="framed" className="pc-enter flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 truncate font-serif text-[26px] leading-tight">{best.stop.name}</p>
          <Badge tone="gold" icon={Star}>
            Bedst
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StarsShown average={best.average} size={20} />
          <span className="text-[13px] text-muted">
            {formatStars(best.average)} · {best.count === 1 ? "1 stemme" : `${best.count} stemmer`}
          </span>
        </div>
        {rest.length > 0 && (
          <ol className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
            {rest.map((p, i) => (
              <li key={p.stop.id} className="flex items-center gap-3">
                <span className="w-5 text-center font-serif text-[18px] text-muted">{i + 2}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.stop.name}</span>
                <span className="text-[13px] tabular-nums text-muted">
                  {formatStars(p.average)} · {p.count === 1 ? "1 stemme" : `${p.count} stemmer`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}

function RoundsSection({ recap, userId }: { recap: Recap; userId: string }) {
  const { total, people } = recap.rounds;
  if (!total) return null;
  const top = Math.max(1, ...people.map((p) => p.count));
  return (
    <section>
      <SectionTitle eyebrow={`${formatRoundCount(total)} i alt`} title="Omgange" />
      <Card className="flex flex-col gap-3">
        {people.map((p) => (
          <div key={p.member.user_id} className="flex items-center gap-3">
            <Avatar name={p.member.name} tone={memberTone(p.member.color)} size={32} ring={p.member.user_id === userId} />
            <span className="w-24 shrink-0 truncate text-sm font-semibold">{p.member.name}</span>
            <span className="h-5 flex-1 overflow-hidden rounded-[var(--radius-xs)] bg-cream-300">
              <span className="pc-grow block h-full bg-gold-500" style={{ width: `${(p.count / top) * 100}%` }} />
            </span>
            <span className="w-7 text-right font-serif text-[18px] tabular-nums">{p.count}</span>
          </div>
        ))}
      </Card>
    </section>
  );
}

function ChallengesSection({ recap }: { recap: Recap }) {
  const { leaders, completed, total, mostVoted } = recap.challenges;
  if (!total) return null;
  return (
    <section>
      <SectionTitle eyebrow={`${completed} af ${total} klaret`} title="Udfordringer" />
      <div className="flex flex-col gap-2.5">
        <Card className="flex items-center gap-3">
          <span
            className="flex shrink-0 items-center justify-center rounded-full"
            style={{ width: 44, height: 44, background: "var(--gold-500)", color: "var(--green-900)" }}
            aria-hidden
          >
            <Icon name={Trophy} size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="pc-label block text-oxblood-700">Flest point</span>
            <span className="block truncate font-serif text-[22px] leading-tight">
              {leaders.length ? joinAll(leaders.map((l) => l.member.name)) : "Ingen point endnu"}
            </span>
          </span>
          {leaders.length > 0 && (
            <span className="text-right font-serif text-[22px] tabular-nums text-green-800">{formatPoints(leaders[0].points)}</span>
          )}
        </Card>
        {mostVoted && (
          <Card variant="inverse" className="pc-on-dark flex flex-col gap-2">
            <p className="pc-label" style={{ color: "var(--gold-500)" }}>
              Mest stemt
            </p>
            <p className="font-serif text-[22px] leading-[1.15]">{mostVoted.challenge.text}</p>
            <p className="text-[13px]" style={{ color: "rgba(251,245,230,.75)" }}>
              {mostVoted.votes === 1 ? "1 stemme" : `${mostVoted.votes} stemmer`} · {mostVoted.done} sagde klaret ·{" "}
              {mostVoted.completed ? "den tæller" : "den tæller ikke"}
            </p>
          </Card>
        )}
      </div>
    </section>
  );
}

const MOSAIC = 6;

function PhotosSection({
  photos,
  count,
  all,
  onOpen,
}: {
  photos: Photo[];
  count: number;
  all: Photo[];
  onOpen: (index: number) => void;
}) {
  const urls = usePhotoUrls(photos.map((p) => p.path));
  if (!count) return null;
  const ordered = sortedPhotos(all);
  return (
    <section>
      <SectionTitle eyebrow={count === 1 ? "1 billede" : `${count} billeder`} title="Billederne" />
      <ul className="grid grid-cols-3 gap-2" aria-label="Billeder fra aftenen">
        {photos.slice(0, MOSAIC).map((p, i) => {
          const url = urls(p.path);
          const index = Math.max(0, ordered.findIndex((o) => o.id === p.id));
          return (
            <li key={p.id} className="pc-enter" style={{ animationDelay: `${i * 40}ms` }}>
              <button
                type="button"
                onClick={() => onOpen(index)}
                aria-label={`Vis billede ${index + 1} af ${count}`}
                className="block aspect-square w-full overflow-hidden rounded-[var(--radius-sm)] border border-line bg-cream-300 active:translate-y-px"
                style={{ padding: 0, minHeight: 44 }}
              >
                {url ? (
                  // Signerede links fra en privat bucket passer ikke til next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" loading="lazy" decoding="async" className="pc-fade-in h-full w-full object-cover" draggable={false} />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-green-800">
                    <Spinner size={16} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {count > MOSAIC && (
        <Button variant="ghost" size="sm" icon={Camera} className="mt-2" onClick={() => onOpen(0)}>
          Se alle {count}
        </Button>
      )}
    </section>
  );
}

// "3 opråb · alle svarede 2 gange", "2 opråb · alle svarede hver gang".
function rollCallEyebrow(count: number, complete: number) {
  const calls = count === 1 ? "1 opråb" : `${count} opråb`;
  if (!complete) return calls;
  return `${calls} · alle svarede ${complete === count ? "hver gang" : formatTimes(complete)}`;
}

function RollCallSection({ recap }: { recap: Recap }) {
  const r = recap.rollCalls;
  if (!r.count) return null;
  const names = (members: Member[]) => joinAll(members.map((m) => m.name));
  return (
    <section>
      <SectionTitle eyebrow={rollCallEyebrow(r.count, r.complete)} title="Er alle med?" />
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex shrink-0 items-center justify-center rounded-full bg-green-800"
            style={{ width: 44, height: 44, color: "var(--gold-500)" }}
            aria-hidden
          >
            <Icon name={r.mostOftenLast ? Megaphone : Users} size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="pc-label block text-oxblood-700">Oftest sidst med</span>
            <span className="block truncate font-serif text-[22px] leading-tight">
              {r.mostOftenLast ? names(r.mostOftenLast.members) : "Ingen endnu"}
            </span>
          </span>
          {r.mostOftenLast && (
            <span className="text-right text-[13px] tabular-nums text-muted">{formatTimes(r.mostOftenLast.count)}</span>
          )}
        </div>
        {r.averageGatherMs !== null && (
          <p className="flex items-center gap-2 border-t border-line pt-3 text-sm text-muted">
            <Icon name={Timer} size={16} color="var(--green-800)" />
            Holdet var samlet på {formatDuration(r.averageGatherMs)} i snit.
          </p>
        )}
        {r.lastCounts.length > 1 && (
          <ul className="flex flex-col gap-1 text-sm">
            {r.lastCounts.map((l) => (
              <li key={l.member.user_id} className="flex justify-between gap-3">
                <span className="truncate">{l.member.name}</span>
                <span className="tabular-nums text-muted">{formatTimes(l.count)} sidst</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

// Den samme ventevisning hele vejen, fra siden indlæses, til regnskabet er gjort op.
export function RecapLoading({ left }: { left?: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-cream-200">
      <Header title="Aftenens regnskab" left={left} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-green-800">
        <Spinner size={28} label="Gør regnskabet op" />
        <p className="pc-eyebrow text-muted">Gør regnskabet op</p>
      </div>
    </div>
  );
}
