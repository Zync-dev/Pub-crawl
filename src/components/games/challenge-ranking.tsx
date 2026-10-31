"use client";

import { challengePoints, competitionRanks } from "@/lib/challenge-points";
import { memberTone } from "@/lib/colors";
import { Avatar, Badge, Card, SectionTitle } from "../ds";
import { useGamesContext } from "./games-provider";

// Pointtavlen for udfordringer i Stillingen. Vises først, når der er trukket en udfordring.
export function ChallengeRanking() {
  const { challenges, votes, members, userId, currentChallengeId } = useGamesContext();
  if (!challenges.length || !members.length) return null;
  const { scores, completed, total } = challengePoints(challenges, votes, members, currentChallengeId);
  const top = scores[0]?.points ?? 0;
  const ranks = competitionRanks(scores);
  // "Fører" kun til én. Er føringen delt (fx efter en fællesudfordring), står det i overskriften.
  const leaders = top > 0 ? scores.filter((s) => s.points === top).length : 0;

  return (
    <section id="udfordringer" style={{ scrollMarginTop: 16 }}>
      <SectionTitle
        eyebrow={leaders > 1 ? "Udfordringer · delt føring" : "Udfordringer"}
        title="Hvem klarer dem?"
        right={
          <Badge tone="outline">
            {completed} af {total} klaret
          </Badge>
        }
      />
      <Card padding="4px 0">
        <ol className="divide-y divide-line">
          {scores.map((s, i) => {
            const me = s.member.user_id === userId;
            const leader = leaders === 1 && s.points === top;
            return (
              <li key={s.member.user_id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <span className="w-5 text-center font-serif text-[18px] text-muted">{ranks[i]}</span>
                <Avatar name={s.member.name} tone={memberTone(s.member.color)} size={32} ring={me} />
                <span className="min-w-0 flex-1 truncate font-serif text-[19px] leading-tight">
                  {s.member.name}
                  {me && <span className="text-muted"> (dig)</span>}
                </span>
                {leader && <Badge tone="gold">Fører</Badge>}
                <span className="w-12 text-right">
                  <span
                    key={s.points}
                    className="pc-pop block font-serif text-[24px] leading-none tabular-nums text-green-800"
                  >
                    {s.points}
                  </span>
                  <span className="pc-label text-muted">Point</span>
                </span>
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}
