"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Kort rul gennem tilfældige værdier og så det rigtige resultat. Kun én gang, ingen løkke.
// Hvis fanen lukkes midt i rullet, gøres det færdigt med det samme, så resultatet stadig sendes.
export function useRoll<T>(duration = 600, step = 90) {
  const [value, setValue] = useState<T | null>(null);
  const [rolling, setRolling] = useState(false);
  const pending = useRef<{ final: T; done: (v: T) => void } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    setValue(p.final);
    setRolling(false);
    p.done(p.final);
  }, []);

  const start = useCallback(
    (final: T, frame: () => T, done: (v: T) => void) => {
      finish();
      pending.current = { final, done };
      if (prefersReducedMotion()) return finish();
      setRolling(true);
      setValue(frame());
      const id = setInterval(() => setValue(frame()), step);
      // clearTimeout rydder også intervallet.
      timers.current = [id, setTimeout(finish, duration)];
    },
    [duration, step, finish],
  );

  // Lukkes fanen, sendes resultatet alligevel.
  const flush = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const p = pending.current;
    pending.current = null;
    if (p) p.done(p.final);
  }, []);
  useEffect(() => flush, [flush]);

  return { value, rolling, start };
}
