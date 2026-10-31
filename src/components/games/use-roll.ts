"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Det gamle resultat dæmpes et øjeblik, og så kommer det nye frem med pc-pop. Ingen løkke.
// `round` tælles op for hvert nyt resultat, så det også popper, når tallene er de samme.
// Lukkes fanen midt i (også når Next gemmer siden væk med Activity), gøres det færdigt med
// det samme: resultatet sendes, og knappen er ikke låst, når man kommer tilbage.
export function useRoll<T>(duration = 360) {
  const [value, setValue] = useState<T | null>(null);
  const [rolling, setRolling] = useState(false);
  const [round, setRound] = useState(0);
  const pending = useRef<{ final: T; done: (v: T) => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    setValue(p.final);
    setRolling(false);
    setRound((n) => n + 1);
    p.done(p.final);
  }, []);

  const start = useCallback(
    (final: T, done: (v: T) => void) => {
      finish();
      pending.current = { final, done };
      if (prefersReducedMotion()) return finish();
      setRolling(true);
      timer.current = setTimeout(finish, duration);
    },
    [duration, finish],
  );

  useEffect(() => finish, [finish]);

  return { value, rolling, round, start };
}
