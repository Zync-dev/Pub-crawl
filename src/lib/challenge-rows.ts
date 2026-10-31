import type { SupabaseClient } from "@supabase/supabase-js";
import type { Challenge } from "./games-types";

// Gemmer en trukket udfordring som en række, så holdet kan stemme om den.
// Giver null tilbage, hvis det ikke lykkedes. Så vises teksten stadig, bare uden afstemning.
export async function insertChallenge(
  supabase: SupabaseClient,
  row: Pick<Challenge, "crawl_id" | "stop_id" | "text" | "target_user_id">,
) {
  const { data, error } = await supabase
    .from("challenges")
    .insert({ ...row, text: row.text.slice(0, 300) })
    .select("id")
    .single<{ id: string }>();
  return error || !data ? null : data.id;
}
