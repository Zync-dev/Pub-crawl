"use client";

import { ChevronLeft, ChevronRight, ImageOff, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { photoUrlFailed, usePhotoUrls } from "@/lib/photo-urls";
import type { Photo } from "@/lib/reviews-types";
import type { Member } from "@/lib/types";
import { formatTime } from "@/lib/timer";
import { useReviews } from "@/lib/use-reviews";
import { useAsk } from "../ask";
import { Button, Icon, IconButton, Spinner } from "../ds";

// Billederne i fuld skærm: bladr med pilene eller ved at stryge, slet dine egne.
export function PhotoViewer({
  crawlId,
  photos,
  startIndex,
  stopName,
  members,
  onClose,
}: {
  crawlId: string;
  photos: Photo[];
  startIndex: number;
  stopName?: (stopId: string | null) => string | undefined;
  // Holdet, så viseren kan sige, hvem der tog billedet.
  members?: Member[];
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

  // Telefonens tilbage-knap (og iOS' stryg fra kanten) lukker viseren i stedet for at forlade turen.
  // Viseren lægger sit eget trin i historikken. Lukkes den på anden vis, tages trinnet af igen.
  // Trinnet lægges først efter et øjeblik, så React's dobbelte effekt i udvikling ikke går tilbage.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    let pushed = false;
    let popped = false;
    const onPop = () => {
      popped = true;
      closeRef.current();
    };
    const timer = setTimeout(() => {
      // Next kopierer selv sine egne felter over i det nye trin.
      window.history.pushState({ pcPhotoViewer: true }, "");
      pushed = true;
      window.addEventListener("popstate", onPop);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      if (pushed && !popped && window.history.state?.pcPhotoViewer) window.history.back();
    };
  }, []);

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
      // Tab bliver inde i viseren, så man ikke havner på siden bagved.
      else if (e.key === "Tab") trapFocus(e);
      else if (e.key === "ArrowLeft") setIndex((n) => Math.max(0, Math.min(n, photos.length - 1) - 1));
      else if (e.key === "ArrowRight") setIndex((n) => Math.min(photos.length - 1, n + 1));
    }
    function trapFocus(e: KeyboardEvent) {
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
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
  const photographer = members?.find((m) => m.user_id === photo.user_id)?.name;

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
            {mine ? "Dit billede" : (photographer ?? "Fra holdet")} · {formatTime(photo.created_at)}
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
        ) : photoUrlFailed(photo.path) ? (
          <p className="pc-fade-in flex max-w-[260px] flex-col items-center gap-3 text-center text-[15px]" role="status">
            <Icon name={ImageOff} size={32} color="var(--gold-500)" />
            Billedet kan ikke hentes lige nu. Tjek forbindelsen.
          </p>
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
