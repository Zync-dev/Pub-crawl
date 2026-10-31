"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { readName, saveName } from "@/lib/name";
import { readRecent, rememberCrawl, type RecentCrawl } from "@/lib/recent";
import { ensureUser, errorText, getSupabase, supabaseConfigured } from "@/lib/supabase";
import type { Crawl } from "@/lib/types";
import { Button, Icon, Input, Logo, Spinner, Tabs } from "./ds";
import { InstallCard } from "./install-card";

const J_DAY = { year: 2026, month: 10, day: 6 };

function jDayLine(now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(J_DAY.year, J_DAY.month, J_DAY.day);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days > 1) return `J-dag om ${days} dage`;
  if (days === 1) return "J-dag i morgen";
  if (days === 0) return "Det er J-dag";
  return "Fredag 6. november";
}

export function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"join" | "start">("join");
  const [recent, setRecent] = useState<RecentCrawl[]>([]);
  const [line, setLine] = useState<string | null>(null);
  const [crawlName, setCrawlName] = useState("J-dag 2026");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Det, der ligger i browseren, kan først læses efter første render.
    /* eslint-disable react-hooks/set-state-in-effect */
    setRecent(readRecent());
    setName(readName());
    setLine(jDayLine(new Date()));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ensureUser();
      saveName(name);
      const { data, error } = await getSupabase()
        .rpc("create_crawl", { p_name: crawlName, p_member_name: name })
        .single<Crawl>();
      if (error || !data) throw error;
      rememberCrawl({ code: data.code, name: data.name });
      router.push(`/t/${data.code}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const clean = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (clean.length !== 6) {
      setError("Koden har 6 tegn.");
      return;
    }
    if (name.trim()) saveName(name);
    setJoining(true);
    router.push(`/t/${clean}`);
  }

  return (
    <main className="pc-on-dark flex min-h-dvh flex-1 flex-col bg-green-800 px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(48px,env(safe-area-inset-top))]">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
        <div className="pc-enter">
          <Logo />
        </div>
        <p key={line ?? ""} className="pc-eyebrow pc-fade-in min-h-[11px] text-gold-300" style={{ animationDelay: "120ms" }}>
          {line}
        </p>
      </div>

      <div className="pc-enter mx-auto flex w-full max-w-sm flex-col gap-4" style={{ animationDelay: "80ms" }}>
        {/* pwa-push: guide til hjemmeskærmen */}
        <InstallCard tone="dark" when={recent.length ? "joined" : "before"} dismissible />

        {recent.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="pc-label text-gold-300">Dine ture</p>
            {recent.map((r, i) => (
              <button
                key={r.code}
                style={{ animationDelay: `${120 + i * 40}ms` }}
                onClick={() => {
                  setOpening(r.code);
                  router.push(`/t/${r.code}`);
                }}
                className="pc-enter flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] border border-gold-500/40 px-4 text-left text-cream-100 transition-colors hover:bg-gold-500/10 active:translate-y-px"
              >
                <span className="flex-1 font-serif text-[22px] italic leading-tight">{r.name}</span>
                <span className="pc-label text-gold-300">{r.code}</span>
                {opening === r.code ? (
                  <span className="text-gold-500">
                    <Spinner size={16} />
                  </span>
                ) : (
                  <Icon name="chevron-right" size={18} color="var(--gold-500)" />
                )}
              </button>
            ))}
          </div>
        )}

        <div
          className="flex flex-col gap-4 rounded-[var(--radius-md)] bg-cream-100 p-5"
          style={{ border: "var(--rule-double)" }}
        >
          <Tabs
            items={[
              { id: "join", label: "Hop med" },
              { id: "start", label: "Start en tur" },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
          />

          {!supabaseConfigured() && (
            <p className="text-sm text-oxblood-500">
              Supabase er ikke sat op. Tilføj NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
            </p>
          )}

          {mode === "join" ? (
            <form key="join" onSubmit={join} className="pc-fade-in flex flex-col gap-4">
              <Input
                label="Koden til turen"
                icon="key-round"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FX REDL42"
                maxLength={7}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <Button type="submit" variant="primary" size="lg" fullWidth iconRight="chevron-right" loading={joining}>
                Hop med på turen
              </Button>
              <p className="text-center text-[13px] text-muted">Har du fået et link? Så åbn bare det.</p>
            </form>
          ) : (
            <form key="start" onSubmit={start} className="pc-fade-in flex flex-col gap-4">
              <Input
                label="Turens navn"
                icon="route"
                value={crawlName}
                onChange={(e) => setCrawlName(e.target.value)}
                maxLength={40}
                required
              />
              <Input
                label="Dit navn"
                icon="user"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                placeholder="Fx Freja"
                autoComplete="given-name"
                required
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                iconRight="chevron-right"
                loading={busy}
                disabled={!supabaseConfigured()}
              >
                {busy ? "Starter turen" : "Start turen"}
              </Button>
            </form>
          )}

          {error && (
            <p key={error} className="pc-fade-in text-center text-[13px] text-oxblood-500" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
