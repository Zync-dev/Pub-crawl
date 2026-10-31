import type { RollCall, RollCallAnswer } from "./roll-call";
import { getSupabase } from "./supabase";

// Fortryd på Videre: lukker det opråb, Videre startede fra pubben, hvis ingen andre end
// den, der startede det, har svaret. Har nogen svaret, får opråbet lov at leve sit eget liv.
// Giver true, når opråbet blev lukket.
export async function closeUnansweredRollCall(crawlId: string, fromStopId: string, userId: string) {
  const supabase = getSupabase();
  const { data: calls } = await supabase
    .from("roll_calls")
    .select("*")
    .eq("crawl_id", crawlId)
    .eq("from_stop_id", fromStopId)
    .eq("started_by", userId)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<RollCall[]>();
  const call = calls?.[0];
  if (!call) return false;
  const { data: answers, error } = await supabase
    .from("roll_call_answers")
    .select("*")
    .eq("roll_call_id", call.id)
    .returns<RollCallAnswer[]>();
  if (error || !answers || answers.some((a) => a.user_id !== call.started_by)) return false;
  const closed = await supabase.rpc("close_roll_call", { p_roll_call: call.id });
  return !closed.error;
}
