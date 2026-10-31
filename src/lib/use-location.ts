"use client";

import { useEffect, useRef, useState } from "react";
import { distanceMeters } from "./geo";
import { getSupabase } from "./supabase";
import type { LatLng } from "./types";

const MIN_INTERVAL_MS = 20_000;
const MIN_MOVE_M = 25;

function storageKey(crawlId: string) {
  return `pubcrawl.share.${crawlId}`;
}

// Deler positionen med turen, så længe appen er åben. Gemmer valget på enheden.
export function useLocationSharing(crawlId: string, userId: string) {
  const [sharing, setSharingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<LatLng | null>(null);
  const lastSent = useRef<{ at: number; pos: LatLng } | null>(null);

  useEffect(() => {
    try {
      // Valget gemmes i browseren og kan først læses efter første render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(storageKey(crawlId)) === "1") setSharingState(true);
    } catch {}
  }, [crawlId]);

  useEffect(() => {
    if (!sharing) return;
    if (!("geolocation" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Din browser kan ikke dele position.");
      return;
    }
    const supabase = getSupabase();
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(here);
        setError(null);
        const last = lastSent.current;
        const now = Date.now();
        if (
          last &&
          now - last.at < MIN_INTERVAL_MS &&
          distanceMeters(last.pos, here) < MIN_MOVE_M
        ) {
          return;
        }
        lastSent.current = { at: now, pos: here };
        void supabase
          .from("members")
          .update({
            lat: here.lat,
            lng: here.lng,
            accuracy: Math.round(pos.coords.accuracy),
            located_at: new Date().toISOString(),
          })
          .eq("crawl_id", crawlId)
          .eq("user_id", userId);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Du har ikke givet adgang til din position. Slå det til i browserens indstillinger."
            : "Kunne ikke finde din position lige nu.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [sharing, crawlId, userId]);

  async function setSharing(on: boolean) {
    setSharingState(on);
    try {
      localStorage.setItem(storageKey(crawlId), on ? "1" : "0");
    } catch {}
    if (!on) {
      lastSent.current = null;
      setPosition(null);
      await getSupabase()
        .from("members")
        .update({ lat: null, lng: null, accuracy: null, located_at: null })
        .eq("crawl_id", crawlId)
        .eq("user_id", userId);
    }
  }

  return { sharing, setSharing, error, position };
}
