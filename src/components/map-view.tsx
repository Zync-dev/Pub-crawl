"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { memberTone, TONE_STYLE } from "@/lib/colors";
import { DEFAULT_CENTER, formatAgo } from "@/lib/geo";
import { placeMembers, staleLabel } from "@/lib/map-markers";
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
  // Falsk på den offentlige side: et fast overblik, så en finger på kortet ruller siden.
  interactive?: boolean;
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

// Lucides check og plus som SVG, fordi markørerne er ren HTML og ikke React.
function lucide(paths: string, size: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const PLUS = '<path d="M5 12h14"/><path d="M12 5v14"/>';

const GOLD_GLOW = (alpha: number) => `color-mix(in srgb, var(--gold-500) ${alpha}%, transparent)`;

type StopState = "current" | "visited" | "next" | "later";

function stopIcon(index: number, state: StopState, here: number) {
  return cached(`stop:${index}:${state}:${here}`, () => {
    // Samme cirkler som numrene i designsystemets StopCard.
    const styles = {
      current: `background:var(--gold-500);color:var(--green-900);border:2px solid var(--green-800);box-shadow:0 0 0 4px ${GOLD_GLOW(35)}`,
      next: "background:var(--green-800);color:var(--gold-300);border:2px solid var(--gold-500)",
      visited: "background:var(--cream-300);color:var(--slate-600);border:1.5px solid var(--border-strong)",
      later: "background:var(--cream-100);color:var(--green-800);border:1.5px solid var(--green-800)",
    }[state];
    const label = state === "visited" ? lucide(CHECK, 18) : String(index + 1);
    // Holdet ved pubben står som ét tal på markøren i stedet for en bunke navneskilte.
    const crowd = here
      ? `<div style="position:absolute;left:22px;top:-11px;padding:2px 7px;border-radius:999px;background:var(--green-800);color:var(--cream-100);box-shadow:0 0 0 1.5px var(--gold-500);font:600 11px/1.3 var(--font-body);white-space:nowrap">${here} her</div>`
      : "";
    return L.divIcon({
      className: "map-marker",
      html: `<div style="position:relative;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:17px/1 var(--font-display);box-shadow:var(--shadow-card);${styles}">${label}${crowd}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -14],
    });
  });
}

function memberIcon(member: Member, isMe: boolean, age: string | null) {
  const initial = escapeHtml(member.name.trim().charAt(0).toUpperCase() || "?");
  return cached(`member:${member.color}:${isMe ? `me:${initial}` : member.name}:${age ?? ""}`, () => {
    const tone = TONE_STYLE[memberTone(member.color)];
    const name = escapeHtml(isMe ? "Dig" : member.name) + (age ? ` · ${age}` : "");
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

// Prikken er 24px, men trykfladen er 44px, så den kan rammes med en tommelfinger.
const nearbyIcon = () =>
  cached("nearby", () =>
    L.divIcon({
      className: "map-marker",
      html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center"><div style="width:24px;height:24px;border-radius:50%;background:var(--oxblood-700);border:2px solid var(--cream-100);box-shadow:var(--shadow-card);display:flex;align-items:center;justify-content:center;color:var(--cream-100)">${lucide(PLUS, 14)}</div></div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    }),
  );

const meIcon = () =>
  cached("me", () =>
    L.divIcon({
      className: "map-marker",
      html: `<div style="width:18px;height:18px;border-radius:50%;background:var(--green-800);border:3px solid var(--gold-500);box-shadow:0 0 0 6px ${GOLD_GLOW(30)}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    }),
  );

function toBounds(map: L.Map): Bounds {
  const b = map.getBounds();
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
}

type MarkerSpec = {
  key: string;
  at: LatLng;
  icon: L.DivIcon;
  zIndexOffset?: number;
  opacity?: number;
  popup?: string;
  onClick?: () => void;
  options?: L.MarkerOptions;
};

// Markørerne opdateres på stedet i stedet for at blive bygget om. Leaflet lukker en åben popup,
// når dens markør fjernes, og GPS'en og Realtime giver nye data hvert sekund.
class MarkerSet {
  private group: L.LayerGroup;
  private markers = new Map<string, L.Marker>();
  private clicks = new Map<string, () => void>();

  constructor(map: L.Map) {
    this.group = L.layerGroup().addTo(map);
  }

  sync(specs: MarkerSpec[]) {
    const seen = new Set<string>();
    for (const spec of specs) {
      seen.add(spec.key);
      const z = spec.zIndexOffset ?? 0;
      const opacity = spec.opacity ?? 1;
      if (spec.onClick) this.clicks.set(spec.key, spec.onClick);
      let marker = this.markers.get(spec.key);
      if (!marker) {
        marker = L.marker([spec.at.lat, spec.at.lng], { ...spec.options, icon: spec.icon, zIndexOffset: z, opacity });
        if (spec.popup) marker.bindPopup(spec.popup);
        if (spec.onClick) marker.on("click", () => this.clicks.get(spec.key)?.());
        marker.addTo(this.group);
        this.markers.set(spec.key, marker);
        continue;
      }
      const ll = marker.getLatLng();
      if (ll.lat !== spec.at.lat || ll.lng !== spec.at.lng) marker.setLatLng([spec.at.lat, spec.at.lng]);
      if (marker.options.icon !== spec.icon) marker.setIcon(spec.icon);
      if (marker.options.zIndexOffset !== z) marker.setZIndexOffset(z);
      if (marker.options.opacity !== opacity) marker.setOpacity(opacity);
      if (spec.popup && marker.getPopup()?.getContent() !== spec.popup) marker.setPopupContent(spec.popup);
    }
    for (const [key, marker] of this.markers) {
      if (seen.has(key)) continue;
      marker.remove();
      this.markers.delete(key);
      this.clicks.delete(key);
    }
  }
}

type Layers = { line: L.Polyline; stops: MarkerSet; nearby: MarkerSet; members: MarkerSet };

// Leaflet styres direkte i stedet for via react-leaflet. Next bevarer sider i baggrunden med
// React <Activity>, som rydder effekter op og kører dem igen, og her skal kortet oprettes på
// ny hver gang. Det klarer react-leaflet ikke.
export default function MapView(props: MapViewProps) {
  const { stops, members, userId, myPosition, currentStopId, nearby, adding, focus, now, visible } = props;
  const interactive = props.interactive ?? true;
  const container = useRef<HTMLDivElement>(null);
  const handlers = useRef(props);
  const [ctx, setCtx] = useState<{ map: L.Map; layers: Layers } | null>(null);
  const map = ctx?.map ?? null;

  useEffect(() => {
    handlers.current = props;
  });

  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, {
      center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      zoom: 14,
      zoomControl: false,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(m);
    m.on("click", (e) => handlers.current.onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }));
    m.on("moveend", () => handlers.current.onViewChange(toBounds(m)));
    handlers.current.onViewChange(toBounds(m));
    const layers: Layers = {
      // Farven kommer fra .pc-route-line i globals.css, så den følger --green-800.
      line: L.polyline([], { className: "pc-route-line", weight: 4, opacity: 0.85, dashArray: "1 10", lineCap: "round", interactive: false }).addTo(m),
      stops: new MarkerSet(m),
      nearby: new MarkerSet(m),
      members: new MarkerSet(m),
    };
    // Kortet findes først, når DOM'en gør. Derfor sættes det her.
    setCtx({ map: m, layers });
    return () => {
      m.remove();
      setCtx(null);
    };
  }, [interactive]);

  // Kortet lå skjult, mens en anden fane var åben, og skal måles igen.
  useEffect(() => {
    if (map && visible) map.invalidateSize();
  }, [map, visible]);

  // Zoomer ind på ruten første gang, der er pubs på et synligt kort. Et skjult kort er 0x0
  // og ville ende helt inde på midten af ruten. Polstringen holder pubberne fri af knapperne.
  const framed = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!map || !visible || framed.current === map || stops.length === 0) return;
    framed.current = map;
    map.invalidateSize();
    if (stops.length === 1) map.setView([stops[0].lat, stops[0].lng], 16);
    else
      map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng])), {
        paddingTopLeft: [24, 56],
        paddingBottomRight: [24, 72],
        maxZoom: 17,
      });
  }, [map, stops, visible]);

  // Flyver kun hen til et nyt fokus og kun på et synligt kort. Et kort, der oprettes igen,
  // skal ikke flyve til det gamle fokus, og flyTo på et 0x0-kort kaster "Invalid LatLng".
  const applied = useRef<number | null>(null);
  useEffect(() => {
    if (!map || !focus || !visible || applied.current === focus.seq) return;
    applied.current = focus.seq;
    const zoom = Math.max(map.getZoom(), 16);
    if (reducedMotion() || map.getSize().x === 0) map.setView([focus.at.lat, focus.at.lng], zoom);
    else map.flyTo([focus.at.lat, focus.at.lng], zoom, { duration: 0.6 });
  }, [map, focus, visible]);

  const currentStop = stops.find((s) => s.id === currentStopId) ?? null;
  const placed = useMemo(
    () => placeMembers(members, { userId, myPosition, now, currentStop }),
    [members, userId, myPosition, now, currentStop],
  );

  // Ruten: stregen og de nummererede pubs.
  useEffect(() => {
    if (!ctx) return;
    ctx.layers.line.setLatLngs(stops.length > 1 ? stops.map((s) => [s.lat, s.lng]) : []);
    const nextIndex = currentStopId ? -1 : stops.findIndex((s) => !s.visited_at);
    const hereNames = placed.here.map((p) => escapeHtml(p.isMe ? "Dig" : p.member.name)).join(", ");
    ctx.layers.stops.sync(
      stops.map((stop, i) => {
        const state: StopState =
          stop.id === currentStopId ? "current" : i === nextIndex ? "next" : stop.visited_at ? "visited" : "later";
        const here = state === "current" ? placed.here.length : 0;
        return {
          key: stop.id,
          at: stop,
          icon: stopIcon(i, state, here),
          // Den nuværende pub ligger over holdets nåle.
          zIndexOffset: state === "current" ? 1050 : 0,
          popup:
            `<strong>${i + 1}. ${escapeHtml(stop.name)}</strong><br>${stop.minutes} min. ${state === "current" ? "her" : "der"}` +
            (here ? `<br>Her nu: ${hereNames}` : ""),
          options: { keyboard: false },
        };
      }),
    );
  }, [ctx, stops, currentStopId, placed]);

  // Pubs fundet med "Pubs her".
  useEffect(() => {
    if (!ctx) return;
    ctx.layers.nearby.sync(
      nearby.map((place) => ({
        key: place.id,
        at: place,
        icon: nearbyIcon(),
        onClick: () => handlers.current.onPickNearby(place),
        options: { title: place.name },
      })),
    );
  }, [ctx, nearby]);

  // Holdet og dig selv.
  useEffect(() => {
    if (!ctx) return;
    const specs: MarkerSpec[] = placed.away.map(({ member, at, isMe, ageMs, stale }) => ({
      key: `member:${member.user_id}`,
      at,
      icon: memberIcon(member, isMe, stale ? staleLabel(ageMs) : null),
      zIndexOffset: 1000,
      // En gammel position må ikke ligne en frisk.
      opacity: stale ? 0.5 : 1,
      popup: `<strong>${escapeHtml(member.name)}</strong><br>${member.located_at ? formatAgo(member.located_at, now) : ""}`,
    }));
    if (myPosition) {
      specs.push({ key: "me", at: myPosition, icon: meIcon(), zIndexOffset: 1100, options: { interactive: false } });
    }
    ctx.layers.members.sync(specs);
  }, [ctx, placed, myPosition, now]);

  // Leaflet sætter selv klasser på sin container, så den skifter aldrig className.
  return (
    <div className={`h-full w-full ${adding ? "map-adding" : ""}`}>
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
