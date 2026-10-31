"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { preparePhoto } from "./photo-image";
import type { PendingPhoto, Photo, RatingSummary, StopRating } from "./reviews-types";
import { liveTopic } from "./realtime";
import { getSupabase } from "./supabase";

// Stjerner og billeder for én tur. Nu, Ruten og Stillingen bruger det samme lager,
// så der kun er én Realtime-kanal pr. tur, uanset hvor mange komponenter der lytter.

type State = {
  ratings: StopRating[];
  photos: Photo[];
  pending: PendingPhoto[];
  userId: string | null;
  loaded: boolean;
};

const EMPTY: State = { ratings: [], photos: [], pending: [], userId: null, loaded: false };
const byTime = (a: Photo, b: Photo) => a.created_at.localeCompare(b.created_at);

class ReviewsStore {
  state: State = EMPTY;
  private listeners = new Set<() => void>();
  private refs = 0;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private teardown: (() => void) | null = null;

  constructor(readonly crawlId: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  set(update: (prev: State) => State) {
    this.state = update(this.state);
    this.listeners.forEach((l) => l());
  }

  // Kanalen åbnes af den første, der bruger lageret, og lukkes lidt efter den sidste.
  // Ventetiden gør, at et fanebyt ikke river kanalen ned og bygger den op igen.
  retain() {
    this.refs++;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (!this.teardown) this.teardown = this.open();
    return () => {
      this.refs--;
      if (this.refs > 0) return;
      this.closeTimer = setTimeout(() => {
        this.closeTimer = null;
        if (this.refs > 0) return;
        this.teardown?.();
        this.teardown = null;
      }, 3000);
    };
  }

  refetch = async () => {
    const supabase = getSupabase();
    const [session, ratings, photos] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from("stop_ratings").select("*").eq("crawl_id", this.crawlId).returns<StopRating[]>(),
      supabase.from("photos").select("*").eq("crawl_id", this.crawlId).returns<Photo[]>(),
    ]);
    this.set((prev) => ({
      ...prev,
      userId: session.data.session?.user.id ?? prev.userId,
      ratings: ratings.data ?? prev.ratings,
      photos: (photos.data ?? prev.photos).slice().sort(byTime),
      loaded: prev.loaded || (!ratings.error && !photos.error),
    }));
  };

  private open() {
    const supabase = getSupabase();
    const filter = `crawl_id=eq.${this.crawlId}`;
    const channel = supabase
      .channel(liveTopic("pub-reviews", this.crawlId))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stop_ratings", filter }, (p) =>
        this.upsertRating(p.new as StopRating),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "stop_ratings", filter }, (p) =>
        this.upsertRating(p.new as StopRating),
      )
      // Slettede rækker kan ikke filtreres på crawl_id, men nøglen følger med, så vi fjerner dem lokalt.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "stop_ratings" }, (p) => {
        const old = p.old as Partial<StopRating>;
        this.set((prev) => ({
          ...prev,
          ratings: prev.ratings.filter((r) => r.stop_id !== old.stop_id || r.user_id !== old.user_id),
        }));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "photos", filter }, (p) =>
        this.addPhoto(p.new as Photo),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "photos" }, (p) => {
        const old = p.old as Partial<Photo>;
        this.set((prev) => ({ ...prev, photos: prev.photos.filter((x) => x.id !== old.id) }));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void this.refetch();
      });

    // En pub kan blive slettet (og dens stjerner med), mens telefonen sover.
    const onVisible = () => {
      if (document.visibilityState === "visible") void this.refetch();
    };
    const onOnline = () => void this.refetch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }

  upsertRating(next: StopRating) {
    this.set((prev) => ({
      ...prev,
      ratings: [...prev.ratings.filter((r) => r.stop_id !== next.stop_id || r.user_id !== next.user_id), next],
    }));
  }

  addPhoto(next: Photo) {
    this.set((prev) => ({
      ...prev,
      photos: [...prev.photos.filter((x) => x.id !== next.id), next].sort(byTime),
    }));
  }

  async rate(stopId: string, stars: number) {
    const supabase = getSupabase();
    const userId = this.state.userId ?? (await supabase.auth.getSession()).data.session?.user.id ?? null;
    if (!userId) return false;
    const before = this.state.ratings.find((r) => r.stop_id === stopId && r.user_id === userId);
    const now = new Date().toISOString();
    this.upsertRating({
      stop_id: stopId,
      crawl_id: this.crawlId,
      user_id: userId,
      stars,
      created_at: before?.created_at ?? now,
      updated_at: now,
    });
    const { data, error } = await supabase
      .rpc("rate_stop", { p_stop: stopId, p_stars: stars })
      .single<StopRating>();
    if (error || !data) {
      this.set((prev) => ({
        ...prev,
        ratings: [
          ...prev.ratings.filter((r) => r.stop_id !== stopId || r.user_id !== userId),
          ...(before ? [before] : []),
        ],
      }));
      return false;
    }
    this.upsertRating(data);
    return true;
  }

  // Skalerer ned, lægger filen op og skriver rækken. Fejler rækken, fjernes filen igen.
  async upload(file: File, stopId: string | null) {
    const supabase = getSupabase();
    const id = newId();
    this.set((prev) => ({ ...prev, pending: [...prev.pending, { id, stopId }] }));
    try {
      const { blob, width, height } = await preparePhoto(file);
      const path = `${this.crawlId}/${stopId ?? "ude"}/${id}.jpg`;
      const bucket = supabase.storage.from("photos");
      const uploaded = await bucket.upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
      if (uploaded.error) return false;
      const { data, error } = await supabase
        .from("photos")
        .insert({ id, crawl_id: this.crawlId, stop_id: stopId, path, width, height })
        .select()
        .single<Photo>();
      if (error || !data) {
        await bucket.remove([path]);
        return false;
      }
      this.addPhoto(data);
      return true;
    } catch {
      return false;
    } finally {
      this.set((prev) => ({ ...prev, pending: prev.pending.filter((p) => p.id !== id) }));
    }
  }

  // Rækken slettes først. Så kan et billede aldrig stå i appen uden en fil bag sig.
  async remove(photo: Photo) {
    const supabase = getSupabase();
    this.set((prev) => ({ ...prev, photos: prev.photos.filter((x) => x.id !== photo.id) }));
    const { error } = await supabase.from("photos").delete().eq("id", photo.id);
    if (error) {
      this.addPhoto(photo);
      return false;
    }
    await supabase.storage.from("photos").remove([photo.path]);
    return true;
  }
}

// crypto.randomUUID findes kun på https og localhost. Telefoner på wifi-adressen får en v4 på anden vis.
function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const stores = new Map<string, ReviewsStore>();

function storeFor(crawlId: string) {
  let store = stores.get(crawlId);
  if (!store) {
    store = new ReviewsStore(crawlId);
    stores.set(crawlId, store);
  }
  return store;
}

const serverSnapshot = () => EMPTY;

export function summarize(ratings: StopRating[], stopId: string, userId: string | null): RatingSummary | null {
  const here = ratings.filter((r) => r.stop_id === stopId);
  const mine = here.find((r) => r.user_id === userId)?.stars ?? null;
  if (!here.length) return null;
  return { average: here.reduce((sum, r) => sum + r.stars, 0) / here.length, count: here.length, mine };
}

// "4,3"
export function formatStars(average: number) {
  return average.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// "4,3 · 4 stemmer"
export function formatSummary(s: RatingSummary) {
  return `${formatStars(s.average)} · ${s.count} ${s.count === 1 ? "stemme" : "stemmer"}`;
}

export function useReviews(crawlId: string) {
  const store = storeFor(crawlId);
  useEffect(() => store.retain(), [store]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);

  const rate = useCallback((stopId: string, stars: number) => store.rate(stopId, stars), [store]);
  const upload = useCallback((file: File, stopId: string | null) => store.upload(file, stopId), [store]);
  const remove = useCallback((photo: Photo) => store.remove(photo), [store]);
  const summary = useCallback(
    (stopId: string) => summarize(state.ratings, stopId, state.userId),
    [state.ratings, state.userId],
  );
  const photosAt = useCallback(
    (stopId: string | null) => state.photos.filter((p) => p.stop_id === stopId),
    [state.photos],
  );

  return useMemo(
    () => ({ ...state, rate, upload, remove, summary, photosAt }),
    [state, rate, upload, remove, summary, photosAt],
  );
}
