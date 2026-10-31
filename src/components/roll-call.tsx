"use client";

import { Check, Users, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { memberTone } from "@/lib/colors";
import { allInToastStep, joinNames, type SeenOpen } from "@/lib/roll-call";
import { formatTime } from "@/lib/timer";
import type { Member, Stop } from "@/lib/types";
import { useRollCall, type RollCallState } from "@/lib/use-roll-call";
import { useAsk } from "./ask";
import { Avatar, Badge, Button, Card } from "./ds";

// Er alle med? Opråbet, når holdet går videre. Data kommer fra useRollCall i lib/use-roll-call.ts.

const RollCallContext = createContext<RollCallState | null>(null);

export function useRollCallContext() {
  const value = useContext(RollCallContext);
  if (!value) throw new Error("useRollCallContext skal bruges inden i RollCallProvider");
  return value;
}

export function RollCallProvider({ value, children }: { value: RollCallState; children: ReactNode }) {
  return <RollCallContext.Provider value={value}>{children}</RollCallContext.Provider>;
}

// Hooken med appens toasts: fejl og "Alle er med", når et åbent opråb lukker, fordi alle har svaret.
export function useRollCallWithToasts(crawlId: string, userId: string, members: Member[], now: number) {
  const ask = useAsk();
  const rollCall = useRollCall(crawlId, userId, members, now, (text) => ask.toast(text, "danger"));
  const seenOpen = useRef<SeenOpen>(null);
  const { call, open, everyoneIn } = rollCall;
  const callId = call?.id;
  const closed = Boolean(call?.closed_at);

  useEffect(() => {
    if (!callId) return;
    // Kun når vi selv så det åbent, ellers ville alle få toasten, når de åbner appen.
    const step = allInToastStep(seenOpen.current, { id: callId, open, closed, everyoneIn }, Date.now());
    seenOpen.current = step.seen;
    if (step.toast) ask.toast("Alle er med");
  }, [callId, open, closed, everyoneIn, ask]);

  return rollCall;
}

function vibrate() {
  try {
    navigator.vibrate?.(30);
  } catch {}
}

// Det indrammede kort øverst i Nu, mens opråbet er åbent.
export function RollCallCard({ stops }: { stops: Stop[] }) {
  const rollCall = useRollCallContext();
  const { call, members, open, count, total, answeredIds, missing, mine, startedByMe, busy } = rollCall;
  if (!open || !call) return null;
  const to = stops.find((s) => s.id === call.to_stop_id);

  return (
    <Card variant="framed" className="pc-enter flex flex-col gap-3" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="pc-label text-oxblood-700">Er alle med?</p>
          <p className="mt-2 font-serif text-[28px] leading-tight tabular-nums">
            <span key={count} className="pc-fade-in inline-block">
              {count} af {total} er med
            </span>
          </p>
          {to && <p className="mt-1 truncate text-sm text-muted">På vej til {to.name}</p>}
        </div>
        {/* Alle, der har svaret, kan lukke det, så ingen står med det, fordi den, der startede, har lagt telefonen. */}
        {(startedByMe || mine) && (
          <Button variant="ghost" icon={X} loading={busy === "close"} onClick={() => void rollCall.close()}>
            Luk
          </Button>
        )}
      </div>

      <ul className="flex flex-wrap gap-2.5 py-1" aria-label="Holdet">
        {members.map((m) => {
          const inn = answeredIds.has(m.user_id);
          return (
            <li
              key={m.user_id}
              className="flex"
              style={{ opacity: inn ? 1 : 0.45, transition: "opacity var(--dur-base) var(--ease)" }}
            >
              <Avatar name={m.name} tone={memberTone(m.color)} size={36} ring={inn} />
              <span className="sr-only">
                {m.name} {inn ? "er med" : "mangler"}
              </span>
            </li>
          );
        })}
      </ul>

      {mine ? (
        <p className="text-sm text-muted">
          {missing.length ? `Du er med. Venter på ${joinNames(missing.map((m) => m.name))}.` : "Du er med."}
        </p>
      ) : (
        <Button
          variant="gold"
          size="lg"
          icon={Check}
          fullWidth
          loading={busy === "answer"}
          onClick={() => {
            vibrate();
            void rollCall.answer();
          }}
        >
          Jeg er med
        </Button>
      )}
    </Card>
  );
}

// Under hovedkortet i Nu, når der ikke er et åbent opråb: "Sidst med" og knappen til at starte et.
export function RollCallStarter({ userId, fromStopId }: { userId: string; fromStopId: string | null }) {
  const rollCall = useRollCallContext();
  const { open, total, showLastIn, lastIn, busy } = rollCall;
  if (open || total < 2) return null;

  return (
    <div className="flex items-center gap-3">
      <p className="min-w-0 flex-1 text-sm text-muted">
        {showLastIn && lastIn ? (
          <span className="pc-fade-in">
            Sidst med: {lastIn.member.user_id === userId ? "dig" : lastIn.member.name} · {formatTime(lastIn.at)}
          </span>
        ) : (
          "Mangler der nogen?"
        )}
      </p>
      <Button
        variant="secondary"
        icon={Users}
        loading={busy === "start"}
        onClick={() => void rollCall.start(fromStopId, null)}
      >
        Er alle med?
      </Button>
    </div>
  );
}

// Lille mærke i toppen på de andre faner, mens opråbet er åbent.
export function RollCallBadge({ onOpen }: { onOpen: () => void }) {
  const { open, count, total } = useRollCallContext();
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Er alle med? ${count} af ${total}. Gå til opråbet`}
      className="pc-fade-in relative rounded-full"
      style={{ background: "none", border: 0, padding: 0 }}
    >
      {/* Større trykflade end selve mærket. */}
      <span aria-hidden className="absolute -inset-x-2 -inset-y-2.5" />
      <Badge tone="gold" icon={Users}>
        <span className="tabular-nums">
          {count} af {total} med
        </span>
      </Badge>
    </button>
  );
}
