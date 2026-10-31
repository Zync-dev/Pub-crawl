"use client";

import { ScrollText } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ensureUser, errorText, getSupabase, supabaseConfigured } from "@/lib/supabase";
import type { Crawl } from "@/lib/types";
import { AskProvider } from "../ask";
import { Button, Icon, Spinner } from "../ds";
import { HomeLink, StatusScreen } from "../status-screen";
import { RecapView } from "./recap-view";

type State =
  | { step: "loading" }
  | { step: "error"; message: string }
  | { step: "outside" }
  | { step: "ready"; crawl: Crawl; userId: string };

// Regnskabet er kun for holdet. Er man ikke med, sendes man til invitationen på /t/[code].
export function RecapGate({ code }: { code: string }) {
  const [state, setState] = useState<State>({ step: "loading" });

  const load = useCallback(async () => {
    try {
      const user = await ensureUser();
      const { data: crawl, error } = await getSupabase()
        .from("crawls")
        .select("*")
        .eq("code", code)
        .maybeSingle<Crawl>();
      if (error) throw error;
      setState(crawl ? { step: "ready", crawl, userId: user.id } : { step: "outside" });
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
        <RecapView initial={state.crawl} userId={state.userId} />
      </AskProvider>
    );
  }

  if (state.step === "loading") return <RecapLoading />;

  if (state.step === "error") {
    return (
      <StatusScreen
        eyebrow="Aftenens regnskab"
        title="Regnskabet kom ikke frem"
        actions={
          <>
            <Button variant="primary" size="lg" fullWidth onClick={() => void load()}>
              Prøv igen
            </Button>
            <HomeLink />
          </>
        }
      >
        <p className="text-oxblood-500">{state.message}</p>
      </StatusScreen>
    );
  }

  return (
    <StatusScreen
      eyebrow="Aftenens regnskab"
      title="Regnskabet er for holdet"
      actions={
        <>
          <Link href={`/t/${encodeURIComponent(code)}`} className="pc-btn pc-btn--primary pc-btn--lg pc-btn--full">
            <Icon name={ScrollText} size={20} />
            Til turen
          </Link>
          <HomeLink />
        </>
      }
    >
      <p>Hop med på turen med koden {code}, så kan du se regnskabet.</p>
    </StatusScreen>
  );
}

export function RecapLoading() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 bg-green-800 text-gold-500">
      <Spinner size={26} label="Gør regnskabet op" />
      <p className="pc-eyebrow text-gold-300">Gør regnskabet op</p>
    </main>
  );
}
