"use client";

import { memberTone } from "@/lib/colors";
import { DRINK_BY_KIND, DRINK_KINDS, formatUnits } from "@/lib/drinks";
import { kindTotals, memberStats, stopTotals } from "@/lib/stats";
import type { Drink, DrinkKind, Member, Stop } from "@/lib/types";
import { Avatar, Badge, Card, Icon, SectionTitle } from "./ds";
import { ChallengeRanking } from "./games/challenge-ranking"; // games: udfordringspoint
import { RoundsStandings } from "./rounds"; // Omgange
import { BestPub } from "./reviews/best-pub"; // pub-reviews
import { RecapCard } from "./recap/recap-link"; // recap: Aftenens regnskab

export function StatsTab({
  members,
  drinks,
  stops,
  userId,
  now,
}: {
  members: Member[];
  drinks: Drink[];
  stops: Stop[];
  userId: string;
  now: number;
}) {
  const people = memberStats(members, drinks, now);
  const totals = kindTotals(drinks);
  const perStop = stopTotals(stops, drinks).filter((s) => s.count > 0);
  const top = Math.max(1, ...people.map((p) => p.units));
  const topKind = Math.max(1, ...Object.values(totals).map((n) => n ?? 0));
  const topStop = Math.max(1, ...perStop.map((s) => s.count));

  if (!drinks.length) {
    return (
      <div className="flex flex-col gap-6 px-4 py-[18px]">
        {/* recap: Aftenens regnskab */}
        <RecapCard />
        <Card variant="framed" className="text-center">
          <p className="pc-label mb-2 text-oxblood-700">Ingen omgange endnu</p>
          <p className="text-muted">Når I skriver drinks ind under Nu, kommer stillingen her.</p>
        </Card>
        {/* games: udfordringspoint */}
        <ChallengeRanking />
        {/* Omgange */}
        <RoundsStandings hideWhenEmpty />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-[18px]">
      {/* recap: Aftenens regnskab */}
      <RecapCard />
      <section>
        <SectionTitle eyebrow="Flest genstande" title="Hvem fører?" />
        <ol className="flex flex-col gap-2.5">
          {people.map((p, i) => {
            const me = p.member.user_id === userId;
            return (
              <li
                key={p.member.user_id}
                className="pc-enter"
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
              >
                <Card padding="12px 14px" variant={i === 0 && p.units > 0 ? "framed" : "plain"}>
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-center font-serif text-[20px] text-muted">{i + 1}</span>
                    <Avatar name={p.member.name} tone={memberTone(p.member.color)} size={40} ring={me} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[20px] leading-tight">
                        {p.member.name}
                        {me && <span className="text-muted"> (dig)</span>}
                      </span>
                      <span className="block text-[13px] text-muted">
                        {p.count} drinks · {p.water} vand
                        {p.perHour !== null && ` · ${formatUnits(p.perHour)} i timen`}
                      </span>
                    </span>
                    <span className="text-right">
                      <span
                        key={p.units}
                        className="pc-pop block font-serif text-[28px] leading-none tabular-nums text-green-800"
                      >
                        {formatUnits(p.units)}
                      </span>
                      <span className="pc-label text-muted">Gst.</span>
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cream-300">
                    <div
                      className="pc-grow h-full rounded-full bg-gold-500 transition-[width] duration-500"
                      style={{ width: `${(p.units / top) * 100}%` }}
                    />
                  </div>
                  {Object.keys(p.byKind).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                      {DRINK_KINDS.filter((d) => p.byKind[d.kind]).map((d) => (
                        <span key={d.kind} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <Icon name={d.icon} size={14} color="var(--green-800)" />
                          {p.byKind[d.kind]} {d.label.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  )}
                  {i === 0 && p.units > 0 && (
                    <div className="mt-3">
                      <Badge tone="gold" icon="beer">
                        Fører
                      </Badge>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      {/* pub-reviews: aftenens bedste pub efter holdets stjerner */}
      {stops.length > 0 && <BestPub crawlId={stops[0].crawl_id} stops={stops} />}

      <section>
        <SectionTitle eyebrow="Hele holdet" title="Hvad drikker vi?" />
        <Card className="flex flex-col gap-3">
          {(Object.entries(totals) as [DrinkKind, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([kind, count]) => (
              <div key={kind} className="flex items-center gap-3">
                <span className="flex w-24 shrink-0 items-center gap-2 text-sm font-semibold">
                  <Icon name={DRINK_BY_KIND[kind].icon} size={16} color="var(--green-800)" />
                  {DRINK_BY_KIND[kind].label}
                </span>
                <span className="h-5 flex-1 overflow-hidden rounded-[var(--radius-xs)] bg-cream-300">
                  <span
                    className="pc-grow block h-full bg-green-800 transition-[width] duration-500"
                    style={{ width: `${(count / topKind) * 100}%` }}
                  />
                </span>
                <span className="w-7 text-right font-serif text-[18px] tabular-nums">{count}</span>
              </div>
            ))}
        </Card>
      </section>

      {/* games: udfordringspoint */}
      <ChallengeRanking />

      {perStop.length > 0 && (
        <section>
          <SectionTitle eyebrow="Drinks pr. pub" title="Hvor gik det stærkest?" />
          <Card className="flex flex-col gap-3">
            {perStop.map(({ stop, count, units }) => (
              <div key={stop.id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm font-semibold">{stop.name}</span>
                <span className="h-5 flex-1 overflow-hidden rounded-[var(--radius-xs)] bg-cream-300">
                  <span
                    className="pc-grow block h-full bg-gold-500 transition-[width] duration-500"
                    style={{ width: `${(count / topStop) * 100}%` }}
                  />
                </span>
                <span className="w-16 text-right text-[13px] tabular-nums text-muted">
                  {count} · {formatUnits(units)} gst.
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* Omgange */}
      <RoundsStandings />
    </div>
  );
}
