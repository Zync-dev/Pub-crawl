"use client";

import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePhotoUrls } from "@/lib/photo-urls";
import type { Photo } from "@/lib/reviews-types";
import { formatTime } from "@/lib/timer";
import { useReviews } from "@/lib/use-reviews";
import { useAsk } from "../ask";
import { Button, IconButton, Spinner } from "../ds";

// Billederne i fuld skærm: bladr med pilene eller ved at stryge, slet dine egne.
export function PhotoViewer({
  crawlId,
  photos,
  startIndex,
  stopName,
  onClose,
}: {
  crawlId: string;
  photos: Photo[];
  startIndex: number;
  stopName?: (stopId: string | null) => string | undefined;
  onClose: () => void;
}) {
  const ask = useAsk();
  const reviews = useReviews(crawlId);
  const urls = usePhotoUrls(photos.map((p) => p.path));
  const [index, setIndex] = useState(startIndex);
  const [deleting, setDeleting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const i = Math.max(0, Math.min(index, photos.length - 1));
  const photo = photos[i];
  const mine = photo && photo.user_id === reviews.userId;
  const url = photo ? urls(photo.path) : undefined;
  const empty = photos.length === 0;

  // Er det sidste billede slettet (måske af en anden), lukker vi.
  useEffect(() => {
    if (empty) onClose();
  }, [empty, onClose]);

  // Fokus ind i viseren og tilbage, hvor man kom fra, når den lukker.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("[data-close]")?.focus();
    return () => before?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (document.querySelector(".pc-dialog__scrim")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIndex((n) => Math.max(0, Math.min(n, photos.length - 1) - 1));
      else if (e.key === "ArrowRight") setIndex((n) => Math.min(photos.length - 1, n + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, photos.length]);

  if (!photo) return null;

  const go = (step: -1 | 1) => setIndex(Math.max(0, Math.min(photos.length - 1, i + step)));

  async function remove() {
    if (!photo) return;
    const ok = await ask.confirm({
      eyebrow: "Slet billede",
      title: "Skal billedet ud?",
      body: "Det forsvinder for hele holdet.",
      confirm: "Slet det",
      cancel: "Behold det",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    const done = await reviews.remove(photo);
    setDeleting(false);
    if (!done) ask.toast("Billedet blev ikke slettet. Tjek forbindelsen.", "danger");
  }

  const place = stopName?.(photo.stop_id);

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Billeder"
      className="pc-on-dark pc-fade-in fixed inset-0 z-[1500] flex flex-col bg-green-950 text-cream-100"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-3"
        style={{ padding: "max(12px, env(safe-area-inset-top)) 16px 12px", borderBottom: "var(--rule-double)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="pc-eyebrow truncate" style={{ color: "var(--gold-500)" }}>
            Billede {i + 1} af {photos.length}
            {place ? ` · ${place}` : ""}
          </p>
          <p className="mt-1.5 text-[13px]" style={{ color: "rgba(251,245,230,.75)" }}>
            {mine ? "Dit billede" : "Fra holdet"} · {formatTime(photo.created_at)}
          </p>
        </div>
        <IconButton data-close icon={X} label="Luk" onClick={onClose} />
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-2"
        onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          const end = e.changedTouches[0]?.clientX;
          if (start === null || end === undefined || Math.abs(end - start) < 50) return;
          go(end < start ? 1 : -1);
        }}
      >
        {url ? (
          // Signerede links fra en privat bucket, så next/image hjælper ikke her.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.id}
            src={url}
            alt={place ? `Billede fra ${place}` : "Billede fra turen"}
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            className="pc-fade-in h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <Spinner size={28} label="Henter billedet" />
        )}
      </div>

      <div
        className="flex items-center justify-between gap-3"
        style={{ padding: "12px 16px max(12px, env(safe-area-inset-bottom))", borderTop: "var(--rule-double)" }}
      >
        <IconButton icon={ChevronLeft} label="Forrige billede" variant="secondary" disabled={i === 0} onClick={() => go(-1)} />
        {mine ? (
          <Button variant="danger" icon={Trash2} loading={deleting} onClick={() => void remove()}>
            Slet
          </Button>
        ) : (
          <span />
        )}
        <IconButton
          icon={ChevronRight}
          label="Næste billede"
          variant="secondary"
          disabled={i === photos.length - 1}
          onClick={() => go(1)}
        />
      </div>
    </div>,
    document.body,
  );
}
