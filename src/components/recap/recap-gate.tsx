"use client";

import { ChevronLeft, ScrollText } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureUser, errorText, getSupabase, supabaseConfigured } from "@/lib/supabase";
import type { Crawl } from "@/lib/types";
import { AskProvider } from "../ask";
import { Button, Icon } from "../ds";
import { HomeLink, StatusScreen } from "../status-screen";
import { RecapLoading, RecapView } from "./recap-view";

type State =
  | { step: "loading" }
  // again: et nyt forsøg fejlede også.
  | { step: "error"; message: string; again: boolean }
  | { step: "outside" }
  | { step: "missing" }
  | { step: "ready"; crawl: Crawl; userId: string };

// Regnskabet er kun for holdet. Er man ikke med, sendes man til invitationen på /t/[code].
export function RecapGate({ code }: { code: string }) {
  const [state, setState] = useState<State>({ step: "loading" });
  const [retrying, setRetrying] = useState(false);
  // Activity kører effekten igen, når den bevarede side vises. Er regnskabet først hentet,
  // klarer RecapView selv genhentningen og beholder det, den har, hvis nettet er væk.
  const ready = useRef(false);

  const load = useCallback(async () => {
    try {
      const user = await ensureUser();
      const supabase = getSupabase();
      const { data: crawl, error } = await supabase
        .from("crawls")
        .select("*")
        .eq("code", code)
        .maybeSingle<Crawl>();
      if (error) throw error;
      if (crawl) {
        ready.current = true;
        setState({ step: "ready", crawl, userId: user.id });
        return;
      }
      // Ikke med på holdet, eller findes koden slet ikke længere (fx efter en ny kode)?
      const { data: preview, error: previewError } = await supabase
        .rpc("crawl_preview", { p_code: code })
        .maybeSingle<{ name: string }>();
      if (previewError) throw previewError;
      setState({ step: preview ? "outside" : "missing" });
    } catch (err) {
      setState((prev) => ({ step: "error", message: errorText(err), again: prev.step === "error" }));
    }
  }, [code]);

  useEffect(() => {
    if (ready.current) return;
    if (!supabaseConfigured()) {
      setState({ step: "error", message: "Supabase er ikke sat op endnu.", again: false });
      return;
    }
    void load();
  }, [load]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await load();
    } finally {
      setRetrying(false);
    }
  }

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
            <Button variant="primary" size="lg" fullWidth loading={retrying} onClick={() => void retry()}>
              Prøv igen
            </Button>
            <Link href={`/t/${encodeURIComponent(code)}`} className="pc-btn pc-btn--secondary pc-btn--lg pc-btn--full">
              <Icon name={ChevronLeft} size={20} />
              Tilbage til turen
            </Link>
          </>
        }
      >
        {state.again && !retrying && <p className="pc-label mb-2 text-oxblood-700">Stadig intet svar</p>}
        <p className="text-oxblood-500">{state.message}</p>
      </StatusScreen>
    );
  }

  if (state.step === "missing") {
    return (
      <StatusScreen eyebrow="Aftenens regnskab" title="Ingen tur med den kode" actions={<HomeLink variant="primary" />}>
        <p>Der findes ingen tur med koden {code}.</p>
        <p className="mt-2 text-muted">Har arrangøren lavet en ny kode? Find turen på forsiden.</p>
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
