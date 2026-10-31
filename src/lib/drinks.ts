import type { IconName } from "@/components/ds";
import type { DrinkKind } from "./types";

// En genstand er 12 g alkohol. Tallene er tommelfingerregler.
export const DRINK_KINDS: {
  kind: DrinkKind;
  label: string;
  detail: string;
  icon: IconName;
  units: number;
}[] = [
  { kind: "jbeer", label: "Julebryg", detail: "33 cl", icon: "tree-pine", units: 1.2 },
  { kind: "beer", label: "Øl", detail: "33 cl", icon: "beer", units: 1 },
  { kind: "draft", label: "Fadøl", detail: "50 cl", icon: "beer", units: 1.5 },
  { kind: "cider", label: "Cider", detail: "33 cl", icon: "apple", units: 1 },
  { kind: "wine", label: "Vin", detail: "glas", icon: "wine", units: 1 },
  { kind: "drink", label: "Cocktail", detail: "blandet", icon: "martini", units: 1.5 },
  // 4 cl spiritus på 40 % er ca. 12 g alkohol, altså én genstand.
  { kind: "shot", label: "Shot", detail: "4 cl", icon: "glass-water", units: 1 },
  { kind: "water", label: "Vand", detail: "tæller ikke", icon: "droplet", units: 0 },
];

export const DRINK_BY_KIND = Object.fromEntries(
  DRINK_KINDS.map((d) => [d.kind, d]),
) as Record<DrinkKind, (typeof DRINK_KINDS)[number]>;

export function formatUnits(units: number) {
  return units.toLocaleString("da-DK", { maximumFractionDigits: 1 });
}

// "1 genstand", "1,5 genstande".
export function formatGenstande(units: number) {
  return `${formatUnits(units)} ${formatUnits(units) === "1" ? "genstand" : "genstande"}`;
}
