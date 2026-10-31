"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { describeResult } from "@/lib/games";
import type { GameResult } from "@/lib/games-types";
import type { Member } from "@/lib/types";
import { useGames } from "@/lib/use-games";
import { useAsk } from "../ask";

type GamesContextValue = ReturnType<typeof useGames> & {
  members: Member[];
  userId: string;
  // Udfordringen, der er i gang nu. Den tæller med i alt, også før nogen har stemt.
  currentChallengeId: string | null;
  describe: (result: GameResult) => string | null;
};

const GamesContext = createContext<GamesContextValue | null>(null);

// Højst én toast for andres spil pr. 10 sekunder. Resten står under Spil > Seneste.
const REMOTE_TOAST_GAP_MS = 10_000;

export function useGamesContext() {
  const games = useContext(GamesContext);
  if (!games) throw new Error("useGamesContext skal bruges inden i GamesProvider");
  return games;
}

// Én kanal til udfordringspoint og spil for hele turen, så Nu, Stillingen og Spil deler den.
// Resultater fra de andre vises som en stille toast på de andre faner. Den skubber aldrig en
// toast med Fortryd væk, og under Spil står de i forvejen i Seneste.
export function GamesProvider({
  crawlId,
  userId,
  members,
  currentChallengeId = null,
  toastResults = true,
  children,
}: {
  crawlId: string;
  userId: string;
  members: Member[];
  currentChallengeId?: string | null;
  toastResults?: boolean;
  children: ReactNode;
}) {
  const ask = useAsk();
  const lastToast = useRef(0);
  const showToasts = useRef(toastResults);
  useEffect(() => {
    showToasts.current = toastResults;
  }, [toastResults]);
  const describe = useCallback((result: GameResult) => describeResult(result, members, userId), [members, userId]);
  const onRemoteResult = useCallback(
    (result: GameResult) => {
      if (!showToasts.current) return;
      const now = Date.now();
      if (now - lastToast.current < REMOTE_TOAST_GAP_MS) return;
      const message = describe(result);
      if (!message) return;
      lastToast.current = now;
      ask.toast(message, { quiet: true });
    },
    [ask, describe],
  );
  const onError = useCallback(() => ask.toast("Stemmen kom ikke med. Prøv igen.", "danger"), [ask]);
  const games = useGames(crawlId, userId, { onRemoteResult, onError });
  const value = useMemo(
    () => ({ ...games, members, userId, currentChallengeId, describe }),
    [games, members, userId, currentChallengeId, describe],
  );
  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>;
}
