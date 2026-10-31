"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { readName, saveName } from "@/lib/name";
import { rememberCrawl } from "@/lib/recent";
import { ensureUser, errorText, getSupabase, supabaseConfigured } from "@/lib/supabase";
import type { Crawl } from "@/lib/types";
import { CrawlApp } from "./crawl-app";
import { Button, Card, Input, Label } from "./ui";

type State =
  | { step: "loading" }
  | { step: "error"; message: string }
  | { step: "invite"; name: string; memberCount: number; userId: string }
  | { step: "missing" }
  | { step: "ready"; crawl: Crawl; userId: string };

// Finder ud af, om man allerede er med på turen, og viser ellers invitationen.
export function CrawlGate({ code }: { code: string }) {
  const [state, setState] = useState<State>({ step: "loading" });

  const load = useCallback(async () => {
    try {
      const user = await ensureUser();
      const supabase = getSupabase();
      const { data: crawl } = await supabase
        .from("crawls")
        .select("*")
        .eq("code", code)
        .maybeSingle<Crawl>();
      if (crawl) {
        rememberCrawl({ code: crawl.code, name: crawl.name });
        setState({ step: "ready", crawl, userId: user.id });
        return;
      }
      const { data: preview, error } = await supabase
        .rpc("crawl_preview", { p_code: code })
        .maybeSingle<{ name: string; member_count: number }>();
      if (error) throw error;
      if (!preview) setState({ step: "missing" });
      else
        setState({
          step: "invite",
          name: preview.name,
          memberCount: preview.member_count,
          userId: user.id,
        });
    } catch (err) {
      setState({ step: "error", message: errorText(err) });
    }
  }, [code]);

  useEffect(() => {
    if (!supabaseConfigured()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ step: "error", message: "Supabase er ikke sat op endnu." });
      return;
    }
    void load();
  }, [load]);

  if (state.step === "ready") {
    return <CrawlApp initial={state.crawl} userId={state.userId} />;
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      {state.step === "loading" && <p className="text-center text-muted">Henter turen…</p>}
      {state.step === "error" && (
        <Card>
          <p className="mb-3 text-danger">{state.message}</p>
          <Button variant="secondary" onClick={() => void load()}>
            Prøv igen
          </Button>
        </Card>
      )}
      {state.step === "missing" && (
        <Card>
          <p className="mb-3">
            Der findes ingen tur med koden <span className="font-mono">{code}</span>.
          </p>
          <Link href="/" className="text-gold underline">
            Til forsiden
          </Link>
        </Card>
      )}
      {state.step === "invite" && (
        <JoinForm
          code={code}
          crawlName={state.name}
          memberCount={state.memberCount}
          onJoined={(crawl) => {
            rememberCrawl({ code: crawl.code, name: crawl.name });
            setState({ step: "ready", crawl, userId: state.userId });
          }}
        />
      )}
    </main>
  );
}

function JoinForm({
  code,
  crawlName,
  memberCount,
  onJoined,
}: {
  code: string;
  crawlName: string;
  memberCount: number;
  onJoined: (crawl: Crawl) => void;
}) {
  const [name, setName] = useState(() => readName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    saveName(name);
    const { data, error } = await getSupabase()
      .rpc("join_crawl", { p_code: code, p_member_name: name })
      .single<Crawl>();
    if (error || !data) {
      setError(errorText(error));
      setBusy(false);
      return;
    }
    onJoined(data);
  }

  return (
    <Card>
      <p className="text-sm uppercase tracking-[0.2em] text-gold">Du er inviteret</p>
      <h1 className="mt-1 text-2xl font-bold">{crawlName}</h1>
      <p className="mb-4 text-muted">
        {memberCount === 1 ? "1 er med" : `${memberCount} er med`}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label>
          <Label>Dit navn</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            autoComplete="given-name"
            required
          />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? "Hopper med…" : "Hop med"}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Card>
  );
}
