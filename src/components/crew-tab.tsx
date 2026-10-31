"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { memberColor } from "@/lib/colors";
import { formatAgo } from "@/lib/geo";
import { forgetCrawl } from "@/lib/recent";
import type { Crawl, Member } from "@/lib/types";
import type { useLocationSharing } from "@/lib/use-location";
import type { CrawlActions } from "./crawl-app";
import { Avatar, Button, Card } from "./ui";

export function CrewTab({
  crawl,
  members,
  userId,
  now,
  location,
  actions,
}: {
  crawl: Crawl;
  members: Member[];
  userId: string;
  now: number;
  location: ReturnType<typeof useLocationSharing>;
  actions: CrawlActions;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const me = members.find((m) => m.user_id === userId);

  async function invite() {
    const url = `${window.location.origin}/t/${crawl.code}`;
    const text = `Hop med på ${crawl.name}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: crawl.name, text, url });
        return;
      }
    } catch {
      // Brugeren lukkede delingen. Så kopierer vi i stedet.
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Kopiér linket", url);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <p className="text-sm text-muted">Koden til turen</p>
        <p className="mb-3 font-mono text-3xl font-bold tracking-[0.25em]">{crawl.code}</p>
        <Button className="w-full" onClick={() => void invite()}>
          {copied ? "Linket er kopieret ✓" : "Inviter vennerne"}
        </Button>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="font-semibold">Del min position</h2>
            <p className="text-sm text-muted">
              Kun dem på holdet kan se den, og kun mens appen er åben. Slår du det fra, bliver din
              position slettet.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={location.sharing}
            aria-label="Del min position"
            onClick={() => void location.setSharing(!location.sharing)}
            className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition ${location.sharing ? "bg-gold" : "bg-line"}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-ink transition-all ${location.sharing ? "left-7" : "left-1"}`}
            />
          </button>
        </div>
        {location.error && <p className="mt-2 text-sm text-danger">{location.error}</p>}
      </Card>

      <section>
        <h2 className="mb-2 font-semibold">Holdet · {members.length}</h2>
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={m.name} color={memberColor(m.color)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.name}
                  {m.user_id === userId && <span className="text-muted"> (dig)</span>}
                </span>
                <span className="block text-xs text-muted">
                  {m.located_at ? `📍 ${formatAgo(m.located_at, now)}` : "Deler ikke position"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            const name = window.prompt("Dit navn", me?.name ?? "");
            if (name?.trim()) void actions.rename(name);
          }}
        >
          Skift mit navn
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const name = window.prompt("Turens navn", crawl.name);
            if (name?.trim()) void actions.renameCrawl(name);
          }}
        >
          Omdøb turen
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (!window.confirm("Forlad turen? Dine drinks bliver slettet fra statistikken.")) return;
            await actions.leaveCrawl();
            forgetCrawl(crawl.code);
            router.push("/");
          }}
        >
          Forlad turen
        </Button>
      </div>
    </div>
  );
}
