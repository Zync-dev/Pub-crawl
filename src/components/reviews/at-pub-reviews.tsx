"use client";

import { useCallback, useState } from "react";
import type { Member, Stop } from "@/lib/types";
import { formatSummary, useReviews } from "@/lib/use-reviews";
import { useAsk } from "../ask";
import { Card, SectionTitle } from "../ds";
import { PhotoThumbs, TakePhotoButton } from "./photo-strip";
import { PhotoViewer } from "./photo-viewer";
import { StarRating } from "./star-rating";

// Under Nu, mens I er på en pub: stjerner til stedet og billeder herfra.
export function AtPubReviews({ stop, members }: { stop: Stop; members?: Member[] }) {
  const ask = useAsk();
  const reviews = useReviews(stop.crawl_id);
  const [viewing, setViewing] = useState<number | null>(null);
  const summary = reviews.summary(stop.id);
  const photos = reviews.photosAt(stop.id);
  const pending = reviews.pending.filter((p) => p.stopId === stop.id);
  const close = useCallback(() => setViewing(null), []);

  async function rate(stars: number) {
    try {
      navigator.vibrate?.(20);
    } catch {}
    if (!(await reviews.rate(stop.id, stars))) ask.toast("Stjernerne blev ikke gemt. Prøv igen.", "danger");
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <SectionTitle
          eyebrow={summary ? formatSummary(summary) : "Ingen stjerner endnu"}
          title="Hvordan er stedet?"
        />
        <div className="-ml-2">
          <StarRating value={summary?.mine ?? null} onChange={(n) => void rate(n)} size={28} label={`Stjerner til ${stop.name}`} />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="pc-label text-oxblood-700">
          {photos.length ? `${photos.length} ${photos.length === 1 ? "billede" : "billeder"} herfra` : "Billeder herfra"}
        </p>
        <PhotoThumbs photos={photos} pending={pending} onOpen={setViewing} />
        <TakePhotoButton crawlId={stop.crawl_id} stopId={stop.id} busy={pending.length > 0} fullWidth />
      </div>

      {viewing !== null && (
        <PhotoViewer
          crawlId={stop.crawl_id}
          photos={photos}
          startIndex={viewing}
          stopName={() => stop.name}
          members={members}
          onClose={close}
        />
      )}
    </Card>
  );
}
