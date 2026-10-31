"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { memberTone, TONE_STYLE } from "@/lib/colors";
import { DEFAULT_CENTER, formatAgo } from "@/lib/geo";
import type { Bounds } from "@/lib/places";
import type { LatLng, Member, NearbyPlace, Stop } from "@/lib/types";

export type { NearbyPlace };

export type MapViewProps = {
  stops: Stop[];
  members: Member[];
  userId: string;
  myPosition: LatLng | null;
  currentStopId: string | null;
  nearby: NearbyPlace[];
  adding: boolean;
  focus: { at: LatLng; seq: number } | null;
  now: number;
  onMapClick: (at: LatLng) => void;
  onPickNearby: (place: NearbyPlace) => void;
  onViewChange: (bounds: Bounds) => void;
  visible: boolean;
};

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Leaflet bytter markørens DOM ud, hver gang ikonet er et nyt objekt. Derfor genbruges de.
const iconCache = new Map<string, L.DivIcon>();
function cached(key: string, make: () => L.DivIcon) {
  let icon = iconCache.get(key);
  if (!icon) {
    icon = make();
    iconCache.set(key, icon);
  }
  return icon;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

type StopState = "current" | "visited" | "next" | "later";

function stopIcon(index: number, state: StopState) {
  return cached(`stop:${index}:${state}`, () => {
    // Samme cirkler som numrene i designsystemets StopCard.
    const styles = {
      current:
        "background:var(--gold-500);color:var(--green-900);border:2px solid var(--green-800);box-shadow:0 0 0 4px rgb(201 162 74 / .35)",
      next: "background:var(--green-800);color:var(--gold-300);border:2px solid var(--gold-500)",
      visited: "background:var(--cream-300);color:var(--slate-600);border:1.5px solid var(--border-strong)",
      later: "background:var(--cream-100);color:var(--green-800);border:1.5px solid var(--green-800)",
    }[state];
    const label = state === "visited" ? "&#10003;" : String(index + 1);
    return L.divIcon({
      className: "map-marker",
      html: `<div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:17px/1 var(--font-display);box-shadow:var(--shadow-card);${styles}">${label}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -14],
    });
  });
}

function memberIcon(member: Member, isMe: boolean) {
  return cached(`member:${member.color}:${isMe ? "" : member.name}`, () => {
    const tone = TONE_STYLE[memberTone(member.color)];
    const initial = escapeHtml(member.name.trim().charAt(0).toUpperCase() || "?");
    const name = escapeHtml(isMe ? "Dig" : member.name);
    return L.divIcon({
      className: "map-marker",
      html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">
        <div style="width:30px;height:30px;border-radius:50%;background:${tone.bg};color:${tone.fg};box-shadow:0 0 0 2px var(--cream-100),0 0 0 4px var(--gold-500);display:flex;align-items:center;justify-content:center;font:15px/1 var(--font-display)">${initial}</div>
        <div style="padding:2px 7px;border-radius:999px;background:var(--green-800);color:var(--cream-100);font:600 11px/1.3 var(--font-body);white-space:nowrap">${name}</div>
      </div>`,
      iconSize: [90, 52],
      iconAnchor: [45, 17],
      popupAnchor: [0, -16],
    });
  });
}

const nearbyIcon = () =>
  cached("nearby", () =>
    L.divIcon({
      className: "map-marker",
      html: `<div style="width:24px;height:24px;border-radius:50%;background:var(--oxblood-700);border:2px solid var(--cream-100);box-shadow:var(--shadow-card);display:flex;align-items:center;justify-content:center;color:var(--cream-100);font:700 14px/1 var(--font-body)">+</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
  );

const meIcon = () =>
  cached("me", () =>
    L.divIcon({
      className: "map-marker",
      html: `<div style="width:18px;height:18px;border-radius:50%;background:var(--green-800);border:3px solid var(--gold-500);box-shadow:0 0 0 6px rgb(201 162 74 / .3)"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    }),
  );

function toBounds(map: L.Map): Bounds {
  const b = map.getBounds();
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
}

// Leaflet styres direkte i stedet for via react-leaflet. Next bevarer sider i baggrunden med
// React <Activity>, som rydder effekter op og kører dem igen, og her skal kortet oprettes på
// ny hver gang. Det klarer react-leaflet ikke.
export default function MapView(props: MapViewProps) {
  const { stops, members, userId, myPosition, currentStopId, nearby, adding, focus, now, visible } = props;
  const container = useRef<HTMLDivElement>(null);
  const handlers = useRef(props);
  const [map, setMap] = useState<L.Map | null>(null);

  useEffect(() => {
    handlers.current = props;
  });

  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, {
      center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      zoom: 14,
      zoomControl: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(m);
    m.on("click", (e) => handlers.current.onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }));
    m.on("moveend", () => handlers.current.onViewChange(toBounds(m)));
    handlers.current.onViewChange(toBounds(m));
    // Kortet findes først, når DOM'en gør. Derfor sættes det her.
    setMap(m);
    return () => {
      m.remove();
      setMap(null);
    };
  }, []);

  // Kortet lå skjult, mens en anden fane var åben, og skal måles igen.
  useEffect(() => {
    if (map && visible) map.invalidateSize();
  }, [map, visible]);

  // Zoomer ind på ruten første gang, der er pubs på kortet.
  const framed = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!map || framed.current === map || stops.length === 0) return;
    framed.current = map;
    map.invalidateSize();
    if (stops.length === 1) map.setView([stops[0].lat, stops[0].lng], 16);
    else map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng])), { padding: [40, 40], maxZoom: 17 });
  }, [map, stops]);

  useEffect(() => {
    if (!map || !focus) return;
    const zoom = Math.max(map.getZoom(), 16);
    if (reducedMotion()) map.setView([focus.at.lat, focus.at.lng], zoom);
    else map.flyTo([focus.at.lat, focus.at.lng], zoom, { duration: 0.6 });
  }, [map, focus]);

  // Ruten: stregen og de nummererede pubs.
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    if (stops.length > 1) {
      L.polyline(
        stops.map((s) => [s.lat, s.lng]),
        { color: "#1F3B2D", weight: 4, opacity: 0.85, dashArray: "1 10", lineCap: "round", interactive: false },
      ).addTo(group);
    }
    const nextIndex = currentStopId ? -1 : stops.findIndex((s) => !s.visited_at);
    stops.forEach((stop, i) => {
      const state: StopState =
        stop.id === currentStopId ? "current" : i === nextIndex ? "next" : stop.visited_at ? "visited" : "later";
      L.marker([stop.lat, stop.lng], {
        icon: stopIcon(i, state),
        zIndexOffset: state === "current" ? 500 : 0,
        keyboard: false,
      })
        .bindPopup(`<strong>${i + 1}. ${escapeHtml(stop.name)}</strong><br>${stop.minutes} min.`)
        .addTo(group);
    });
    return () => {
      group.remove();
    };
  }, [map, stops, currentStopId]);

  // Pubs fundet med "Pubs her".
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    for (const place of nearby) {
      L.marker([place.lat, place.lng], { icon: nearbyIcon(), title: place.name })
        .on("click", () => handlers.current.onPickNearby(place))
        .addTo(group);
    }
    return () => {
      group.remove();
    };
  }, [map, nearby]);

  // Holdet og dig selv.
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    for (const m of members) {
      if (m.lat === null || m.lng === null || !m.located_at) continue;
      // Positioner, der er over to timer gamle, siger ikke længere noget.
      if (now - new Date(m.located_at).getTime() > 2 * 3_600_000) continue;
      if (m.user_id === userId && myPosition) continue;
      L.marker([m.lat, m.lng], { icon: memberIcon(m, m.user_id === userId), zIndexOffset: 1000 })
        .bindPopup(`<strong>${escapeHtml(m.name)}</strong><br>${formatAgo(m.located_at, now)}`)
        .addTo(group);
    }
    if (myPosition) {
      L.marker([myPosition.lat, myPosition.lng], { icon: meIcon(), zIndexOffset: 1100, interactive: false }).addTo(group);
    }
    return () => {
      group.remove();
    };
  }, [map, members, userId, myPosition, now]);

  // Leaflet sætter selv klasser på sin container, så den skifter aldrig className.
  return (
    <div className={`h-full w-full ${adding ? "map-adding" : ""}`}>
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
