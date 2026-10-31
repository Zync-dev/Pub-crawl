// Stjerner og billeder (migration 0007_pub_reviews).

export type StopRating = {
  stop_id: string;
  crawl_id: string;
  user_id: string;
  stars: number;
  created_at: string;
  updated_at: string;
};

export type Photo = {
  id: string;
  crawl_id: string;
  stop_id: string | null;
  user_id: string;
  path: string;
  width: number | null;
  height: number | null;
  created_at: string;
};

export type RatingSummary = {
  average: number;
  count: number;
  mine: number | null;
};

// Et billede, der er ved at blive lagt op. Vises som en spinner i rækken.
export type PendingPhoto = { id: string; stopId: string | null };
