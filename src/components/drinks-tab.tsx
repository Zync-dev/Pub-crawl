"use client";

import { useState } from "react";
import { DRINK_BY_KIND, DRINK_KINDS, formatUnits } from "@/lib/drinks";
import { formatAgo } from "@/lib/geo";
import type { Drink, DrinkKind, Stop } from "@/lib/types";
import type { CrawlActions } from "./crawl-app";
import { Button } from "./ui";

export function DrinksTab({
  drinks,
  stops,
  userId,
  currentStop,
  now,
  actions,
}: {
  drinks: Drink[];
  stops: Stop[];
  userId: string;
  currentStop: Stop | null;
  now: number;
  actions: CrawlActions;
}) {
  const [flash, setFlash] = useState<DrinkKind | null>(null);
  const mine = drinks.filter((d) => d.user_id === userId);
  const units = mine.reduce((sum, d) => sum + Number(d.units), 0);
  const water = mine.filter((d) => d.kind === "water").length;
  const alcoholic = mine.length - water;
  const stopName = (id: string | null) => stops.find((s) => s.id === id)?.name;

  async function add(kind: DrinkKind) {
    setFlash(kind);
    try {
      navigator.vibrate?.(30);
    } catch {}
    setTimeout(() => setFlash((f) => (f === kind ? null : f)), 600);
    await actions.addDrink(kind);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat value={formatUnits(units)} label="genstande" />
        <Stat value={String(alcoholic)} label="drinks" />
        <Stat value={String(water)} label="vand" />
      </div>

      <section>
        <h2 className="mb-1 font-semibold">Hvad har du fået?</h2>
        <p className="mb-3 text-sm text-muted">
          {currentStop ? `Bliver skrevet på ${currentStop.name}.` : "I er ikke ved en pub lige nu."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DRINK_KINDS.map((d) => (
            <button
              key={d.kind}
              onClick={() => void add(d.kind)}
              className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 text-left transition active:scale-[0.97] ${
                flash === d.kind ? "border-gold bg-gold/20" : "border-line bg-surface"
              }`}
            >
              <span className="text-3xl" aria-hidden>
                {d.emoji}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{d.label}</span>
                <span className="block text-xs text-muted">
                  {d.detail}
                  {d.units > 0 && ` · ${formatUnits(d.units)} gst.`}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Dine seneste</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {mine
              .slice()
              .reverse()
              .slice(0, 12)
              .map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="text-xl" aria-hidden>
                    {DRINK_BY_KIND[d.kind].emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">{DRINK_BY_KIND[d.kind].label}</span>
                    <span className="block truncate text-xs text-muted">
                      {formatAgo(d.created_at, now)}
                      {stopName(d.stop_id) && ` · ${stopName(d.stop_id)}`}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    className="min-h-9 px-2 text-sm"
                    onClick={() => void actions.deleteDrink(d)}
                    aria-label={`Fortryd ${DRINK_BY_KIND[d.kind].label}`}
                  >
                    Fortryd
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {alcoholic >= 3 && water * 3 < alcoholic && (
        <p className="rounded-xl bg-sky/10 px-3 py-2 text-sm text-sky">
          💧 Husk et glas vand ind imellem. Aftenen er lang.
        </p>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface py-3">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
