"use client";

import { Copy, RefreshCw, Radio } from "lucide-react";
import { useState } from "react";
import { liveLinkPath, type WithShareToken } from "@/lib/live-link";
import { errorText, getSupabase } from "@/lib/supabase";
import type { Crawl } from "@/lib/types";
import { useAsk } from "./ask";
import { Button, Card, Icon } from "./ds";

// "Sent på den?": et link, der viser ruten og hvor holdet er, uden navne eller drinks.
export function LiveLinkCard({ crawl, userId }: { crawl: Crawl; userId: string }) {
  const ask = useAsk();
  // Linket står på turens række (select("*") henter det), men findes ikke i Crawl-typen.
  const fromRow = (crawl as Crawl & WithShareToken).share_token ?? null;
  // Et nyt link fra rotate_share_token gælder, indtil Realtime sender rækken igen.
  const [rotated, setRotated] = useState<{ from: string | null; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const organizer = crawl.created_by === userId;
  const current = rotated && rotated.from === fromRow ? rotated.token : fromRow;

  function url(t: string) {
    return `${window.location.origin}${liveLinkPath(t)}`;
  }

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(url(current));
      setCopied(true);
      ask.toast("Live-linket er kopieret");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      ask.toast(`Linket: ${url(current)}`);
    }
  }

  async function share() {
    if (!current) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Find holdet · ${crawl.name}`,
          text: "Her er vi lige nu. Kom og find os.",
          url: url(current),
        });
        return;
      }
    } catch {
      // Delingen blev lukket. Så kopierer vi i stedet.
    }
    await copy();
  }

  async function rotate() {
    const ok = await ask.confirm({
      eyebrow: "Live-linket",
      title: "Lav et nyt link?",
      body: "Det gamle link holder op med at virke med det samme.",
      confirm: "Lav et nyt",
      cancel: "Behold det",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const { data, error } = await getSupabase().rpc("rotate_share_token", { p_crawl: crawl.id });
    setBusy(false);
    if (error || typeof data !== "string") {
      ask.toast(errorText(error), "danger");
      return;
    }
    setRotated({ from: fromRow, token: data });
    ask.toast("Nyt live-link er klar");
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Icon name={Radio} size={22} color="var(--oxblood-700)" style={{ marginTop: 2 }} />
        <div className="min-w-0 flex-1">
          <p className="pc-label text-oxblood-700">Sent på den?</p>
          <p className="mt-1.5 font-serif text-[22px] leading-tight">Del et live-link</p>
          <p className="mt-1 text-[13px] text-muted">
            Viser ruten, og hvor I er. Ingen navne, ingen drinks.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" icon="share-2" className="flex-1" disabled={!current} onClick={() => void share()}>
          Del linket
        </Button>
        <Button variant="secondary" icon={Copy} className="flex-1" disabled={!current} onClick={() => void copy()}>
          {copied ? "Kopieret" : "Kopiér"}
        </Button>
      </div>
      {organizer && (
        <Button variant="ghost" icon={RefreshCw} loading={busy} disabled={!current} onClick={() => void rotate()}>
          Lav et nyt link
        </Button>
      )}
    </Card>
  );
}
