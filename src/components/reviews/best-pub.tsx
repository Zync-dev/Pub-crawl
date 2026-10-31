"use client";

import type { Stop } from "@/lib/types";
import { formatStars, formatSummary, summarize, useReviews } from "@/lib/use-reviews";
import { Badge, Card, SectionTitle } from "../ds";
import { StarsShown } from "./star-rating";

// Stillingen: pubben med flest stjerner i snit. Ved lige snit vinder den med flest stemmer.
export function BestPub({ crawlId, stops }: { crawlId: string; stops: Stop[] }) {
  const reviews = useReviews(crawlId);
  const ranked = stops
    .map((stop) => ({ stop, summary: summarize(reviews.ratings, stop.id, reviews.userId) }))
    .filter((r): r is { stop: Stop; summary: NonNullable<typeof r.summary> } => r.summary !== null)
    .sort(
      (a, b) =>
        b.summary.average - a.summary.average ||
        b.summary.count - a.summary.count ||
        a.stop.position - b.stop.position,
    );

  if (!ranked.length) return null;
  const [best, ...rest] = ranked;

  return (
    <section>
      <SectionTitle eyebrow="Holdets stjerner" title="Aftenens bedste pub" />
      <Card variant="framed" className="pc-enter flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 truncate font-serif text-[26px] leading-tight">{best.stop.name}</p>
          <Badge tone="gold">Bedst</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StarsShown average={best.summary.average} size={20} />
          <span className="text-[13px] text-muted">{formatSummary(best.summary)}</span>
        </div>
        {rest.length > 0 && (
          <ol className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
            {rest.map(({ stop, summary }, i) => (
              <li key={stop.id} className="flex items-center gap-3">
                <span className="w-5 text-center font-serif text-[18px] text-muted">{i + 2}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{stop.name}</span>
                <StarsShown average={summary.average} size={14} />
                <span className="w-16 text-right text-[13px] tabular-nums text-muted">
                  {formatStars(summary.average)} · {summary.count}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
