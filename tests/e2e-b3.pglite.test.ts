/** E2E real do módulo B3: Postgres em memória (PGlite) + migrations 0001/0002 + provedor de IA MOCK (zero tokens).
 *  Roda só quando @electric-sql/pglite está instalado: `npm i --no-save @electric-sql/pglite && npx vitest run tests/e2e-b3.pglite.test.ts` */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { setEnvOverrides } from "@/lib/env";
const PGLITE_PKG = "@electric-sql/pglite"; // import dinâmico por string: não quebra o typecheck quando o pacote (opcional) não está instalado
vi.mock("@/db", async () => {
  const { PGlite } = (await import(/* @vite-ignore */ PGLITE_PKG)) as { PGlite: new () => { exec: (q: string) => Promise<unknown> } };
  const { drizzle } = await import("drizzle-orm/pglite");
  const { readFileSync } = await import("node:fs");
  const { getTableConfig } = await import("drizzle-orm/pg-core");
  const { trades } = await import("@/db/schema");
  const client = new PGlite();
  // tabela `trades` gerada a partir do schema Drizzle (a migration 0001 não a cria — já existe em produção)
  const cols = getTableConfig(trades).columns.map((c) => `"${c.name}" ${c.primary ? "SERIAL PRIMARY KEY" : c.getSQLType()}${c.notNull && !c.primary && !c.hasDefault ? " NOT NULL" : ""}`);
  await client.exec(`CREATE TABLE trades (${cols.join(", ")}); ALTER TABLE trades ALTER COLUMN is_demo SET DEFAULT false; ALTER TABLE trades ALTER COLUMN created_at SET DEFAULT now();`);
  for (const f of ["drizzle/0001_ai_module.sql", "drizzle/0002_b3_module.sql"]) await client.exec(readFileSync(f, "utf8"));
  const db = drizzle(client as never);
  return { getDb: () => db };
});
const hasPglite = await import(/* @vite-ignore */ PGLITE_PKG).then(() => true).catch(() => false);
beforeAll(() => setEnvOverrides({ AI_PROVIDER: "mock" }));
const J = (b: unknown) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const PUT = (b: unknown) => new Request("http://x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

describe.skipIf(!hasPglite)("B3 e2e (PGlite + mock AI)", () => {
  it("settings GET/PUT", async () => {
    const { GET, PUT: P } = await import("@/app/api/b3/settings/route");
    const s = await (await GET()).json(); expect(s.di_contracts.length).toBe(3);
    const r = await P(PUT({ di_contracts: [{ code: "DI1F27", tenor: "SHORT" }, { code: "DI1F29", tenor: "MID" }, { code: "DI1F31", tenor: "LONG" }], weights: { win_weights: { DI_CURVE: 1.5 } } }));
    expect(r.status).toBe(200); const b = await r.json(); expect(b.weights.win_weights.DI_CURVE).toBe(1.5);
  });
  it("di-curve POST + GET latest", async () => {
    const { POST, GET } = await import("@/app/api/b3/di-curve/route");
    const r = await POST(J({ contracts: [{ code: "DI1F27", tenor: "SHORT", rate: 14.6, change_bp: 4 }, { code: "DI1F29", tenor: "MID", rate: 14.1, change_bp: 9 }, { code: "DI1F31", tenor: "LONG", rate: 13.95, change_bp: 15 }], cause: "FISCAL_RISK" }));
    expect(r.status).toBe(201); const b = await r.json(); expect(b.analysis.shape).toBe("BEAR_STEEPENING"); expect(b.analysis.cause).toBe("FISCAL_RISK");
    const g = await (await GET(new Request("http://x?latest=1"))).json(); expect(g.latest.analysis.slope_bp).toBe(-65); expect(g.contracts.length).toBe(3);
    const l = await (await GET(new Request("http://x"))).json(); expect(l.rows[0].captured_at).toBeTruthy(); expect(l.rows[0].shape).toBe("BEAR_STEEPENING");
  });
  it("markets POST + GET", async () => {
    const { POST, GET } = await import("@/app/api/b3/markets/route");
    const r = await POST(J({ rows: [{ symbol: "SPX", value: 5600, change_pct: -1.3, change_bp: null }, { symbol: "NAS100", value: 19500, change_pct: -1.9, change_bp: null }, { symbol: "US10Y", value: 4.4, change_pct: null, change_bp: 8 }, { symbol: "DXY", value: 104.5, change_pct: 0.7, change_bp: null }, { symbol: "IRON_ORE", value: 98, change_pct: -2.1, change_bp: null }, { symbol: "BRENT", value: 71, change_pct: 0.4, change_bp: null }, { symbol: "FOREIGN_FLOW", value: -1400, change_pct: null, change_bp: null }, { symbol: "VIX", value: 22, change_pct: 12, change_bp: null }, { symbol: "COPPER", value: null, change_pct: null, change_bp: null }] }));
    expect(r.status).toBe(201); expect((await r.json()).saved).toBe(8);
    const g = await (await GET(new Request("http://x?latest=1"))).json(); expect(g.SPX.direction).toBe("DOWN"); expect(g.COPPER).toBeUndefined();
    const l = await (await GET(new Request("http://x"))).json(); expect(l[0].captured_at).toBeTruthy();
  });
  it("analyze com eventos BRL/USD/CNY (mock) → resultado estruturado + persistência", async () => {
    const { POST } = await import("@/app/api/ai/b3/analyze/route");
    const today = new Date().toISOString().slice(0, 10);
    const ev = (currency: string, event: string, actual: string | null, forecast: string | null, previous: string | null, time = "09:00") => ({ date: today, time, currency, event, impact: "high", actual, forecast, previous, source: "manual" });
    const r = await POST(J({ session: "MORNING", inputType: "manual", withBrief: true, events: [ev("BRL", "IPCA m/m", "0.52%", "0.40%", "0.30%"), ev("BRL", "Resultado Primário", "-R$ 20,1 bi", "-R$ 12,0 bi", "-R$ 5,0 bi"), ev("USD", "CPI m/m", "0.4%", "0.3%", "0.2%"), ev("CNY", "Caixin Manufacturing PMI", "48.9", "50.2", "50.4"), ev("BRL", "Copom - Decisão Selic", null, "14.75%", "14.75%", "18:30"), ev("USD", "Non-Farm Employment Change", null, "180K", "150K", "23:30")] }));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.analysis_id).toBeTruthy(); expect(b.session).toBe("MORNING"); expect(b.usd.source).toBe("g8_engine");
    expect(b.win.components.length).toBe(14); expect(b.brl.components.length).toBe(11);
    expect(b.di_curve.shape).toBe("BEAR_STEEPENING"); expect(b.win.components.find((c: { key: string }) => c.key === "DI_CURVE").score).toBe(-2);
    expect(b.win.components.find((c: { key: string }) => c.key === "US_EQUITIES").score).toBeLessThan(0);
    expect(b.flow.classification).toBe("OUTFLOW"); expect(["RISK_OFF", "MIXED", "DOMESTIC_BEARISH", "HIGH_EVENT_RISK"]).toContain(b.regime);
    expect(b.event_risk.length).toBe(2); expect(b.intermarket.length).toBeGreaterThan(5);
    expect(b.dol.divergence).toBeCloseTo(b.dol.usd_score - b.dol.brl_score, 5);
    expect(b.brief === null || typeof b.brief.headline === "string").toBe(true);
    console.log("REGIME", b.regime, "WIN", b.win.score, b.win.bias, "DOL", b.dol.divergence, b.dol.bias, "USD", b.usd.score, "BRL", b.brl.score, "ER", b.event_risk.map((e: { level: string }) => e.level), "alerts", b.alerts.map((a: { code: string }) => a.code), "warnings", b.warnings.length, "cands", b.trade_candidates.map((c: { instrument: string; bias: string }) => `${c.instrument}:${c.bias}`));
    // persistência / leitura
    const { GET: GA } = await import("@/app/api/b3/analyses/route");
    const latest = await (await GA(new Request("http://x?latest=1"))).json(); expect(latest.win.score).toBe(b.win.score);
    const byId = await (await GA(new Request(`http://x?id=${b.analysis_id}`))).json(); expect(byId.analysis_id).toBe(String(b.analysis_id));
    const list = await (await GA(new Request("http://x?limit=5"))).json(); expect(list[0].win_score).toBe(b.win.score); expect(list[0].analysis_date).toBeTruthy();
    const { GET: GS } = await import("@/app/api/b3/scores/route"); const sc = await (await GS()).json(); expect(sc.WIN.score).toBe(b.win.score); expect(sc.DOL).toBeTruthy();
    const { GET: GH } = await import("@/app/api/b3/scores/history/route"); const h = await (await GH(new Request("http://x?days=7"))).json(); expect(h.length).toBeGreaterThanOrEqual(4);
    const { GET: GC } = await import("@/app/api/b3/candidates/route"); const c = await (await GC()).json(); expect(Array.isArray(c)).toBe(true);
    const { GET: GE } = await import("@/app/api/b3/event-risk/route"); const e = await (await GE(new Request("http://x?hours=24"))).json(); expect(e.risk.length).toBe(2); expect(e.pending.length).toBe(2);
    // segunda análise → delta/mudanças
    const r2 = await POST(J({ session: "NY_OVERLAP", inputType: "recompute" })); const b2 = await r2.json(); expect(r2.status).toBe(200); expect(b2.win.previous_score).toBe(b.win.score);
    // USD do G8 não foi alterado: currency_scores não recebe BRL
    const { GET: G8 } = await import("@/app/api/macro/scores/route"); const g8 = await (await G8()).json(); expect(g8.find((x: { currency: string }) => x.currency === "BRL")).toBeUndefined();
  });
  it("SMC analyze com WIN usa checklist B3 + journal com campos B3 + stats por regime", async () => {
    const { POST } = await import("@/app/api/ai/smc/analyze/route");
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const fd = new FormData(); fd.append("images", new File([PNG], "h1.png", { type: "image/png" })); fd.append("labels", JSON.stringify(["H1"])); fd.append("symbol", "WINZ26"); fd.append("session", "MORNING");
    const res = await POST(new Request("http://x", { method: "POST", body: fd })); expect(res.status).toBe(200); const b = await res.json();
    expect(b.b3.instrument).toBe("WIN"); expect(b.b3.has_macro).toBe(true); expect(b.checklist.macro_items.length).toBe(5); expect(b.checklist.instrument).toBe("WIN");
    const { POST: JP, GET: JG } = await import("@/app/api/journal/route");
    const jr = await JP(J({ symbol: "WINZ26", direction: "SELL", session: "MORNING", status: "CLOSED", result: "WIN", realized_r: 1.8, win_macro_score: -1.25, dol_macro_score: 1.5, usd_score: 1, brl_score: -0.5, di_short: 4, di_long: 15, risk_regime: "RISK_OFF", dxy_state: "UP", us10y_state: "UP", sp500_state: "DOWN", event_risk_at_entry: "MEDIUM", error_tags: ["TRADED_AGAINST_DI"] }));
    expect(jr.status).toBe(201); const { id } = await jr.json();
    const list = await (await JG(new Request("http://x?limit=10"))).json(); const e = list.find((x: { id: number }) => x.id === id);
    expect(e.market).toBe("B3"); expect(e.win_macro_score).toBe(-1.25); expect(e.risk_regime).toBe("RISK_OFF"); expect(e.event_risk_at_entry).toBe("MEDIUM"); expect(e.error_tags).toContain("TRADED_AGAINST_DI");
    const { GET: SG } = await import("@/app/api/journal/stats/route");
    const st = await (await SG(new Request("http://x?market=B3&instrument=WIN"))).json();
    expect(st.filters.instrument).toBe("WIN"); expect(st.by_regime.find((x: { key: string }) => x.key === "RISK_OFF").n).toBe(1); expect(st.by_di_alignment[0].key).toBe("a favor do DI"); expect(st.by_dxy_alignment[0].key).toBe("a favor do DXY"); expect(st.by_macro_score[0].key).toMatch(/a favor/); expect(st.by_event_risk[0].key).toBe("MEDIUM");
    const fx = await (await SG(new Request("http://x?market=FOREX"))).json(); expect(fx.total.n).toBe(0);
  });
});
