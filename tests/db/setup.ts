// Fælles testbrugere til `pnpm test:db`. Supabase tillader kun et vist antal nye anonyme brugere i timen,
// så brugerne genbruges mellem kørsler: deres refresh-token gemmes i node_modules/.cache (ikke i git).
// En bruger skiftes ud efter nogle kørsler, så create_crawl ikke rammer loftet på 20 ture.
// Fejlrapport-brugeren ("e") er ny hver gang, fordi loftet på 30 rapporter i timen skal testes præcist.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { TestProject } from "vitest/node";

export type PoolName = "a" | "b" | "c" | "o";
export type TestSession = { id: string; token: string };

declare module "vitest" {
  export interface ProvidedContext {
    dbUsers: Record<PoolName, TestSession>;
    // null, hvis Supabase ikke ville lave en ny bruger lige nu (for mange i timen).
    dbErrorsUser: TestSession | null;
  }
}

const POOL: PoolName[] = ["a", "b", "c", "o"];
// Hver bruger opretter højst 3 ture pr. kørsel. 5 kørsler giver 15, under loftet på 20.
const MAX_RUNS = 5;
const cacheFile = fileURLToPath(new URL("../../node_modules/.cache/pub-crawl-db/users.json", import.meta.url));

type Cached = { refresh: string; runs: number };

function readCache(): Partial<Record<PoolName, Cached>> {
  try {
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  } catch {
    return {};
  }
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY mangler i .env.local");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUp() {
  const { data, error } = await client().auth.signInAnonymously();
  if (error || !data.session || !data.user) throw error ?? new Error("Ingen session");
  return { id: data.user.id, token: data.session.access_token, refresh: data.session.refresh_token };
}

async function resume(refresh: string) {
  const { data, error } = await client().auth.refreshSession({ refresh_token: refresh });
  if (error || !data.session || !data.user) return null;
  return { id: data.user.id, token: data.session.access_token, refresh: data.session.refresh_token };
}

export default async function setup(project: TestProject) {
  const cache = readCache();
  const next: Partial<Record<PoolName, Cached>> = {};
  const users = {} as Record<PoolName, TestSession>;

  for (const name of POOL) {
    const old = cache[name];
    let user = old && old.runs < MAX_RUNS ? await resume(old.refresh) : null;
    let runs = user ? old!.runs + 1 : 1;
    if (!user) {
      try {
        user = await signUp();
      } catch (e) {
        // Kan vi ikke lave en ny, bruger vi den gamle en gang mere, hvis den stadig virker.
        user = old ? await resume(old.refresh) : null;
        if (!user) throw new Error(`Kunne ikke logge testbruger ${name} ind: ${(e as Error).message}`);
        runs = old!.runs + 1;
      }
    }
    users[name] = { id: user.id, token: user.token };
    next[name] = { refresh: user.refresh, runs };
  }

  let errorsUser: TestSession | null = null;
  try {
    const e = await signUp();
    errorsUser = { id: e.id, token: e.token };
  } catch {
    errorsUser = null;
  }

  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(next, null, 2));

  project.provide("dbUsers", users);
  project.provide("dbErrorsUser", errorsUser);
}
