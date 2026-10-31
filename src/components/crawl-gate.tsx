"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { readName, saveName } from "@/lib/name";
import { rememberCrawl } from "@/lib/recent";
import { ensureUser, errorText, getSupabase, supabaseConfigured } from "@/lib/supabase";
import type { Crawl } from "@/lib/types";
import { AskProvider } from "./ask";
import { CrawlApp } from "./crawl-app";
import { Button, Input, Logo, Spinner } from "./ds";

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
    return (
      <AskProvider>
        <CrawlApp initial={state.crawl} userId={state.userId} />
      </AskProvider>
    );
  }

  return (
    <Splash>
      {state.step === "loading" && (
        <div className="pc-fade-in flex flex-col items-center gap-3 text-gold-500">
          <Spinner size={26} label="Henter turen" />
          <p className="pc-eyebrow text-gold-300">Henter turen</p>
        </div>
      )}
      {state.step === "error" && (
        <Panel>
          <p className="mb-4 text-oxblood-500">{state.message}</p>
          <Button variant="primary" fullWidth onClick={() => void load()}>
            Prøv igen
          </Button>
        </Panel>
      )}
      {state.step === "missing" && (
        <Panel>
          <p className="pc-label mb-2 text-oxblood-700">Ingen tur</p>
          <p className="mb-4">
            Der findes ingen tur med koden <strong>{code}</strong>.
          </p>
          <Link href="/" className="pc-btn pc-btn--secondary pc-btn--full">
            Til forsiden
          </Link>
        </Panel>
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
    </Splash>
  );
}

function Splash({ children }: { children: ReactNode }) {
  return (
    <main className="pc-on-dark flex min-h-dvh flex-1 flex-col bg-green-800 px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(48px,env(safe-area-inset-top))]">
      <div className="pc-fade-in flex flex-1 items-center justify-center py-6">
        <Logo size={0.8} />
      </div>
      <div className="mx-auto w-full max-w-sm">{children}</div>
    </main>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="pc-enter rounded-[var(--radius-md)] bg-cream-100 p-5 text-body" style={{ border: "var(--rule-double)" }}>
      {children}
    </div>
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
    // En forkert kode giver en tom række i stedet for en fejl (databasen tæller forsøgene).
    if (error || !data?.id) {
      setError(errorText(error ?? { message: "crawl_not_found" }));
      setBusy(false);
      return;
    }
    onJoined(data);
  }

  return (
    <Panel>
      <p className="pc-label text-oxblood-700">
        Du er inviteret · {memberCount === 1 ? "1 er med" : `${memberCount} er med`}
      </p>
      <h1 className="mb-4 mt-2 font-serif text-[34px] italic leading-[1.05]">{crawlName}</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label="Dit navn"
          icon="user"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="Fx Freja"
          autoComplete="given-name"
          error={error}
          required
        />
        <Button type="submit" variant="primary" size="lg" fullWidth iconRight="chevron-right" loading={busy}>
          {busy ? "Hopper med" : "Hop med på turen"}
        </Button>
      </form>
    </Panel>
  );
}
