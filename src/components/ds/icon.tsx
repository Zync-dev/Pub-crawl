import {
  Apple,
  ArrowDown,
  ArrowUp,
  Beer,
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  Dices,
  Droplet,
  GlassWater,
  KeyRound,
  LocateFixed,
  LogOut,
  MapPin,
  Martini,
  Pencil,
  Plus,
  Route,
  Search,
  Share2,
  Stamp,
  Timer,
  Trash2,
  TreePine,
  TriangleAlert,
  Undo2,
  User,
  Users,
  Wine,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

// Designsystemet bruger Lucide med 2px streg. Her samles de ikoner, appen bruger.
const ICONS = {
  apple: Apple,
  "arrow-down": ArrowDown,
  "arrow-up": ArrowUp,
  beer: Beer,
  "chart-column": ChartColumn,
  check: Check,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  dices: Dices,
  droplet: Droplet,
  "glass-water": GlassWater,
  "key-round": KeyRound,
  "locate-fixed": LocateFixed,
  "log-out": LogOut,
  "map-pin": MapPin,
  martini: Martini,
  pencil: Pencil,
  plus: Plus,
  route: Route,
  search: Search,
  "share-2": Share2,
  stamp: Stamp,
  timer: Timer,
  "trash-2": Trash2,
  "tree-pine": TreePine,
  "alert-triangle": TriangleAlert,
  "undo-2": Undo2,
  user: User,
  users: Users,
  wine: Wine,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const Component = ICONS[name];
  return (
    <Component
      aria-hidden
      size={size}
      strokeWidth={2}
      color={color ?? "currentColor"}
      style={{ flex: "none", ...style }}
    />
  );
}
