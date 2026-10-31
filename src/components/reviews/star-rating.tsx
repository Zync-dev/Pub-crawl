"use client";

import { Star } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { formatStars } from "@/lib/use-reviews";
import { Icon } from "../ds";

const STARS = [1, 2, 3, 4, 5];

function colors(filled: boolean, tone: "light" | "dark") {
  if (filled) return { stroke: "var(--gold-700)", fill: "var(--gold-500)" };
  return { stroke: tone === "dark" ? "var(--gold-300)" : "var(--border-strong)", fill: "transparent" };
}

// Fem stjerner som en radiogruppe: tryk for at give stjerner, piletasterne flytter valget.
export function StarRating({
  value,
  onChange,
  label = "Dine stjerner",
  size = 22,
  tone = "light",
}: {
  value: number | null;
  onChange: (stars: number) => void;
  label?: string;
  size?: number;
  tone?: "light" | "dark";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = value ?? 0;

  function onKeyDown(e: KeyboardEvent, n: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, n + step));
    refs.current[next - 1]?.focus();
    onChange(next);
  }

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex" onClick={(e) => e.stopPropagation()}>
      {STARS.map((n) => {
        const c = colors(n <= current, tone);
        return (
          <button
            key={n}
            ref={(el) => {
              refs.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={current === n}
            aria-label={n === 1 ? "1 stjerne" : `${n} stjerner`}
            tabIndex={current ? (current === n ? 0 : -1) : n === 1 ? 0 : -1}
            onClick={() => onChange(n)}
            onKeyDown={(e) => onKeyDown(e, n)}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] active:translate-y-px"
            style={{ background: "none", border: 0, padding: 0 }}
          >
            <Icon
              name={Star}
              size={size}
              color={c.stroke}
              style={{ fill: c.fill, transition: "fill var(--dur-fast) var(--ease), stroke var(--dur-fast) var(--ease)" }}
            />
          </button>
        );
      })}
    </div>
  );
}

// Kun til visning, fx gennemsnittet i Stillingen. Halve stjerner rundes.
export function StarsShown({ average, size = 16, tone = "light" }: { average: number; size?: number; tone?: "light" | "dark" }) {
  const full = Math.round(average);
  return (
    <span role="img" aria-label={`${formatStars(average)} af 5 stjerner`} className="inline-flex items-center gap-0.5">
      {STARS.map((n) => {
        const c = colors(n <= full, tone);
        return <Icon key={n} name={Star} size={size} color={c.stroke} style={{ fill: c.fill }} />;
      })}
    </span>
  );
}
