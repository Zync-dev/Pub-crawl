import { createClient } from "@supabase/supabase-js";
import webpush, { WebPushError } from "web-push";

// Sender en besked til holdet. Kaldes af appen med brugerens egen adgangsnøgle, så databasen
// selv tjekker, at man er med på turen, og at den samme besked ikke er sendt før (push_targets).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND = /^[a-z_]{1,20}$/;
// Kun stier i appen, så en besked aldrig kan sende nogen ud på en fremmed side.
const PATH = /^\/(?!\/)[A-Za-z0-9\-._~/?=&%]{0,199}$/;

type Body = { crawlId: string; kind: string; key: string; title: string; body: string; url: string };
type Target = { endpoint: string; p256dh: string; auth: string };

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parse(raw: unknown): Body | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const crawlId = typeof r.crawlId === "string" ? r.crawlId : "";
  const kind = typeof r.kind === "string" ? r.kind : "";
  const key = typeof r.key === "string" ? r.key : "";
  const title = text(r.title, 80);
  const body = text(r.body, 200);
  const url = typeof r.url === "string" && r.url ? r.url : "/";
  if (!UUID.test(crawlId) || !KIND.test(kind) || !key || key.length > 200 || !title || !PATH.test(url)) return null;
  return { crawlId, kind, key, title, body, url };
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
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

  // En klient, der taler med databasen som den bruger, der sendte nøglen.
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.rpc("push_targets", {
    p_crawl: input.crawlId,
    p_kind: input.kind,
    p_key: input.key,
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("not_member")) return fail(403, "not_member");
    if (message.includes("rate_limited")) return fail(429, "rate_limited");
    if (message.includes("invalid_notification")) return fail(400, "invalid_input");
    if (message.includes("not_authenticated") || error.code === "PGRST301" || error.code === "PGRST303") {
      return fail(401, "not_authenticated");
    }
    return fail(500, "push_failed");
  }

  const targets = (data ?? []) as Target[];
  if (!targets.length) return Response.json({ sent: 0, dropped: 0 });

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url,
    tag: `${input.kind}:${input.crawlId}`,
  });
  const options: webpush.RequestOptions = {
    vapidDetails: { subject, publicKey, privateKey },
    TTL: 15 * 60,
    urgency: "high",
    timeout: 8000,
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
