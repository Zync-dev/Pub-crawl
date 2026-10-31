import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSupabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY mangler",
      );
    }
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

// Alle er anonyme brugere. Sessionen gemmes i browseren, så man er den samme hele aftenen.
export async function ensureUser() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user;
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signedIn.user) {
    throw error ?? new Error("Kunne ikke logge ind");
  }
  return signedIn.user;
}

const errorTexts: Record<string, string> = {
  crawl_not_found: "Der findes ingen tur med den kode.",
  crawl_full: "Turen er fuld.",
  too_many_crawls: "Du har oprettet for mange ture.",
  not_authenticated: "Du er ikke logget ind. Prøv at genindlæse siden.",
};

export function errorText(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  for (const [key, text] of Object.entries(errorTexts)) {
    if (message.includes(key)) return text;
  }
  if (message.toLowerCase().includes("anonymous sign-ins are disabled")) {
    return "Anonym login er slået fra i Supabase (Authentication → Sign In / Providers).";
  }
  return "Noget gik galt. Prøv igen.";
}
