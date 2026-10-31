"use client";

import { Check, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { challengeOutcome } from "@/lib/challenge-points";
import { Button } from "../ds";
import { useGamesContext } from "./games-provider";

// Afstemningen under udfordringen i Nu. Ligger inde i det grønne kort.
export function ChallengeVoting({ challengeId, text }: { challengeId: string | null | undefined; text: string }) {
  const { challenges, votes, members, userId, vote, ensureChallenge } = useGamesContext();
  const challenge = challenges.find((c) => c.id === challengeId);
  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);

  useEffect(() => {
    if (challengeId && !challenge) ensureChallenge(challengeId);
  }, [challengeId, challenge, ensureChallenge]);

  // Teksten skal passe, ellers er det en udfordring, der er trukket uden afstemning.
  if (!challenge || challenge.text !== text) return null;

  const outcome = challengeOutcome(challenge.id, votes, memberIds);
  const mine = votes.find((v) => v.challenge_id === challenge.id && v.user_id === userId);
  const target = challenge.target_user_id
    ? (members.find((m) => m.user_id === challenge.target_user_id) ?? null)
    : null;
  const winner = challenge.target_user_id ? (target?.name ?? "den trukne") : "hele holdet";
  const missing = outcome.needed - outcome.total;

  const status = outcome.completed
    ? `Klaret · 1 point til ${winner}`
    : missing > 0
      ? `${missing === 1 ? "Én stemme" : `${missing} stemmer`} mere, så tæller den · point til ${winner}`
      : "Ikke klaret endnu. Flertallet siger nej.";

  return (
    <div className="flex flex-col gap-2.5 border-t pt-3" style={{ borderColor: "rgba(201,162,74,.35)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="pc-label" style={{ color: "var(--gold-300)" }}>
          Klarede I den?
        </p>
        <p className="text-[13px] tabular-nums" style={{ color: "rgba(251,245,230,.75)" }}>
          <span key={`d${outcome.done}`} className="pc-pop inline-block">
            {outcome.done}
          </span>{" "}
          klaret ·{" "}
          <span key={`n${outcome.notDone}`} className="pc-pop inline-block">
            {outcome.notDone}
          </span>{" "}
          ikke klaret
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant={mine?.done === true ? "gold" : "secondary"}
          className="flex-1"
          icon={Check}
          aria-pressed={mine?.done === true}
          onClick={() => void vote(challenge, true)}
        >
          Klaret
        </Button>
        <Button
          variant={mine?.done === false ? "gold" : "secondary"}
          className="flex-1"
          icon={X}
          aria-pressed={mine?.done === false}
          onClick={() => void vote(challenge, false)}
        >
          Ikke klaret
        </Button>
      </div>
      <p
        key={status}
        role="status"
        className="pc-fade-in text-sm"
        style={{ color: outcome.completed ? "var(--gold-500)" : "rgba(251,245,230,.75)" }}
      >
        {status}
      </p>
    </div>
  );
}
