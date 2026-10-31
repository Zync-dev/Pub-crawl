"use client";

import { useSyncExternalStore } from "react";

// Hjemmeskærmen: om appen er installeret, hvilken telefon det er, og Androids egen installér-dialog.

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallPlatform = "ios" | "android" | "other";

export type InstallState = {
  // Vi ved det først i browseren. Indtil da viser vi ingenting.
  ready: boolean;
  standalone: boolean;
  platform: InstallPlatform;
  canPrompt: boolean;
};

const SERVER_STATE: InstallState = { ready: false, standalone: false, platform: "other", canPrompt: false };

let deferred: InstallPromptEvent | null = null;
let installed = false;
let snapshot: InstallState | null = null;
const listeners = new Set<() => void>();

function emit() {
  snapshot = null;
  listeners.forEach((l) => l());
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  } catch {}
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function installPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS giver sig ud for at være en Mac, men har touch.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

// Kaldes én gang fra rodlayoutet, så vi fanger Androids beforeinstallprompt, før nogen side har brug for den.
export function listenForInstallPrompt() {
  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  };
  const onInstalled = () => {
    installed = true;
    deferred = null;
    emit();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

// Viser Androids installér-dialog. Skal kaldes fra et tryk.
export async function promptInstall() {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === "accepted";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): InstallState {
  snapshot ??= {
    ready: true,
    standalone: installed || isStandalone(),
    platform: installPlatform(),
    canPrompt: deferred !== null,
  };
  return snapshot;
}

export function useInstallState() {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}

const DISMISS_KEY = "pc-install-dismissed";

export function installDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {}
}
