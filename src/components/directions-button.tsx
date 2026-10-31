"use client";

import { Footprints } from "lucide-react";
import { useSyncExternalStore } from "react";
import { detectMapsPlatform, walkingDirectionsUrl, type MapsPlatform } from "@/lib/directions";
import type { LatLng } from "@/lib/types";
import { Icon } from "./ds";

const noSubscribe = () => () => {};
const clientPlatform = (): MapsPlatform => detectMapsPlatform(navigator.userAgent, navigator.maxTouchPoints);
const serverPlatform = (): MapsPlatform => "other";

// Platformen ændrer sig ikke undervejs. Serveren gætter på Google Maps, og browseren retter det ved hydrering.
export function useMapsPlatform() {
  return useSyncExternalStore(noSubscribe, clientPlatform, serverPlatform);
}

// "Vis vej": et link, der åbner gåruten til pubben i telefonens kort-app.
export function DirectionsButton({
  to,
  name,
  variant = "secondary",
  size = "md",
  iconOnly,
  fullWidth,
  label = "Vis vej",
  className = "",
}: {
  to: LatLng;
  name: string;
  variant?: "primary" | "gold" | "secondary" | "ghost";
  size?: "md" | "lg";
  iconOnly?: boolean;
  fullWidth?: boolean;
  label?: string;
  className?: string;
}) {
  const platform = useMapsPlatform();
  const cls = [
    "pc-btn",
    `pc-btn--${variant}`,
    size === "lg" && "pc-btn--lg",
    iconOnly && "pc-ibtn",
    fullWidth && "pc-btn--full",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <a
      href={walkingDirectionsUrl(to, platform)}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
      aria-label={`Vis vej til ${name}`}
      title={iconOnly ? `Vis vej til ${name}` : undefined}
      // Kortet ligger i en StopCard, som selv reagerer på tryk.
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name={Footprints} size={size === "lg" ? 20 : 18} />
      {!iconOnly && label}
    </a>
  );
}
