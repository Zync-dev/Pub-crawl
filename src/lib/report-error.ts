// Fejlrapporter fra telefonerne. Rapporterne lander i client_errors, som kun kan læses i Supabase.
// Reporteren må aldrig selv kaste en fejl: alt herinde er pakket ind i try/catch.

export type ErrorRow = {
  crawl_code: string | null;
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
};

// Samme grænser som databasen (0010_quality.sql).
export const LIMITS = { message: 1000, stack: 4000, url: 2000, userAgent: 500 } as const;

// Støj, som ikke er vores fejl og ikke kan bruges til noget.
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i];

function clip(value: string, max: number) {
  return value.length > max ? value.slice(0, max) : value;
}

// Gør et hvilket som helst kastet værdi til en besked og en stak.
export function describeError(error: unknown): { message: string; stack: string | null } {
  try {
    if (error instanceof Error) {
      const digest = "digest" in error && typeof error.digest === "string" ? error.digest : null;
      const base = error.message || error.name || "Error";
      return {
        message: clip(digest ? `${base} (digest ${digest})` : base, LIMITS.message),
        stack: error.stack ? clip(error.stack, LIMITS.stack) : null,
      };
    }
    if (typeof error === "string") return { message: clip(error || "Tom fejl", LIMITS.message), stack: null };
    if (error && typeof error === "object" && "message" in error) {
      return { message: clip(String((error as { message: unknown }).message), LIMITS.message), stack: null };
    }
    let text: string;
    try {
      text = JSON.stringify(error) ?? String(error);
    } catch {
      text = String(error);
    }
    return { message: clip(text || "Ukendt fejl", LIMITS.message), stack: null };
  } catch {
    return { message: "Ukendt fejl", stack: null };
  }
}

// /t/ABC123 → "ABC123", så vi kan se, hvilken tur fejlen skete på.
export function crawlCodeFromPath(pathname: string) {
  const match = /^\/t\/([A-Za-z0-9]{6})(?:\/|$)/.exec(pathname);
  return match ? match[1].toUpperCase() : null;
}

type ReporterOptions = {
  send: (row: ErrorRow) => Promise<unknown>;
  now?: () => number;
  // Højst så mange rapporter pr. vindue (databasen tillader 30 i timen).
  burst?: number;
  windowMs?: number;
  // Samme besked sendes kun én gang pr. sideindlæsning.
  maxDistinct?: number;
};

export function createReporter({
  send,
  now = () => Date.now(),
  burst = 5,
  windowMs = 60_000,
  maxDistinct = 50,
}: ReporterOptions) {
  const seen = new Set<string>();
  let sentAt: number[] = [];

  return function report(error: unknown) {
    try {
      const { message, stack } = describeError(error);
      if (IGNORED.some((re) => re.test(message))) return false;
      if (seen.has(message)) return false;
      const t = now();
      sentAt = sentAt.filter((at) => t - at < windowMs);
      if (sentAt.length >= burst) return false;
      if (seen.size >= maxDistinct) return false;
      seen.add(message);
      sentAt.push(t);

      const loc = typeof window !== "undefined" ? window.location : null;
      const row: ErrorRow = {
        crawl_code: loc ? crawlCodeFromPath(loc.pathname) : null,
        message,
        stack,
        url: loc ? clip(loc.href, LIMITS.url) : null,
        user_agent: typeof navigator !== "undefined" ? clip(navigator.userAgent, LIMITS.userAgent) : null,
      };
      // Sendingen må gerne fejle stille (offline, ingen session, rate limit).
      Promise.resolve()
        .then(() => send(row))
        .catch(() => {});
      return true;
    } catch {
      return false;
    }
  };
}

// Sender kun, når man allerede er logget ind. Reporteren opretter aldrig selv en anonym bruger.
async function sendToSupabase(row: ErrorRow) {
  // I udvikling er fejlene støj fra hot reload, så de bliver i konsollen.
  if (process.env.NODE_ENV !== "production") return;
  const { getSupabase, supabaseConfigured } = await import("./supabase");
  if (!supabaseConfigured()) return;
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  await supabase.from("client_errors").insert(row);
}

export const reportError = createReporter({ send: sendToSupabase });
