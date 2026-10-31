import type { LatLng } from "./types";

export type MapsPlatform = "ios" | "other";

// iPhone og iPod siger det selv. En iPad med iPadOS udgiver sig for at være en Mac, men har touch.
export function detectMapsPlatform(userAgent: string, maxTouchPoints = 0): MapsPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return "other";
}

const coord = (n: number) => n.toFixed(6);

// Gåruten til en pub: Apple Kort på iOS, Google Maps alle andre steder.
export function walkingDirectionsUrl(to: LatLng, platform: MapsPlatform) {
  const at = `${coord(to.lat)},${coord(to.lng)}`;
  if (platform === "ios") return `https://maps.apple.com/?daddr=${at}&dirflg=w`;
  return `https://www.google.com/maps/dir/?api=1&destination=${at}&travelmode=walking`;
}
