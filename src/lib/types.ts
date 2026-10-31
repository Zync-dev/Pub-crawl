export type Crawl = {
  id: string;
  code: string;
  name: string;
  created_by: string;
  current_stop_id: string | null;
  arrived_at: string | null;
  challenge: string | null;
  // games: rækken i challenges for udfordringen ovenfor (migration 0006_games.sql).
  current_challenge_id?: string | null;
  created_at: string;
};

export type Member = {
  crawl_id: string;
  user_id: string;
  name: string;
  color: number;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  located_at: string | null;
  joined_at: string;
};

export type Stop = {
  id: string;
  crawl_id: string;
  name: string;
  lat: number;
  lng: number;
  position: number;
  minutes: number;
  visited_at: string | null;
  created_at: string;
};

export type DrinkKind =
  | "beer"
  | "draft"
  | "jbeer"
  | "cider"
  | "wine"
  | "drink"
  | "shot"
  | "water";

export type Drink = {
  id: string;
  crawl_id: string;
  user_id: string;
  stop_id: string | null;
  kind: DrinkKind;
  units: number;
  created_at: string;
};

export type LatLng = { lat: number; lng: number };

export type NearbyPlace = { id: string; name: string; lat: number; lng: number; kind: string };
