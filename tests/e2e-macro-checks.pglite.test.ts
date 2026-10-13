/** Reproduz o erro de produção `macro_interpretations_classification_check` com uma constraint divergente
 *  e prova que (1) o pipeline não derruba a análise silenciosamente, (2) /api/macro/diagnostics aponta o problema
 *  e (3) drizzle/0004_fix_macro_checks.sql corrige de forma idempotente. */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { setEnvOverrides } from "@/lib/env";
const PGLITE_PKG = "@electric-sql/pglite";
vi.mock("@/db", async () => {
  const { PGlite } = (await import(/* @vite-ignore */ PGLITE_PKG)) as { PGlite: new () => { exec: (q: string) => Promise<unknown> } };
  const { drizzle } = await import("drizzle-orm/pglite");
  const { readFileSync } = await import("node:fs");
  const { getTableConfig } = await import("drizzle-orm/pg-core");
  const { trades } = await import("@/db/schema");
  const client = new PGlite();
  const cols = getTableConfig(trades).columns.map((c) => `"${c.name}" ${c.primary ? "SERIAL PRIMARY KEY" : c.getSQLType()}${c.notNull && !c.primary && !c.hasDefault ? " NOT NULL" : ""}`);
  await client.exec(`CREATE TABLE trades (${cols.join(", ")});`);
  for (const f of ["drizzle/0001_ai_module.sql", "drizzle/0002_b3_module.sql"]) await client.exec(readFileSync(f, "utf8"));
  return { getDb: () => drizzle(client as never), __exec: (q: string) => client.exec(q) };
});
const rawExec = async (q: string) => (await import("@/db") as unknown as { __exec: (q: string) => Promise<unknown> }).__exec(q);
const hasPglite = await import(/* @vite-ignore */ PGLITE_PKG).then(() => true).catch(() => false);
beforeAll(() => setEnvOverrides({ AI_PROVIDER: "mock" }));
const J = (b: unknown) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const today = new Date().toISOString().slice(0, 10);
const body = (suffix: string) => ({
  session: "NEW_YORK", inputType: "manual", events: [
    { date: today, time: "09:30", currency: "USD", event: `Core CPI m/m ${suffix}`, impact: "high", actual: "0.4%", forecast: "0.3%", previous: "0.3%", source: "manual" },
    { date: today, time: "09:30", currency: "EUR", event: `German ZEW ${suffix}`, impact: "medium", actual: "12.1", forecast: "9.0", previous: "8.5", source: "manual" },
  ],
});
const { readFileSync } = await import("node:fs");
const FIX_SQL = readFileSync("drizzle/0004_fix_macro_checks.sql", "utf8");

describe.skipIf(!hasPglite)("CHECK constraint divergente em macro_interpretations", () => {
  it("fluxo normal grava interpretações", async () => {
    const { POST } = await import("@/app/api/ai/macro/analyze/route");
    const r = await POST(J(body("A"))); expect(r.status).toBe(200);
    const b = await r.json(); expect(b.interpreted_events ?? b.interpreted ?? 1).toBeTruthy();
    const d = await import("@/app/api/macro/diagnostics/route");
    const diag = await (await d.GET(new Request("http://x"))).json();
    expect(diag.ok).toBe(true); expect(diag.tables.macro_interpretations.rows).toBeGreaterThan(0);
  });
  it("com constraint divergente + linha antiga fora do enum (cenário de produção): análise falha com causa clara e o diagnóstico acusa", async () => {
    // 1) constraint diferente da do código (NOT VALID para poder coexistir com as linhas já gravadas)
    await rawExec(`ALTER TABLE macro_interpretations DROP CONSTRAINT macro_interpretations_classification_check;
      ALTER TABLE macro_interpretations ADD CONSTRAINT macro_interpretations_classification_check CHECK (classification IN ('very_strong','strong','neutral','weak','very_weak')) NOT VALID;`);
    // 2) uma interpretação "antiga" com valor fora do padrão atual, ligada ao evento Core CPI A
    await rawExec(`INSERT INTO macro_interpretations (event_id, analysis_id, category, importance, classification, direction_value, growth_implication, inflation_implication, central_bank, central_bank_implication, currency_implication, confidence, reasoning_summary, weight, impact_factor, confidence_factor, score_contribution, scoring_version, prompt_version, model, is_current)
      SELECT id, 1, 'INFLATION', 'HIGH', 'strong', 1, 'POSITIVE', 'HOTTER', 'FED', 'MORE_HAWKISH', 'POSITIVE', 'HIGH', 'legado', 1, 1, 1, 1, 'v1', 'p', 'm', true FROM economic_events WHERE event = 'Core CPI m/m A' LIMIT 1`);
    const d = await import("@/app/api/macro/diagnostics/route");
    const diag = await (await d.GET(new Request("http://x"))).json();
    expect(diag.ok).toBe(false);
    expect(diag.mismatches.some((m: string) => m.includes("VERY_BULLISH"))).toBe(true);
    expect(diag.mismatches.some((m: string) => m.includes('"strong"×1'))).toBe(true);
    expect(diag.fix).toContain("0004");

    // 3a) interpretação nova rejeitada pelo banco → não derruba a análise, vira warning com a causa
    const { POST } = await import("@/app/api/ai/macro/analyze/route");
    const r1 = await POST(J(body("B")));
    expect(r1.status).toBe(200);
    const b1 = await r1.json();
    expect(b1.warnings.some((w: string) => /macro_interpretations_classification_check/.test(w) && /classification=/.test(w))).toBe(true);
    expect(b1.warnings.some((w: string) => /0004_fix_macro_checks/.test(w))).toBe(true);

    // 3b) reenviar Core CPI A com Actual diferente → supersede faz UPDATE na linha legada → erro de produção reproduzido, agora com explicação
    const again = body("A"); again.events[0].actual = "0.5%";
    const r2 = await POST(J(again));
    expect(r2.status).toBeGreaterThanOrEqual(400);
    const e2 = await r2.json();
    expect(String(e2.error)).toContain("0004_fix_macro_checks.sql");
    expect(String(e2.detail)).toContain("violates check constraint");
  });
  it("0004 corrige a constraint (idempotente) e a análise volta a funcionar", async () => {
    await rawExec(FIX_SQL);
    await rawExec(FIX_SQL); // segunda execução não pode falhar
    const d = await import("@/app/api/macro/diagnostics/route");
    const diag = await (await d.GET(new Request("http://x"))).json();
    expect(diag.ok).toBe(true);
    const def = diag.constraints.find((c: { conname: string }) => c.conname === "macro_interpretations_classification_check").definition;
    for (const v of ["VERY_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "VERY_BEARISH"]) expect(def).toContain(`'${v}'`);
    expect(diag.constraints.some((c: { conname: string }) => c.conname === "macro_interpretations_direction_value_check")).toBe(true);

    expect(diag.classification_values.every((v: { classification: string }) => ["VERY_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "VERY_BEARISH"].includes(v.classification))).toBe(true);
    expect(diag.classification_values.some((v: { classification: string }) => v.classification === "BULLISH")).toBe(true); // 'strong' → BULLISH

    const { POST } = await import("@/app/api/ai/macro/analyze/route");
    const again = body("A"); again.events[0].actual = "0.6%"; // supersede volta a funcionar
    const r0 = await POST(J(again)); expect(r0.status).toBe(200);
    const r = await POST(J(body("C"))); expect(r.status).toBe(200);
    const b = await r.json(); expect(b.analysis_id).toBeTruthy(); expect(b.warnings.some((w: string) => /classification_check/.test(w))).toBe(false);
  });
});
