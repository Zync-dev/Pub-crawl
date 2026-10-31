"use client";

import { Coins, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Shuffle, Trophy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { challengePoints } from "@/lib/challenge-points";
import { COIN_LABEL, PICK_TEXT_MAX, cleanPickText, flipCoin, pickRandom, reelSequence, rollDice } from "@/lib/games";
import type { CoinSide, GameResult } from "@/lib/games-types";
import { formatTime } from "@/lib/timer";
import type { Member } from "@/lib/types";
import { Button, Card, Icon, Input, SectionTitle } from "../ds";
import { useGamesContext } from "./games-provider";
import { prefersReducedMotion, useRoll } from "./use-roll";

const DICE = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
// Vinduet er 64px med en 4px dobbeltstreg i hver side, så hver række er 56px.
const WINDOW = 64;
const ROW = WINDOW - 8;
const REEL_MS = 1200;

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Fanen Spil: små tilfældigheder til bordet. Resultaterne sendes til hele holdet.
export function GamesTab({ onOpenPoints }: { onOpenPoints: () => void }) {
  return (
    <div className="flex flex-col gap-4 px-4 py-[18px]">
      <WhoPicker />
      <DiceCard />
      <CoinCard />
      <PointsShortcut onOpenPoints={onOpenPoints} />
      <Feed />
    </div>
  );
}

function WhoPicker() {
  const { members, userId, share } = useGamesContext();
  const [text, setText] = useState("");
  const [spin, setSpin] = useState<{ key: number; sequence: Member[]; picked: Member; text: string | null } | null>(
    null,
  );
  const [revealed, setRevealed] = useState(true);
  const reel = useRef<HTMLDivElement>(null);
  const finished = useRef<number | null>(null);

  const finish = useCallback(
    (s: NonNullable<typeof spin>) => {
      if (finished.current === s.key) return;
      finished.current = s.key;
      setRevealed(true);
      try {
        navigator.vibrate?.(30);
      } catch {}
      share({ id: newId(), kind: "pick", from: userId, at: new Date().toISOString(), pick: s.picked.user_id, text: s.text });
    },
    [share, userId],
  );

  // Hjulet glider ned til den valgte på højst 1,2 sekunder. Uden bevægelse springer det direkte dertil.
  useEffect(() => {
    const el = reel.current;
    if (!spin || !el) return;
    const end = `translateY(-${(spin.sequence.length - 1) * ROW}px)`;
    const still = prefersReducedMotion();
    el.style.transition = "none";
    el.style.transform = still ? end : "translateY(0)";
    if (still) {
      finish(spin);
      return;
    }
    void el.offsetHeight;
    el.style.transition = `transform ${REEL_MS}ms cubic-bezier(.12,.75,.25,1)`;
    el.style.transform = end;
    const timer = setTimeout(() => finish(spin), REEL_MS);
    return () => {
      clearTimeout(timer);
      finish(spin);
    };
  }, [spin, finish]);

  function go() {
    const picked = pickRandom(members);
    if (!picked) return;
    setRevealed(false);
    setSpin({ key: Date.now(), sequence: reelSequence(members, picked), picked, text: cleanPickText(text) });
  }

  const tooFew = members.length < 2;

  return (
    <Card variant="framed" className="flex flex-col gap-3">
      <SectionTitle eyebrow="Lad tilfældet bestemme" title="Hvem skal …?" />
      <Input
        label="Hvad skal de? (valgfrit)"
        placeholder="hente vand"
        value={text}
        maxLength={PICK_TEXT_MAX}
        onChange={(e) => setText(e.target.value)}
        enterKeyHint="go"
        onKeyDown={(e) => {
          if (e.key === "Enter" && revealed && !tooFew) go();
        }}
      />
      <div
        className="relative overflow-hidden rounded-[var(--radius-sm)] bg-green-800"
        style={{ height: WINDOW, border: "var(--rule-double)" }}
        aria-live="polite"
      >
        {spin ? (
          <div ref={reel} style={{ willChange: "transform" }} aria-hidden={!revealed}>
            {spin.sequence.map((m, i) => (
              <div
                key={i}
                className="flex items-center justify-center truncate px-4 font-serif text-[28px]"
                style={{
                  height: ROW,
                  color:
                    revealed && i === spin.sequence.length - 1 ? "var(--gold-500)" : "var(--cream-100)",
                  transition: "color var(--dur-base) var(--ease)",
                }}
              >
                {m.name}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-[15px]" style={{ color: "var(--gold-300)" }}>
            {tooFew ? "Der skal være mindst to på holdet" : `${members.length} på holdet. Én bliver valgt.`}
          </div>
        )}
      </div>
      {spin && revealed && (
        <p key={spin.key} className="pc-enter text-center font-serif text-[22px] leading-tight" role="status">
          {spin.text ? `${spin.picked.name} blev valgt: ${spin.text}` : `${spin.picked.name} blev valgt`}
        </p>
      )}
      <Button variant="gold" size="lg" fullWidth icon={Shuffle} disabled={tooFew || !revealed} onClick={go}>
        {spin ? "Vælg igen" : "Vælg en"}
      </Button>
    </Card>
  );
}

function DiceCard() {
  const { userId, share } = useGamesContext();
  const [count, setCount] = useState<1 | 2>(2);
  const roll = useRoll<number[]>();
  const faces = roll.value;

  function go() {
    roll.start(
      rollDice(count),
      () => rollDice(count),
      (dice) => share({ id: newId(), kind: "dice", from: userId, at: new Date().toISOString(), dice }),
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle
        eyebrow="Terninger"
        title="Slå med terningen"
        right={
          <div className="flex gap-1.5" role="group" aria-label="Antal terninger">
            {([1, 2] as const).map((n) => (
              <Button
                key={n}
                size="sm"
                variant={count === n ? "primary" : "ghost"}
                aria-pressed={count === n}
                onClick={() => setCount(n)}
                style={{ minHeight: 44 }}
              >
                {n}
              </Button>
            ))}
          </div>
        }
      />
      <div className="flex min-h-24 items-center justify-center gap-4" aria-live="polite">
        {faces ? (
          <>
            {faces.map((n, i) => (
              <span
                key={roll.rolling ? i : `${i}-${n}-final`}
                className={roll.rolling ? undefined : "pc-pop"}
                style={{ opacity: roll.rolling ? 0.7 : 1 }}
              >
                <Icon name={DICE[n - 1]} size={76} color="var(--green-800)" />
              </span>
            ))}
            {!roll.rolling && faces.length === 2 && (
              <span className="pc-fade-in font-serif text-[34px] leading-none tabular-nums text-green-800">
                = {faces[0] + faces[1]}
              </span>
            )}
            <span className="sr-only">
              {roll.rolling ? "Slår" : `Slog ${faces.join(" og ")}`}
            </span>
          </>
        ) : (
          <Icon name={count === 2 ? DICE[4] : DICE[0]} size={76} color="var(--border-strong)" />
        )}
      </div>
      <Button variant="primary" fullWidth icon={DICE[count === 2 ? 4 : 2]} disabled={roll.rolling} onClick={go}>
        {count === 2 ? "Slå med to" : "Slå med én"}
      </Button>
    </Card>
  );
}

function CoinCard() {
  const { userId, share } = useGamesContext();
  const flip = useRoll<CoinSide>(600, 110);
  const side = flip.value;
  const other = (s: CoinSide | null): CoinSide => (s === "plat" ? "krone" : "plat");

  function go() {
    let shown: CoinSide | null = null;
    flip.start(
      flipCoin(),
      () => {
        shown = other(shown);
        return shown;
      },
      (coin) => share({ id: newId(), kind: "coin", from: userId, at: new Date().toISOString(), coin }),
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle eyebrow="Når I ikke kan blive enige" title="Plat eller krone" />
      <div className="flex justify-center" aria-live="polite">
        <span
          className="flex items-center justify-center rounded-full bg-gold-500"
          style={{ width: 104, height: 104, border: "4px double var(--green-800)" }}
        >
          {side ? (
            <span
              key={flip.rolling ? "spin" : `final-${side}`}
              className={`font-serif text-[26px] italic text-green-900${flip.rolling ? "" : " pc-pop"}`}
              style={{ opacity: flip.rolling ? 0.7 : 1 }}
            >
              {COIN_LABEL[side]}
            </span>
          ) : (
            <Icon name={Coins} size={40} color="var(--green-900)" />
          )}
        </span>
      </div>
      <Button variant="primary" fullWidth icon={Coins} disabled={flip.rolling} onClick={go}>
        Slå plat eller krone
      </Button>
    </Card>
  );
}

function PointsShortcut({ onOpenPoints }: { onOpenPoints: () => void }) {
  const { challenges, votes, members } = useGamesContext();
  const { scores, completed } = challengePoints(challenges, votes, members);
  const leader = scores[0] && scores[0].points > 0 ? scores[0] : null;
  const tied = leader ? scores.filter((s) => s.points === leader.points).length > 1 : false;

  const line = !challenges.length
    ? "Udfordringerne kommer, når I tjekker ind."
    : !leader
      ? "Ingen point endnu. Klar den næste udfordring."
      : tied
        ? `Delt føring med ${leader.points} point`
        : `${leader.member.name} fører med ${leader.points} point`;

  return (
    <Card variant="inverse" className="pc-on-dark flex items-center gap-3">
      <Icon name={Trophy} size={28} color="var(--gold-500)" />
      <div className="min-w-0 flex-1">
        <p className="pc-label" style={{ color: "var(--gold-300)" }}>
          Udfordringspoint{challenges.length ? ` · ${completed} klaret` : ""}
        </p>
        <p className="mt-1 truncate font-serif text-[19px] leading-tight">{line}</p>
      </div>
      <Button variant="secondary" size="sm" style={{ minHeight: 44 }} onClick={onOpenPoints}>
        Se tavlen
      </Button>
    </Card>
  );
}

function Feed() {
  const { feed, describe, userId } = useGamesContext();
  const rows = feed
    .map((r) => ({ r, text: describe(r) }))
    .filter((x): x is { r: GameResult; text: string } => x.text !== null);
  if (!rows.length) return null;
  return (
    <section>
      <SectionTitle eyebrow="Holdet ser det samme" title="Seneste" />
      <Card padding="4px 0">
        <ul className="divide-y divide-line">
          {rows.map(({ r, text }) => (
            <li key={r.id} className="pc-fade-in flex min-h-12 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 text-[15px]">{text}</span>
              <span className="shrink-0 text-[13px] tabular-nums text-muted">
                {r.from === userId ? "dig · " : ""}
                {formatTime(r.at)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
