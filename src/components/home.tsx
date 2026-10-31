"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { readRecent, rememberCrawl, type RecentCrawl } from "@/lib/recent";
import { ensureUser, errorText, getSupabase, supabaseConfigured } from "@/lib/supabase";
import type { Crawl } from "@/lib/types";
import { readName, saveName } from "@/lib/name";
import { Button, Card, Input, Label } from "./ui";

const J_DAY = new Date("2026-11-06T20:59:00+01:00");

function daysToJDay(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(J_DAY.getFullYear(), J_DAY.getMonth(), J_DAY.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function Home() {
  const router = useRouter();
  const [recent, setRecent] = useState<RecentCrawl[]>([]);
  const [days, setDays] = useState<number | null>(null);
  const [crawlName, setCrawlName] = useState("J-dag 2026");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Det, der ligger i browseren, kan først læses efter første render.
    /* eslint-disable react-hooks/set-state-in-effect */
    setRecent(readRecent());
    setName(readName());
    setDays(daysToJDay(new Date()));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function create(e: FormEvent) {
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
    if (clean.length === 6) router.push(`/t/${clean}`);
    else setError("Koden har 6 tegn.");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold">
          {days === null
            ? "J-dag"
            : days > 1
              ? `J-dag om ${days} dage`
              : days === 1
                ? "J-dag i morgen"
                : days === 0
                  ? "Det er J-dag 🎄"
                  : "J-dag"}
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Pub-crawl</h1>
        <p className="text-muted">
          Ruten på kort, hvad alle har drukket, og hvor de andre er henne.
        </p>
      </header>

      {!supabaseConfigured() && (
        <Card className="border-danger/40">
          <p className="text-sm text-danger">
            Supabase er ikke sat op endnu. Tilføj NEXT_PUBLIC_SUPABASE_URL og
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY i .env.local.
          </p>
        </Card>
      )}

      {recent.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Dine ture</h2>
          <ul className="flex flex-col gap-2">
            {recent.map((r) => (
              <li key={r.code}>
                <Link
                  href={`/t/${r.code}`}
                  className="flex min-h-12 items-center justify-between rounded-xl bg-raised px-3"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="font-mono text-sm text-muted">{r.code}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">Start en ny tur</h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          <label>
            <Label>Turens navn</Label>
            <Input
              value={crawlName}
              onChange={(e) => setCrawlName(e.target.value)}
              maxLength={40}
              required
            />
          </label>
          <label>
            <Label>Dit navn</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder="Fx Lukas"
              autoComplete="given-name"
              required
            />
          </label>
          <Button type="submit" disabled={busy || !supabaseConfigured()}>
            {busy ? "Opretter…" : "Opret tur"}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Har du fået en kode?</h2>
        <form onSubmit={join} className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC234"
            maxLength={7}
            autoCapitalize="characters"
            autoCorrect="off"
            className="font-mono tracking-widest"
            aria-label="Kode"
          />
          <Button type="submit" variant="secondary" className="shrink-0 whitespace-nowrap">
            Hop med
          </Button>
        </form>
      </Card>

      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </main>
  );
}
