"use client";

import { Crown, KeyRound, Lock, RefreshCw, UserMinus } from "lucide-react";
import { useState } from "react";
import { isRouteLocked, ROUTE_LOCKED_TEXT } from "@/lib/arranger";
import { memberTone } from "@/lib/colors";
import type { Crawl, Member } from "@/lib/types";
import type { ArrangerTools } from "@/lib/use-arranger";
import { useAsk } from "./ask";
import { Avatar, Button, Card, Icon, IconButton, SectionTitle, Switch } from "./ds";

// "Mikkels drinks", men "Jonas' drinks".
function genitive(name: string) {
  return /[sxz]$/i.test(name) ? `${name}'` : `${name}s`;
}

// Arrangørens kort under Holdet > Indstillinger. Vises kun for arrangøren.
export function ArrangerCard({
  crawl,
  members,
  userId,
  arranger,
}: {
  crawl: Crawl;
  members: Member[];
  userId: string;
  arranger: ArrangerTools;
}) {
  const ask = useAsk();
  const [handing, setHanding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const locked = isRouteLocked(crawl);
  const others = members.filter((m) => m.user_id !== userId);

  async function act(key: string, work: () => Promise<string | null>, done: string) {
    setBusy(key);
    const error = await work();
    setBusy(null);
    ask.toast(error ?? done, error ? "danger" : "default");
    return !error;
  }

  async function remove(member: Member) {
    const ok = await ask.confirm({
      eyebrow: "Fjern fra holdet",
      title: `${member.name} skal ikke med?`,
      body: `${genitive(member.name)} drinks, omgange og point forsvinder fra stillingen. Tag en ny kode bagefter, så ${member.name} ikke kan komme ind igen.`,
      confirm: "Fjern fra holdet",
      cancel: "Behold",
      danger: true,
    });
    if (!ok) return;
    setBusy(`remove:${member.user_id}`);
    const error = await arranger.removeMember(member);
    setBusy(null);
    if (error) return ask.toast(error, "danger");
    ask.toast(`${member.name} er taget af holdet`, {
      action: { label: "Ny kode", onClick: () => void rotate() },
    });
  }

  async function rotate() {
    const ok = await ask.confirm({
      eyebrow: "Ny kode",
      title: "Lav en ny kode?",
      body: "Den gamle kode og det gamle link holder op med at virke. Del den nye med holdet.",
      confirm: "Lav ny kode",
    });
    if (!ok) return;
    await act("rotate", () => arranger.rotateCode(), "Turen har fået en ny kode");
  }

  async function handOver(member: Member) {
    const ok = await ask.confirm({
      eyebrow: "Giv rollen videre",
      title: `${member.name} bliver arrangør?`,
      body: "Så kan du ikke længere låse ruten eller styre holdet.",
      confirm: "Giv rollen videre",
    });
    if (!ok) return;
    if (await act(`hand:${member.user_id}`, () => arranger.transferRole(member), `Nu er ${member.name} arrangør`)) {
      setHanding(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle eyebrow="Kun for dig" title="Arrangør" />

      <div className="flex flex-col gap-1">
        <Switch
          checked={locked}
          disabled={busy === "lock"}
          onChange={(on) =>
            void act("lock", () => arranger.setRouteLocked(on), on ? "Ruten er låst" : "Ruten er åben igen")
          }
          label="Lås ruten"
        />
        <p className="text-[13px] text-muted">Kun du kan rette pubberne. Alle kan stadig tjekke ind.</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="pc-label text-oxblood-700">{handing ? "Hvem tager over?" : "Holdet"}</p>
        {others.length === 0 ? (
          <p className="text-[13px] text-muted">Når vennerne er med, kan du styre holdet her.</p>
        ) : (
          <ul key={handing ? "hand" : "crew"} className="pc-fade-in flex flex-col gap-1.5">
            {others.map((m) => (
              <li key={m.user_id} className="flex min-h-11 items-center gap-3">
                <Avatar name={m.name} tone={memberTone(m.color)} size={32} />
                <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
                {handing ? (
                  <Button
                    variant="secondary"
                    icon={Crown}
                    loading={busy === `hand:${m.user_id}`}
                    disabled={busy !== null}
                    onClick={() => void handOver(m)}
                  >
                    Giv rollen
                  </Button>
                ) : (
                  <IconButton
                    icon={UserMinus}
                    label={`Fjern ${m.name} fra holdet`}
                    variant="ghost"
                    disabled={busy !== null}
                    style={{ color: "var(--oxblood-700)" }}
                    onClick={() => void remove(m)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          icon={RefreshCw}
          fullWidth
          loading={busy === "rotate"}
          disabled={busy !== null}
          onClick={() => void rotate()}
        >
          Ny kode
        </Button>
        {others.length > 0 && (
          <Button
            variant={handing ? "ghost" : "secondary"}
            icon={handing ? "x" : Crown}
            fullWidth
            disabled={busy !== null}
            onClick={() => setHanding((h) => !h)}
          >
            {handing ? "Fortryd" : "Giv rollen videre"}
          </Button>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-[13px] text-muted">
        <Icon name={KeyRound} size={14} />
        Koden er {crawl.code}
      </p>
    </Card>
  );
}

// Kort forklaring ved rutens knapper, når ruten er låst for en selv.
export function RouteLockedNote() {
  return (
    <p className="pc-fade-in flex items-center gap-1.5 text-[13px] text-muted" role="status">
      <Icon name={Lock} size={14} />
      {ROUTE_LOCKED_TEXT}
    </p>
  );
}
