"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { memberTone } from "@/lib/colors";
import { formatUnits } from "@/lib/drinks";
import { formatAgo } from "@/lib/geo";
import { forgetCrawl } from "@/lib/recent";
import type { Crawl, Drink, Member } from "@/lib/types";
import type { ArrangerTools } from "@/lib/use-arranger"; // arranger
import type { useLocationSharing } from "@/lib/use-location";
import { ArrangerCard } from "./arranger-card"; // arranger
import { useAsk } from "./ask";
import { InstallCard } from "./install-card";
import { PushSettings } from "./push-settings";
import type { CrawlActions } from "./crawl-app";
import { Avatar, Badge, Button, Card, Switch, Tabs } from "./ds";
import { RoundsGiven } from "./rounds"; // Omgange
// nav-live: live-link
import { LiveLinkCard } from "./live-link-card";

export function CrewTab({
  crawl,
  members,
  drinks,
  userId,
  now,
  location,
  actions,
  arranger,
}: {
  crawl: Crawl;
  members: Member[];
  drinks: Drink[];
  userId: string;
  now: number;
  location: ReturnType<typeof useLocationSharing>;
  actions: CrawlActions;
  arranger: ArrangerTools;
}) {
  const [tab, setTab] = useState<"crew" | "settings">("crew");

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-1.5">
        <Tabs
          items={[
            { id: "crew", label: "Holdet" },
            { id: "settings", label: "Indstillinger" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div key={tab} className="pc-enter flex flex-col gap-2.5 px-4 py-3.5">
        {tab === "crew" ? (
          <Crew crawl={crawl} members={members} drinks={drinks} userId={userId} now={now} />
        ) : (
          <Settings
            crawl={crawl}
            members={members}
            userId={userId}
            location={location}
            actions={actions}
            arranger={arranger}
          />
        )}
      </div>
    </div>
  );
}

function Crew({
  crawl,
  members,
  drinks,
  userId,
  now,
}: {
  crawl: Crawl;
  members: Member[];
  drinks: Drink[];
  userId: string;
  now: number;
}) {
  const ask = useAsk();
  const [copied, setCopied] = useState(false);

  async function invite() {
    const url = `${window.location.origin}/t/${crawl.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: crawl.name, text: `Hop med på ${crawl.name}`, url });
        return;
      }
    } catch {
      // Delingen blev lukket. Så kopierer vi i stedet.
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      ask.toast("Linket er kopieret");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      ask.toast(`Linket: ${url}`);
    }
  }

  return (
    <>
      <Card variant="inverse" className="pc-on-dark flex flex-col items-center gap-3 text-center" style={{ border: "var(--rule-double)" }}>
        <p className="pc-eyebrow" style={{ color: "var(--gold-500)" }}>
          Koden til turen
        </p>
        <p className="font-serif text-[44px] leading-none tracking-[0.12em] text-cream-100">{crawl.code}</p>
        <Button variant="gold" icon="share-2" fullWidth onClick={() => void invite()}>
          {copied ? "Kopieret" : "Inviter vennerne"}
        </Button>
      </Card>

      {/* nav-live: "Sent på den? Del et live-link" */}
      <LiveLinkCard crawl={crawl} userId={userId} />

      {members.map((m, i) => {
        const me = m.user_id === userId;
        const units = drinks.filter((d) => d.user_id === m.user_id).reduce((sum, d) => sum + Number(d.units), 0);
        return (
          <Card
            key={m.user_id}
            padding="12px 14px"
            className="pc-enter flex items-center gap-3"
            style={{ animationDelay: `${Math.min(i + 1, 6) * 40}ms` }}
          >
            <Avatar name={m.name} tone={memberTone(m.color)} size={40} ring={me} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-serif text-[20px] leading-tight">
                {m.name}
                {me && " (dig)"}
              </div>
              <div className="text-[13px] text-muted">
                {formatUnits(units)} gst.
                <RoundsGiven userId={m.user_id} />
                {m.located_at ? ` · set ${formatAgo(m.located_at, now)}` : ""}
              </div>
            </div>
            {m.user_id === crawl.created_by && <Badge tone="outline">Arrangør</Badge>}
          </Card>
        );
      })}
    </>
  );
}

function Settings({
  crawl,
  members,
  userId,
  location,
  actions,
  arranger,
}: {
  crawl: Crawl;
  members: Member[];
  userId: string;
  location: ReturnType<typeof useLocationSharing>;
  actions: CrawlActions;
  arranger: ArrangerTools;
}) {
  const ask = useAsk();
  const router = useRouter();
  const me = members.find((m) => m.user_id === userId);

  return (
    <>
      <Card className="flex flex-col gap-1">
        <Switch
          checked={location.sharing}
          onChange={(on) => void location.setSharing(on)}
          label="Del min position med holdet"
        />
        <p className="text-[13px] text-muted">
          Kun holdet kan se den, og kun mens appen er åben. Slår du den fra, bliver den slettet.
          Positioner slettes automatisk efter 6 timer.
        </p>
        {location.error && <p className="text-[13px] text-oxblood-500">{location.error}</p>}
      </Card>

      {/* pwa-push: beskeder og hjemmeskærm */}
      <PushSettings />
      <InstallCard />

      {/* arranger: kun arrangøren ser sit kort */}
      {arranger.isArranger && <ArrangerCard crawl={crawl} members={members} userId={userId} arranger={arranger} />}

      <Card className="flex flex-col gap-2">
        <Button
          variant="secondary"
          icon="user"
          fullWidth
          onClick={async () => {
            const name = await ask.prompt({
              eyebrow: "Dit navn",
              title: "Hvad skal vi kalde dig?",
              label: "Navn",
              initial: me?.name,
              confirm: "Gem",
              maxLength: 30,
            });
            if (name) await actions.rename(name);
          }}
        >
          Skift mit navn
        </Button>
        <Button
          variant="secondary"
          icon="pencil"
          fullWidth
          onClick={async () => {
            const name = await ask.prompt({
              eyebrow: "Turen",
              title: "Nyt navn til turen",
              label: "Turens navn",
              initial: crawl.name,
              confirm: "Gem",
              maxLength: 40,
            });
            if (name) await actions.renameCrawl(name);
          }}
        >
          Omdøb turen
        </Button>
        <Button
          variant="ghost"
          icon="log-out"
          fullWidth
          style={{ color: "var(--oxblood-700)" }}
          onClick={async () => {
            // Går arrangøren, giver databasen (0013) rollen til den, der har været længst på holdet.
            const heir = arranger.isArranger
              ? members
                  .filter((m) => m.user_id !== userId)
                  .sort((a, b) => a.joined_at.localeCompare(b.joined_at) || (a.user_id < b.user_id ? -1 : 1))[0]
              : undefined;
            const ok = await ask.confirm({
              eyebrow: "Forlad turen",
              title: "Går du hjem?",
              body: heir
                ? `Dine drinks bliver slettet fra stillingen. ${heir.name} bliver arrangør.`
                : "Dine drinks bliver slettet fra stillingen.",
              confirm: "Forlad turen",
              cancel: "Bliv på holdet",
              danger: true,
            });
            if (!ok) return;
            arranger.setLeaving(true);
            if (await actions.leaveCrawl()) {
              forgetCrawl(crawl.code);
              router.push("/");
            } else {
              arranger.setLeaving(false);
            }
          }}
        >
          Forlad turen
        </Button>
      </Card>
    </>
  );
}
