// Typer til udfordringspoint og spillene under Spil (migration 0006_games.sql).

export type Challenge = {
  id: string;
  crawl_id: string;
  stop_id: string | null;
  text: string;
  // null betyder, at udfordringen er til hele holdet.
  target_user_id: string | null;
  created_at: string;
};

export type ChallengeVote = {
  challenge_id: string;
  crawl_id: string;
  user_id: string;
  done: boolean;
  voted_at: string;
};

// Det, der sendes til holdet over Realtime broadcast. Gemmes ikke nogen steder.
// Navnene slås op hos modtageren, så beskeden altid passer med holdet.
export type GameKind = "pick" | "dice" | "coin";

type GameBase = { id: string; from: string; at: string };

export type GameResult =
  | (GameBase & { kind: "pick"; pick: string; text: string | null })
  | (GameBase & { kind: "dice"; dice: number[] })
  | (GameBase & { kind: "coin"; coin: CoinSide });

export type CoinSide = "plat" | "krone";
