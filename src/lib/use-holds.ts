"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  addHold,
  applyHolds,
  dropHold,
  HOLD_GRACE_MS,
  HOLD_MAX_MS,
  pruneHolds,
  releaseHold,
  type Hold,
  type HoldChange,
} from "./holds";
import type { Crawl, Stop } from "./types";

// Fastholder en lokal ændring lidt, så Realtime-ekko af en ældre skrivning eller en forældet
// genhentning ikke får skærmen til at hoppe frem og tilbage, fx når man trykker Fortryd hurtigt.

export type { HeldView, HoldChange } from "./holds";
export type HoldHandle = { release: () => void; drop: () => void };

export function useHolds(crawl: Crawl, stops: Stop[]) {
  const [holds, setHolds] = useState<Hold[]>([]);
  const seq = useRef(0);

  const prune = useCallback(() => {
    setHolds((list) => pruneHolds(list, Date.now()));
  }, []);

  // Et nyt hold med samme nøgle erstatter det gamle, så Fortryd vinder over det, den fortryder.
  const hold = useCallback(
    (key: string, change: HoldChange): HoldHandle => {
      const token = ++seq.current;
      setHolds((list) => addHold(list, { key, token, change, until: Date.now() + HOLD_MAX_MS }));
      setTimeout(prune, HOLD_MAX_MS + 50);
      return {
        release() {
          setHolds((list) => releaseHold(list, token, Date.now()));
          setTimeout(prune, HOLD_GRACE_MS + 50);
        },
        drop() {
          setHolds((list) => dropHold(list, token));
        },
      };
    },
    [prune],
  );

  const view = useMemo(() => applyHolds(holds, { crawl, stops }), [holds, crawl, stops]);

  return { crawl: view.crawl, stops: view.stops, hold };
}
