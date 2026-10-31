import type { Crawl, Drink, DrinkKind, Member, Stop } from "./types";

// Små byggeklodser til enhedstestene. Bruges ikke af appen.
export function member(user_id: string, name: string): Member {
  return {
    crawl_id: "c1",
    user_id,
    name,
    color: 0,
    lat: null,
    lng: null,
    accuracy: null,
    located_at: null,
    joined_at: "2026-11-06T18:00:00.000Z",
  };
}

export function stop(id: string, position: number, minutes = 30): Stop {
  return {
    id,
    crawl_id: "c1",
    name: `Pub ${id}`,
    lat: 55.67,
    lng: 12.56,
    position,
    minutes,
    visited_at: null,
    created_at: "2026-11-06T18:00:00.000Z",
  };
}

let n = 0;
export function drink(
  user_id: string,
  kind: DrinkKind,
  units: number,
  created_at: string,
  stop_id: string | null = null,
): Drink {
  n += 1;
  return { id: `d${n}`, crawl_id: "c1", user_id, stop_id, kind, units, created_at };
}

export function crawl(patch: Partial<Crawl> = {}): Crawl {
  return {
    id: "c1",
    code: "ABC123",
    name: "J-dag 2026",
    created_by: "u1",
    current_stop_id: null,
    arrived_at: null,
    challenge: null,
    created_at: "2026-11-06T18:00:00.000Z",
    ...patch,
  };
}

// localStorage i hukommelsen, så name.ts og recent.ts kan testes i Node.
export function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    map,
  };
}
