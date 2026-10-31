"use client";

import { Camera } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { usePhotoUrls } from "@/lib/photo-urls";
import type { PendingPhoto, Photo } from "@/lib/reviews-types";
import { useReviews } from "@/lib/use-reviews";
import { useAsk } from "../ask";
import { Button, Spinner } from "../ds";

const THUMB = 72;

// Små billeder i en vandret række. Tryk åbner viseren.
export function PhotoThumbs({
  photos,
  pending = [],
  onOpen,
}: {
  photos: Photo[];
  pending?: PendingPhoto[];
  onOpen: (index: number) => void;
}) {
  const urls = usePhotoUrls(photos.map((p) => p.path));
  if (!photos.length && !pending.length) return null;
  return (
    <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Billeder">
      {photos.map((p, i) => {
        const url = urls(p.path);
        return (
          <li key={p.id} className="pc-enter shrink-0">
            <button
              type="button"
              onClick={() => onOpen(i)}
              aria-label={`Vis billede ${i + 1} af ${photos.length}`}
              className="block overflow-hidden rounded-[var(--radius-sm)] border border-line bg-cream-300 active:translate-y-px"
              style={{ width: THUMB, height: THUMB, padding: 0 }}
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={THUMB}
                  height={THUMB}
                  className="pc-fade-in h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-green-800">
                  <Spinner size={16} />
                </span>
              )}
            </button>
          </li>
        );
      })}
      {pending.map((p) => (
        <li key={p.id} className="pc-enter shrink-0">
          <span
            className="flex items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-line-strong bg-cream-300 text-green-800"
            style={{ width: THUMB, height: THUMB }}
          >
            <Spinner size={18} label="Lægger billedet op" />
          </span>
        </li>
      ))}
    </ul>
  );
}

// Knappen åbner telefonens valg mellem kamera og billeder.
export function TakePhotoButton({
  crawlId,
  stopId,
  busy,
  fullWidth,
}: {
  crawlId: string;
  stopId: string | null;
  busy?: boolean;
  fullWidth?: boolean;
}) {
  const ask = useAsk();
  const reviews = useReviews(crawlId);
  const input = useRef<HTMLInputElement>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    let failed = 0;
    for (const file of files) {
      if (!(await reviews.upload(file, stopId))) failed++;
    }
    if (failed) {
      ask.toast(
        failed === files.length && files.length === 1
          ? "Billedet kom ikke op. Prøv igen."
          : `${failed} af ${files.length} billeder kom ikke op.`,
        "danger",
      );
    } else if (files.length) {
      ask.toast(files.length === 1 ? "Billedet er delt med holdet" : `${files.length} billeder er delt med holdet`);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onPick(e)}
      />
      <Button
        variant="secondary"
        icon={Camera}
        fullWidth={fullWidth}
        loading={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Lægger op" : "Tag et billede"}
      </Button>
    </>
  );
}
