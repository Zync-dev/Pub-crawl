import { createClient } from "@supabase/supabase-js";
import webpush, { WebPushError } from "web-push";
import { isPushEndpoint } from "@/lib/push-endpoint";

// Sender en besked til holdet. Kaldes af appen med brugerens egen adgangsnøgle. Ruten tjekker nøglen
// og spørger så databasen med serverens hemmelige nøgle, så modtagernes endpoints og nøgler aldrig
// når en browser. Appen siger kun, hvad der er sket (kind og key). Databasen (crew_push) tjekker, at det
// faktisk er sket, at man er med på turen, og at beskeden ikke er sendt før, og skriver selv titel, tekst
// og link. Så kan ingen sende en falsk besked.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(["timer", "move", "rollcall", "round"]);
// Kun stier i appen, så en besked aldrig kan sende nogen ud på en fremmed side.
const PATH = /^\/(?!\/)[A-Za-z0-9\-._~/?=&%]{0,199}$/;
// Et hold på 30 med fem apparater hver er 150. Ingen besked skal ud til flere end det.
const MAX_TARGETS = 150;

type Body = { crawlId: string; kind: string; key: string };
type Target = { endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string };

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

function parse(raw: unknown): Body | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const crawlId = typeof r.crawlId === "string" ? r.crawlId : "";
  const kind = typeof r.kind === "string" ? r.kind : "";
  const key = typeof r.key === "string" ? r.key : "";
  if (!UUID.test(crawlId) || !KINDS.has(kind) || !key || key.length > 200) return null;
  return { crawlId, kind, key };
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Kun på serveren. Må aldrig ligge i en NEXT_PUBLIC_-variabel.
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!supabaseUrl || !supabaseKey || !publicKey || !privateKey || !subject) {
    return fail(503, "push_not_configured");
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > 4096) return fail(401, "not_authenticated");

  const raw = await request.text();
  if (raw.length > 4096) return fail(413, "too_large");
  let input: Body | null = null;
  try {
    input = parse(JSON.parse(raw));
  } catch {
    input = null;
  }
  if (!input) return fail(400, "invalid_input");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Hvem sender? Auth-serveren tjekker nøglen, før databasen får brugerens id.
  const { data: who, error: authError } = await supabase.auth.getUser(token);
  if (authError || !who.user) return fail(401, "not_authenticated");

  const { data, error } = await supabase.rpc("crew_push", {
    p_crawl: input.crawlId,
    p_kind: input.kind,
    p_key: input.key,
    p_user: who.user.id,
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("not_member")) return fail(403, "not_member");
    if (message.includes("rate_limited")) return fail(429, "rate_limited");
    // Timeren er ikke gået endnu (telefonens ur kan gå lidt forkert). Appen prøver igen.
    if (message.includes("not_due")) return fail(409, "not_due");
    if (message.includes("invalid_notification")) return fail(400, "invalid_input");
    if (message.includes("not_authenticated")) return fail(401, "not_authenticated");
    return fail(500, "push_failed");
  }

  const targets = ((data ?? []) as Target[]).filter((t) => isPushEndpoint(t.endpoint)).slice(0, MAX_TARGETS);
  if (!targets.length) return Response.json({ sent: 0, dropped: 0 });

  // Teksten er den samme i alle rækker. Databasen har skrevet den.
  const { title, body, url } = targets[0];
  const payload = JSON.stringify({
    title,
    body,
    url: PATH.test(url) ? url : "/",
    tag: `${input.kind}:${input.crawlId}`,
  });
  const options: webpush.RequestOptions = {
    vapidDetails: { subject, publicKey, privateKey },
    TTL: 15 * 60,
    urgency: "high",
    timeout: 5000,
  };

  const results = await Promise.allSettled(
    targets.map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, options),
    ),
  );

  // Telefoner, der har slået beskeder fra eller er nulstillet, svarer 404 eller 410. De ryger ud.
  const dead = results.flatMap((r, i) =>
    r.status === "rejected" &&
    r.reason instanceof WebPushError &&
    (r.reason.statusCode === 404 || r.reason.statusCode === 410)
      ? [targets[i].endpoint]
      : [],
  );
  if (dead.length) {
    await supabase.rpc("drop_push_endpoints", { p_crawl: input.crawlId, p_endpoints: dead.slice(0, 50) });
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return Response.json({ sent, dropped: dead.length });
}
