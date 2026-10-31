"use client";

import { Images } from "lucide-react";
import { useCallback, useState } from "react";
import type { Member, Stop } from "@/lib/types";
import { formatSummary, useReviews } from "@/lib/use-reviews";
import { useAsk } from "../ask";
import { Icon } from "../ds";
import { PhotoViewer } from "./photo-viewer";
import { StarRating } from "./star-rating";

// Noten i StopCard på Ruten: den gamle tekst plus gennemsnittet, og for besøgte pubs
// stjernerne og et tryk til pubbens billeder. Den pub, I er på nu, får sine stjerner under Nu:
// i kortet her er der ikke plads til dem ved siden af "Nu" og Vis vej.
export function StopReviewNote({
  stop,
  text,
  status,
  editing,
  members,
}: {
  stop: Stop;
  text: string;
  status: "upcoming" | "current" | "done";
  editing?: boolean;
  members?: Member[];
}) {
  const ask = useAsk();
  const reviews = useReviews(stop.crawl_id);
  const [viewing, setViewing] = useState<number | null>(null);
  const close = useCallback(() => setViewing(null), []);
  const summary = reviews.summary(stop.id);
  const photos = reviews.photosAt(stop.id);
  const visited = status !== "upcoming";
  const dark = status === "current";
  const line = [text, summary ? formatSummary(summary) : null].filter(Boolean).join(" · ");

  async function rate(stars: number) {
    if (!(await reviews.rate(stop.id, stars))) ask.toast("Stjernerne blev ikke gemt. Prøv igen.", "danger");
  }

  return (
    <>
      {line}
      {!editing && visited && (!dark || photos.length > 0) && (
        <span className="-ml-2.5 mt-1 flex flex-wrap items-center gap-x-1" onClick={(e) => e.stopPropagation()}>
          {!dark && (
            <StarRating
              value={summary?.mine ?? null}
              onChange={(n) => void rate(n)}
              size={20}
              tone="light"
              label={`Stjerner til ${stop.name}`}
            />
          )}
          {photos.length > 0 && (
            <button
              type="button"
              onClick={() => setViewing(0)}
              aria-label={`Se ${photos.length} ${photos.length === 1 ? "billede" : "billeder"} fra ${stop.name}`}
              className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 font-semibold active:translate-y-px"
              style={{ background: "none", border: 0, color: dark ? "var(--gold-300)" : "var(--green-800)" }}
            >
              <Icon name={Images} size={18} />
              <span className="tabular-nums">{photos.length}</span>
            </button>
          )}
        </span>
      )}
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
    </>
  );
}
