"use client";

import { Beer, Users } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { memberTone } from "@/lib/colors";
import {
  formatRoundCount,
  formatRoundsGiven,
  genitive,
  lastInBuyer,
  latestRounds,
  rankBuyers,
  removeRound,
  roundCounts,
  roundStandings,
  upsertRound,
  type Round,
} from "@/lib/rounds";
import { notifyCrew } from "@/lib/push";
import { getSupabase } from "@/lib/supabase";
import { formatTime } from "@/lib/timer";
import type { Member, Stop } from "@/lib/types";
import { useRounds } from "@/lib/use-rounds";
import { useAsk } from "./ask";
import { Avatar, Button, Card, Icon, SectionTitle } from "./ds";
import { useRollCallContext } from "./roll-call"; // wiring: "Sidst med" fra opråbet

// Hvis tur er det til at give? Data og handlinger deles af Nu, Stillingen og Holdet.

type RoundsContextValue = {
  rounds: Round[];
  loaded: boolean;
  members: Member[];
  stops: Stop[];
  userId: string;
  give: (buyer: Member) => Promise<boolean>;
  undo: (round: Round) => Promise<void>;
};

const RoundsContext = createContext<RoundsContextValue | null>(null);

function useRoundsContext() {
  const value = useContext(RoundsContext);
  if (!value) throw new Error("Omgangene skal bruges inden i RoundsProvider");
  return value;
}

export function RoundsProvider({
  crawlId,
  crawlCode,
  userId,
  members,
  stops,
  currentStopId,
  children,
}: {
  crawlId: string;
  // wiring: til linket i push-beskeden.
  crawlCode?: string;
  userId: string;
  members: Member[];
  stops: Stop[];
  currentStopId: string | null;
  children: ReactNode;
}) {
  const ask = useAsk();
  const { rounds, loaded, setRounds } = useRounds(crawlId);

  async function give(buyer: Member) {
    const supabase = getSupabase();
    const row = { crawl_id: crawlId, stop_id: currentStopId, buyer_id: buyer.user_id };
    // Vises med det samme og byttes ud med rækken fra databasen, når den kommer.
    const temp: Round = {
      ...row,
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      created_by: userId,
      created_at: new Date().toISOString(),
    };
    setRounds((prev) => upsertRound(prev, temp));
    const { data, error } = await supabase.from("rounds").insert(row).select().single<Round>();
    if (error || !data) {
      setRounds((prev) => removeRound(prev, temp.id));
      ask.toast("Omgangen kom ikke med. Prøv igen.", "danger");
      return false;
    }
    setRounds((prev) => upsertRound(removeRound(prev, temp.id), data));
    // wiring: Fortryd i toasten (som Tjek ind og Videre) og en besked til resten af holdet.
    let undone = false;
    ask.toast(buyer.user_id === userId ? "Omgangen er på dig" : `Omgangen er på ${buyer.name}`, {
      action: {
        label: "Fortryd",
        onClick: () => {
          if (undone) return;
          undone = true;
          void undo(data);
        },
      },
    });
    void notifyCrew(crawlId, "round", data.id, {
      title: `Omgangen er på ${buyer.name}`,
      url: crawlCode ? `/t/${crawlCode}` : undefined,
    });
    return true;
  }

  async function undo(round: Round) {
    if (round.id.startsWith("tmp-")) return;
    setRounds((prev) => removeRound(prev, round.id));
    const { error } = await getSupabase().from("rounds").delete().eq("id", round.id);
    if (error) {
      setRounds((prev) => upsertRound(prev, round));
      ask.toast("Det blev ikke fortrudt. Tjek forbindelsen.", "danger");
    }
  }

  const value = { rounds, loaded, members, stops, userId, give, undo };
  return <RoundsContext.Provider value={value}>{children}</RoundsContext.Provider>;
}

// Kortet under Nu: forslag til næste giver, et valg mellem alle på holdet og de seneste omgange.
export function NextRoundCard() {
  const { rounds, members, stops, userId, give, undo } = useRoundsContext();
  const rollCall = useRollCallContext();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ranked = useMemo(() => rankBuyers(members, rounds), [members, rounds]);
  const counts = useMemo(() => roundCounts(members, rounds), [members, rounds]);
  const suggested = ranked[0]?.member ?? null;
  const buyer = members.find((m) => m.user_id === picked) ?? suggested;
  if (!buyer || !suggested) return null;
  // wiring: "Sidst med: Jonas. Skal Jonas give?" ved siden af forslaget, når opråbet er lukket.
  const lastIn = rollCall.open ? null : lastInBuyer(rollCall.lastIn, members, rounds, buyer.user_id);
  const lastInName = lastIn?.user_id === userId ? "dig" : lastIn?.name;
  const lastInWho = lastIn?.user_id === userId ? "du" : lastIn?.name;

  const byId = new Map(members.map((m) => [m.user_id, m]));
  const latest = latestRounds(
    rounds.filter((r) => byId.has(r.buyer_id)),
    3,
  );
  const count = counts.get(buyer.user_id) ?? 0;
  const me = buyer.user_id === userId;
  const name = me ? "Du" : buyer.name;
  const note =
    rounds.length === 0
      ? "Ingen har givet endnu. Nogen skal starte."
      : buyer.user_id === suggested.user_id
        ? `${formatRoundsGiven(count)} · færrest på holdet`
        : `${formatRoundsGiven(count)} · ellers er det ${suggested.user_id === userId ? "din" : genitive(suggested.name)} tur`;

  async function record() {
    if (!buyer || busy) return;
    setBusy(true);
    try {
      navigator.vibrate?.(30);
    } catch {}
    if (await give(buyer)) setPicked(null);
    setBusy(false);
  }

  return (
    <section className="mt-2">
      <SectionTitle eyebrow="Hvis tur er det?" title="Næste omgang" />
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          <span key={buyer.user_id} className="pc-fade-in">
            <Avatar name={buyer.name} tone={memberTone(buyer.color)} size={56} ring />
          </span>
          <div className="min-w-0 flex-1">
            <p key={buyer.user_id} className="pc-fade-in truncate font-serif text-[26px] leading-tight">
              {me ? "Din tur" : buyer.name}
            </p>
            <p className="text-[13px] text-muted">{note}</p>
          </div>
        </div>

        {lastIn && (
          <button
            type="button"
            onClick={() => setPicked(lastIn.user_id === suggested.user_id ? null : lastIn.user_id)}
            className="pc-fade-in -my-2 flex min-h-11 items-center gap-2 text-left text-[13px] text-muted active:translate-y-px"
            style={{ background: "none", border: 0, padding: 0 }}
          >
            <Icon name={Users} size={16} color="var(--oxblood-700)" />
            <span>
              Sidst med: {lastInName}. Skal {lastInWho} give?
            </span>
          </button>
        )}

        {members.length > 1 && (
          <div>
            <p className="pc-label mb-2 text-muted">Eller en anden</p>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1.5" role="group" aria-label="Vælg hvem der giver">
              {ranked.map(({ member: m }) => {
                const selected = m.user_id === buyer.user_id;
                return (
                  <button
                    key={m.user_id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${m.name} giver`}
                    onClick={() => setPicked(m.user_id === suggested.user_id ? null : m.user_id)}
                    className="flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-[var(--radius-sm)] py-1 transition-transform duration-75 active:translate-y-px"
                    style={{ background: "none", border: 0, minHeight: 44 }}
                  >
                    <Avatar name={m.name} tone={memberTone(m.color)} size={40} ring={selected} />
                    <span
                      className="w-full truncate text-center text-[12px]"
                      style={{
                        fontWeight: selected ? 700 : 500,
                        color: selected ? "var(--green-800)" : "var(--text-muted)",
                      }}
                    >
                      {m.user_id === userId ? "Dig" : m.name.split(/\s+/)[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Button variant="gold" size="lg" icon={Beer} fullWidth loading={busy} onClick={() => void record()}>
          {name} giver
        </Button>
      </Card>

      {latest.length > 0 && (
        <Card padding="4px 0" className="mt-2.5">
          <ul className="divide-y divide-line">
            {latest.map((r) => {
              const m = byId.get(r.buyer_id)!;
              const stopName = stops.find((s) => s.id === r.stop_id)?.name;
              const mine = r.created_by === userId;
              return (
                <li key={r.id} className="pc-fade-in flex items-center gap-3 px-4 py-2">
                  <Avatar name={m.name} tone={memberTone(m.color)} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {m.user_id === userId ? "Du gav" : `${m.name} gav`}
                    </span>
                    <span className="block truncate text-[13px] text-muted">
                      {formatTime(r.created_at)}
                      {stopName && ` · ${stopName}`}
                    </span>
                  </span>
                  {mine && !r.id.startsWith("tmp-") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="undo-2"
                      className="min-h-11"
                      onClick={() => void undo(r)}
                      aria-label={`Fortryd omgangen på ${m.name}`}
                    >
                      Fortryd
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}

// Til Holdet: " · 2 omgange givet" efter genstandene.
export function RoundsGiven({ userId }: { userId: string }) {
  const { members, rounds } = useRoundsContext();
  const count = useMemo(() => roundCounts(members, rounds).get(userId) ?? 0, [members, rounds, userId]);
  return <>{` · ${formatRoundsGiven(count)}`}</>;
}

// Til Stillingen: hvem har givet flest omgange.
export function RoundsStandings({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean }) {
  const { members, rounds, userId } = useRoundsContext();
  const standings = useMemo(() => roundStandings(members, rounds), [members, rounds]);
  const total = standings.reduce((sum, s) => sum + s.count, 0);
  const top = Math.max(1, ...standings.map((s) => s.count));
  if (!members.length || (hideWhenEmpty && total === 0)) return null;

  return (
    <section>
      <SectionTitle eyebrow={`${formatRoundCount(total)} i alt`} title="Omgange" />
      {total === 0 ? (
        <Card>
          <p className="text-muted">Ingen har givet en omgang endnu. Det skrives under Nu.</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          {standings.map(({ member: m, count }) => (
            <div key={m.user_id} className="flex items-center gap-3">
              <Avatar name={m.name} tone={memberTone(m.color)} size={32} ring={m.user_id === userId} />
              <span className="w-24 shrink-0 truncate text-sm font-semibold">
                {m.user_id === userId ? "Dig" : m.name}
              </span>
              <span className="h-5 flex-1 overflow-hidden rounded-[var(--radius-xs)] bg-cream-300">
                <span
                  className="pc-grow block h-full bg-gold-500 transition-[width] duration-500"
                  style={{ width: `${(count / top) * 100}%` }}
                />
              </span>
              <span key={count} className="pc-pop w-7 text-right font-serif text-[18px] tabular-nums">
                {count}
              </span>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
