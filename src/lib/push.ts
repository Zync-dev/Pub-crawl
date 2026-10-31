"use client";

import { installPlatform, isStandalone } from "./install";
import { getSupabase } from "./supabase";

// Push-beskeder til holdet. Abonnementet gemmes i push_subscriptions, og /api/push sender beskederne.

export type PushSupport =
  | "supported"
  // iPhone kan kun få beskeder, når appen ligger på hjemmeskærmen.
  | "needs-install"
  | "unsupported"
  | "unconfigured";

export type PushResult = "enabled" | "denied" | "failed" | PushSupport;

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!capable) return installPlatform() === "ios" && !isStandalone() ? "needs-install" : "unsupported";
  return "supported";
}

export function pushPermission(): NotificationPermission | null {
  try {
    return "Notification" in window ? Notification.permission : null;
  } catch {
    return null;
  }
}

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

async function currentSubscription() {
  if (pushSupport() !== "supported") return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await getSupabase().rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
  });
  return !error;
}

// Om dette apparat får beskeder lige nu.
export async function pushEnabled() {
  return pushPermission() === "granted" && (await currentSubscription()) !== null;
}

// Skal kaldes direkte fra et tryk: iPhone og Firefox spørger kun om lov, når brugeren selv har trykket.
export async function enablePush(): Promise<PushResult> {
  const support = pushSupport();
  if (support !== "supported") return support;
  // Spørg først, før noget andet venter, så tilladelsen stadig hører til trykket.
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return "failed";
  }
  if (permission !== "granted") return permission === "denied" ? "denied" : "failed";
  try {
    const reg = await registration();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    return (await save(sub)) ? "enabled" : "failed";
  } catch {
    return "failed";
  }
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return true;
  const { error } = await getSupabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  try {
    await sub.unsubscribe();
  } catch {}
  return !error;
}

// Gemmer abonnementet igen, når appen åbnes. Det fanger nye endpoints og en ny anonym bruger på samme telefon.
export async function syncPush() {
  if (pushPermission() !== "granted") return;
  const sub = await currentSubscription();
  if (sub) await save(sub);
}

export type CrewMessage = { title: string; body?: string; url?: string };

// Sender en besked til holdet. Databasen sørger for, at den samme (kind, key) kun sendes én gang pr. tur,
// så alle åbne telefoner trygt kan kalde den. Fejl ignoreres: beskeden er en ekstra, ikke det vigtige.
export async function notifyCrew(crawlId: string, kind: string, key: string, message: CrewMessage) {
  if (!VAPID_PUBLIC_KEY) return;
  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/push", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ crawlId, kind, key, ...message }),
    });
  } catch {}
}
