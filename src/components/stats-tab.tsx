"use client";

import { memberColor } from "@/lib/colors";
import { DRINK_BY_KIND, DRINK_KINDS, formatUnits } from "@/lib/drinks";
import { kindTotals, memberStats, stopTotals } from "@/lib/stats";
import type { Drink, DrinkKind, Member, Stop } from "@/lib/types";
import { Avatar } from "./ui";

export function StatsTab({
  members,
  drinks,
  stops,
  userId,
  now,
}: {
  members: Member[];
  drinks: Drink[];
  stops: Stop[];
  userId: string;
  now: number;
}) {
  const people = memberStats(members, drinks, now);
  const totals = kindTotals(drinks);
  const perStop = stopTotals(stops, drinks).filter((s) => s.count > 0);
  const groupUnits = people.reduce((sum, p) => sum + p.units, 0);
  const top = Math.max(1, ...people.map((p) => p.units));
  const topKind = Math.max(1, ...Object.values(totals).map((n) => n ?? 0));
  const topStop = Math.max(1, ...perStop.map((s) => s.count));

  if (!drinks.length) {
    return (
      <div className="p-6 text-center text-muted">
        Ingen har skrevet noget ind endnu. Når I begynder, kommer stillingen her.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <section>
        <h2 className="mb-1 font-semibold">Stillingen</h2>
        <p className="mb-3 text-sm text-muted">
          {formatUnits(groupUnits)} genstande i alt for holdet
        </p>
        <ol className="flex flex-col gap-2">
          {people.map((p, i) => (
            <li
              key={p.member.user_id}
              className={`rounded-2xl border bg-surface p-3 ${p.member.user_id === userId ? "border-gold/60" : "border-line"}`}
            >
              <div className="flex items-center gap-3">
                <span className="w-5 text-center text-sm text-muted">{i + 1}</span>
                <Avatar name={p.member.name} color={memberColor(p.member.color)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {p.member.name}
                    {p.member.user_id === userId && <span className="text-muted"> (dig)</span>}
                  </span>
                  <span className="block text-xs text-muted">
                    {p.count} drinks · {p.water} vand
                    {p.perHour !== null && ` · ${formatUnits(p.perHour)} gst./time`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-xl font-bold tabular-nums">{formatUnits(p.units)}</span>
                  <span className="block text-[11px] text-muted">gst.</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(p.units / top) * 100}%`, background: memberColor(p.member.color) }}
                />
              </div>
              {Object.keys(p.byKind).length > 0 && (
                <p className="mt-2 text-sm">
                  {DRINK_KINDS.filter((d) => p.byKind[d.kind]).map((d) => (
                    <span key={d.kind} className="mr-3 whitespace-nowrap">
                      {d.emoji} {p.byKind[d.kind]}
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Hvad drikker vi?</h2>
        <ul className="flex flex-col gap-2">
          {(Object.entries(totals) as [DrinkKind, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([kind, count]) => (
              <li key={kind} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm">
                  {DRINK_BY_KIND[kind].emoji} {DRINK_BY_KIND[kind].label}
                </span>
                <span className="h-6 flex-1 overflow-hidden rounded-lg bg-raised">
                  <span
                    className="block h-full rounded-lg bg-gold/80"
                    style={{ width: `${(count / topKind) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right tabular-nums">{count}</span>
              </li>
            ))}
        </ul>
      </section>

      {perStop.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Pr. pub</h2>
          <ul className="flex flex-col gap-2">
            {perStop.map(({ stop, count, units }) => (
              <li key={stop.id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm">{stop.name}</span>
                <span className="h-6 flex-1 overflow-hidden rounded-lg bg-raised">
                  <span
                    className="block h-full rounded-lg bg-sky/70"
                    style={{ width: `${(count / topStop) * 100}%` }}
                  />
                </span>
                <span className="w-16 text-right text-sm tabular-nums">
                  {count} / {formatUnits(units)} gst.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
