// Fejlrapporter (0010): klienten må kun indsætte, og højst 30 i timen pr. bruger.
// Reglerne testes med testbrugeren o. Loftet testes med en helt ny bruger fra setup.ts, så tællingen
// starter på nul. Vil Supabase ikke lave en ny bruger lige nu, springes kun loftet over.
import { describe, expect, it } from "vitest";
import { anon, denied, freshUser, ok, users, type TestUser } from "./helpers";

const { o, b } = users();
const e = freshUser();
if (!e) console.warn("Supabase ville ikke lave en ny testbruger lige nu. Fejlrapporternes loft springes over.");

function report(u: TestUser, message: string, extra: Record<string, unknown> = {}) {
  return u.c.from("client_errors").insert({ message, ...extra });
}

describe("client_errors", () => {
  it("kan indsættes, men ikke læses, rettes eller slettes", async () => {
    ok(await report(o, "Test db: fejlrapport", { crawl_code: "ABC234", stack: "x".repeat(10), url: "/t/ABC234", user_agent: "vitest" }));
    denied(await o.c.from("client_errors").select("id"));
    denied(await o.c.from("client_errors").update({ message: "Snyd" }).eq("user_id", o.id));
    denied(await o.c.from("client_errors").delete().eq("user_id", o.id));
  });

  it("afsender og tid sættes af databasen", async () => {
    denied(await report(o, "Test db: snyd", { user_id: b.id }));
    denied(await report(o, "Test db: snyd", { created_at: "2026-11-06T20:00:00Z" }));
    denied(await anon().from("client_errors").insert({ message: "Test db: anonym" }));
    denied(await o.c.rpc("client_errors_before_insert"));
  });

  it("afviser tomme og for lange beskeder og skæve koder", async () => {
    denied(await report(o, ""));
    denied(await report(o, "x".repeat(1001)));
    denied(await report(o, "Test db: kode", { crawl_code: "abc" }));
  });

  it("afkorter en lang stak i stedet for at afvise rapporten", async () => {
    ok(await report(o, "Test db: stak", { stack: "x".repeat(5000) }));
  });
});

describe.skipIf(!e)("loftet for fejlrapporter", () => {
  it("tager højst 30 rapporter i timen, også når de kommer samtidig", async () => {
    for (let i = 0; i < 28; i++) ok(await report(e!, `Test db: loft ${i}`));
    const burst = await Promise.all(Array.from({ length: 6 }, (_, i) => report(e!, `Test db: samtidig ${i}`)));
    expect(burst.filter((r) => !r.error)).toHaveLength(2);
    for (const r of burst.filter((r) => r.error)) expect(r.error?.message).toContain("too_many_errors");
    denied(await report(e!, "Test db: en for meget"), "too_many_errors");
  });

  it("gælder pr. bruger", async () => {
    ok(await report(b, "Test db: en anden bruger"));
  });
});
