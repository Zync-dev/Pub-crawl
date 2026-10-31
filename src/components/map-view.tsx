"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { memberColor } from "@/lib/colors";
import { DEFAULT_CENTER, formatAgo } from "@/lib/geo";
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
  onCenterChange: (at: LatLng) => void;
};

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function stopIcon(index: number, state: "current" | "visited" | "next" | "later") {
  const styles = {
    current: "background:#f5b83d;color:#241a03;box-shadow:0 0 0 6px rgb(245 184 61 / .3)",
    next: "background:#f4f1ea;color:#0b1020",
    visited: "background:#2a3354;color:#9aa3c0",
    later: "background:#1d2540;color:#f4f1ea;border:2px solid #f4f1ea",
  }[state];
  return L.divIcon({
    className: "pc-marker",
    html: `<div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:600 14px var(--font-sans);${styles}">${index + 1}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function memberIcon(member: Member, isMe: boolean) {
  const color = memberColor(member.color);
  const initial = escapeHtml(member.name.trim().charAt(0).toUpperCase() || "?");
  const name = escapeHtml(isMe ? "Dig" : member.name);
  return L.divIcon({
    className: "pc-marker",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="width:28px;height:28px;border-radius:50%;background:${color};color:#0b1020;border:3px solid #0b1020;display:flex;align-items:center;justify-content:center;font:700 13px var(--font-sans)">${initial}</div>
      <div style="padding:1px 6px;border-radius:8px;background:rgb(11 16 32 / .85);color:#f4f1ea;font:500 11px var(--font-sans);white-space:nowrap">${name}</div>
    </div>`,
    iconSize: [80, 48],
    iconAnchor: [40, 16],
  });
}

const nearbyIcon = L.divIcon({
  className: "pc-marker",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:rgb(94 200 242 / .9);border:2px solid #0b1020;display:flex;align-items:center;justify-content:center;font-size:11px">🍺</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const meIcon = L.divIcon({
  className: "pc-marker",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#5ec8f2;border:3px solid #f4f1ea;box-shadow:0 0 0 6px rgb(94 200 242 / .3)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function Events({
  onMapClick,
  onCenterChange,
}: Pick<MapViewProps, "onMapClick" | "onCenterChange">) {
  useMapEvents({
    click: (e) => onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }),
    moveend: (e) => {
      const c = e.target.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    },
  });
  return null;
}

// Zoomer ind på ruten første gang, der er pubs, og når noget beder om fokus.
function Framing({ stops, focus }: Pick<MapViewProps, "stops" | "focus">) {
  const map = useMap();
  const framed = useRef(false);

  useEffect(() => {
    if (framed.current || stops.length === 0) return;
    framed.current = true;
    if (stops.length === 1) map.setView([stops[0].lat, stops[0].lng], 16);
    else
      map.fitBounds(
        L.latLngBounds(stops.map((s) => [s.lat, s.lng])),
        { padding: [40, 40], maxZoom: 17 },
      );
  }, [map, stops]);

  useEffect(() => {
    if (focus) map.setView([focus.at.lat, focus.at.lng], Math.max(map.getZoom(), 16));
  }, [map, focus]);

  return null;
}

export default function MapView(props: MapViewProps) {
  const { stops, members, userId, myPosition, currentStopId, nearby, adding, now } = props;

  const nextIndex = useMemo(() => {
    if (currentStopId) return -1;
    return stops.findIndex((s) => !s.visited_at);
  }, [stops, currentStopId]);

  const located = members.filter(
    (m) =>
      m.lat !== null &&
      m.lng !== null &&
      m.located_at &&
      // Positioner, der er over to timer gamle, siger ikke længere noget.
      now - new Date(m.located_at).getTime() < 2 * 3_600_000 &&
      !(m.user_id === userId && myPosition),
  );

  return (
    <MapContainer
      center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
      zoom={14}
      className={`h-full w-full ${adding ? "cursor-crosshair" : ""}`}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={19}
      />
      <Events onMapClick={props.onMapClick} onCenterChange={props.onCenterChange} />
      <Framing stops={stops} focus={props.focus} />

      {stops.length > 1 && (
        <Polyline
          positions={stops.map((s) => [s.lat, s.lng])}
          pathOptions={{ color: "#f5b83d", weight: 4, opacity: 0.8, dashArray: "2 10", lineCap: "round" }}
        />
      )}

      {stops.map((stop, i) => (
        <Marker
          key={stop.id}
          position={[stop.lat, stop.lng]}
          icon={stopIcon(
            i,
            stop.id === currentStopId
              ? "current"
              : i === nextIndex
                ? "next"
                : stop.visited_at
                  ? "visited"
                  : "later",
          )}
          zIndexOffset={stop.id === currentStopId ? 500 : 0}
        >
          <Popup>
            <strong>
              {i + 1}. {stop.name}
            </strong>
            <br />
            {stop.minutes} min.
          </Popup>
        </Marker>
      ))}

      {nearby.map((place) => (
        <Marker
          key={place.id}
          position={[place.lat, place.lng]}
          icon={nearbyIcon}
          eventHandlers={{ click: () => props.onPickNearby(place) }}
        />
      ))}

      {located.map((m) => (
        <Marker
          key={m.user_id}
          position={[m.lat!, m.lng!]}
          icon={memberIcon(m, m.user_id === userId)}
          zIndexOffset={1000}
        >
          <Popup>
            <strong>{m.name}</strong>
            <br />
            {formatAgo(m.located_at!, now)}
          </Popup>
        </Marker>
      ))}

      {myPosition && (
        <Marker position={[myPosition.lat, myPosition.lng]} icon={meIcon} zIndexOffset={1100} />
      )}
    </MapContainer>
  );
}
