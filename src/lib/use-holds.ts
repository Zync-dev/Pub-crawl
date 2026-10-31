"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Crawl, Stop } from "./types";

// Fastholder en lokal ændring lidt, så Realtime-ekko af en ældre skrivning eller en forældet
// genhentning ikke får skærmen til at hoppe frem og tilbage, fx når man trykker Fortryd hurtigt.

export type HeldView = { crawl: Crawl; stops: Stop[] };
export type HoldChange = (view: HeldView) => HeldView;
export type HoldHandle = { release: () => void; drop: () => void };

type Hold = { key: string; token: number; change: HoldChange; until: number };

// Efter skrivningen er færdig: nok til ekkoet og en genhentning, der var i gang.
const GRACE_MS = 4_000;
// En skrivning, der aldrig svarer, skal ikke låse skærmen.
const MAX_MS = 30_000;

export function useHolds(crawl: Crawl, stops: Stop[]) {
  const [holds, setHolds] = useState<Hold[]>([]);
  const seq = useRef(0);

  const prune = useCallback(() => {
    setHolds((list) => {
      const now = Date.now();
      const next = list.filter((h) => h.until > now);
      return next.length === list.length ? list : next;
    });
  }, []);

  // Et nyt hold med samme nøgle erstatter det gamle, så Fortryd vinder over det, den fortryder.
  const hold = useCallback(
    (key: string, change: HoldChange): HoldHandle => {
      const token = ++seq.current;
      setHolds((list) => [...list.filter((h) => h.key !== key), { key, token, change, until: Date.now() + MAX_MS }]);
      setTimeout(prune, MAX_MS + 50);
      return {
        release() {
          setHolds((list) =>
            list.map((h) => (h.token === token ? { ...h, until: Math.min(h.until, Date.now() + GRACE_MS) } : h)),
          );
          setTimeout(prune, GRACE_MS + 50);
        },
        drop() {
          setHolds((list) => list.filter((h) => h.token !== token));
        },
      };
    },
    [prune],
  );

  const view = useMemo(
    () => holds.reduce<HeldView>((v, h) => h.change(v), { crawl, stops }),
    [holds, crawl, stops],
  );

  return { crawl: view.crawl, stops: view.stops, hold };
}
