"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { describeResult } from "@/lib/games";
import type { GameResult } from "@/lib/games-types";
import type { Member } from "@/lib/types";
import { useGames } from "@/lib/use-games";
import { useAsk } from "../ask";

type GamesContextValue = ReturnType<typeof useGames> & {
  members: Member[];
  userId: string;
  describe: (result: GameResult) => string | null;
};

const GamesContext = createContext<GamesContextValue | null>(null);

export function useGamesContext() {
  const games = useContext(GamesContext);
  if (!games) throw new Error("useGamesContext skal bruges inden i GamesProvider");
  return games;
}

// Én kanal til udfordringspoint og spil for hele turen, så Nu, Stillingen og Spil deler den.
// Resultater fra de andre vises som en toast, uanset hvilken fane man står på.
export function GamesProvider({
  crawlId,
  userId,
  members,
  children,
}: {
  crawlId: string;
  userId: string;
  members: Member[];
  children: ReactNode;
}) {
  const ask = useAsk();
  const describe = useCallback((result: GameResult) => describeResult(result, members), [members]);
  const onRemoteResult = useCallback(
    (result: GameResult) => {
      const message = describe(result);
      if (message) ask.toast(message);
    },
    [ask, describe],
  );
  const onError = useCallback(() => ask.toast("Stemmen kom ikke med. Prøv igen.", "danger"), [ask]);
  const games = useGames(crawlId, userId, { onRemoteResult, onError });
  const value = useMemo(() => ({ ...games, members, userId, describe }), [games, members, userId, describe]);
  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>;
}
