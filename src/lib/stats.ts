import { DRINK_BY_KIND } from "./drinks";
import type { Drink, DrinkKind, Member, Stop } from "./types";

// Genstande med én decimal. Uden afrunding afgør en float-fejl (1,2 + 1,2 + 1,2 + 1), hvem der fører.
export const roundUnits = (units: number) => Math.round(units * 10) / 10;

// Stillingen: flest genstande, så flest drinks, så navnet. Bruges også af regnskabet.
export function compareStanding(
  a: { member: Member; units: number; drinks: number },
  b: { member: Member; units: number; drinks: number },
) {
  return b.units - a.units || b.drinks - a.drinks || a.member.name.localeCompare(b.member.name, "da");
}

// "1 drink", "2 drinks", "3 shots", "2 glas vin", "4 øl".
const KIND_COUNT: Partial<Record<DrinkKind, [string, string]>> = {
  wine: ["glas vin", "glas vin"],
  drink: ["drink", "drinks"],
  shot: ["shot", "shots"],
  water: ["glas vand", "glas vand"],
};

export function formatKindCount(kind: DrinkKind, n: number) {
  const label = DRINK_BY_KIND[kind].label.toLowerCase();
  const [one, many] = KIND_COUNT[kind] ?? [label, label];
  return `${n} ${n === 1 ? one : many}`;
}

export function formatDrinkCount(n: number) {
  return formatKindCount("drink", n);
}

export type MemberStats = {
  member: Member;
  units: number;
  count: number;
  water: number;
  byKind: Partial<Record<DrinkKind, number>>;
  lastAt: string | null;
  perHour: number | null;
};

export function memberStats(members: Member[], drinks: Drink[], now: number) {
  const stats: MemberStats[] = members.map((member) => {
    const mine = drinks.filter((d) => d.user_id === member.user_id);
    const byKind: Partial<Record<DrinkKind, number>> = {};
    let units = 0;
    for (const d of mine) {
      byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
      units += Number(d.units);
    }
    const alcoholic = mine.filter((d) => d.kind !== "water");
    const first = alcoholic.length
      ? Math.min(...alcoholic.map((d) => new Date(d.created_at).getTime()))
      : null;
    const hours = first ? (now - first) / 3_600_000 : 0;
    units = roundUnits(units);
    return {
      member,
      units,
      count: alcoholic.length,
      water: byKind.water ?? 0,
      byKind,
      lastAt: mine.length ? mine[mine.length - 1].created_at : null,
      perHour: first && hours >= 0.5 ? units / hours : null,
    };
  });
  return stats.sort((a, b) => compareStanding({ ...a, drinks: a.count }, { ...b, drinks: b.count }));
}

export function kindTotals(drinks: Drink[]) {
  const totals: Partial<Record<DrinkKind, number>> = {};
  for (const d of drinks) totals[d.kind] = (totals[d.kind] ?? 0) + 1;
  return totals;
}

export function stopTotals(stops: Stop[], drinks: Drink[]) {
  return stops.map((stop) => {
    const here = drinks.filter((d) => d.stop_id === stop.id);
    return {
      stop,
      count: here.filter((d) => d.kind !== "water").length,
      units: here.reduce((sum, d) => sum + Number(d.units), 0),
    };
  });
}
