import type { LatLng } from "./types";

export function distanceMeters(a: LatLng, b: LatLng) {
  const r = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} km`;
}

// Ca. 5 km/t, når man går i flok.
export function walkingMinutes(meters: number) {
  return Math.max(1, Math.round(meters / 80));
}

export function formatAgo(iso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "lige nu";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min. siden`;
  return `${Math.round(minutes / 60)} t. siden`;
}

// København, Rådhuspladsen.
export const DEFAULT_CENTER: LatLng = { lat: 55.6761, lng: 12.5683 };
