/** Render SSR dos componentes B3 com um resultado real do motor (sem IA, sem banco): garante que a UI não quebra com dados reais/nulos. */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertList, CandidateCards, ComponentTable, DiCurvePanel, EventRiskB3, InstrumentHeader, IntermarketTable, ScoreCards } from "@/components/b3/B3Cards";
import { DiCurveForm, MarketForm, emptyMarkets } from "@/components/b3/B3Inputs";
import SmcChecklist from "@/components/ai/SmcChecklist";
import { aggregate, buildAlerts, buildB3Candidates, buildIntermarket, classifyRegime, computeBrlScore, computeDolScore, computeWinScore, directionOf, globalRiskScore, type B3ScoringInput } from "@/lib/b3/scoring";
import { analyzeDiCurve } from "@/lib/b3/di-curve";
import { b3EventRisk } from "@/lib/b3/event-risk";
import { buildB3Checklist } from "@/lib/b3/checklist";
import { DEFAULT_B3_CONFIG } from "@/lib/b3/config";
import type { B3AnalysisResult, MarketReading } from "@/lib/b3/types";
import type { CurrencyScoreView } from "@/lib/ai/types";
import type { TechnicalAnalysis } from "@/lib/ai/schemas";

const now = new Date("2026-10-02T13:00:00Z");
const ccy = (currency: string, score: number): CurrencyScoreView => ({ currency: currency as CurrencyScoreView["currency"], score, score_raw: score, previous_score: null, score_delta: null, momentum: null, classification: "NEUTRAL", bias: "NEUTRAL", confidence: "MEDIUM", rank: 1, live_events: 1, drivers: [] });
const rd = (symbol: string, change_pct: number | null, change_bp: number | null = null): MarketReading => ({ symbol, value: 100, change_pct, change_bp, direction: directionOf(change_pct, change_bp), captured_at: now.toISOString(), source: "manual", stale: false });

function buildResult(withData: boolean): B3AnalysisResult {
  const markets: Record<string, MarketReading> = withData ? { SPX: rd("SPX", -1.2), NAS100: rd("NAS100", -1.8), US10Y: rd("US10Y", null, 7), DXY: rd("DXY", 0.6), IRON_ORE: rd("IRON_ORE", -2), BRENT: rd("BRENT", 0.3) } : {};
  const di = withData ? analyzeDiCurve([{ code: "DI1F27", tenor: "SHORT", rate: 14.6, change_bp: 4 }, { code: "DI1F31", tenor: "LONG", rate: 13.9, change_bp: 14 }], { evidence: { fiscal_negative: true } }) : null;
  const input: B3ScoringInput = { now, usd: ccy("USD", 1), brlEvents: ccy("BRL", -0.5), cnyEvents: null, scoredEvents: [], di, markets, flow: { classification: withData ? "OUTFLOW" : "UNKNOWN", value: withData ? -900 : null }, previous: null };
  const brl = computeBrlScore(input); const win = computeWinScore(input, brl); const dol = computeDolScore({ score: 1, confidence: "MEDIUM" }, brl);
  const er = b3EventRisk([], { now }); const regime = classifyRegime({ global: globalRiskScore(markets), win, brl, di, eventRisk: er });
  const inter = buildIntermarket(markets, di, win, DEFAULT_B3_CONFIG);
  return { analysis_id: "1", date: "2026-10-02", session: "MORNING", brazil_macro: { score_from_events: null, live_events: 0, drivers: [], categories: {} }, usd: { score: 1, bias: "BULLISH", confidence: "MEDIUM", source: "g8_engine", live_events: 1, drivers: [], b3_context_note: null }, brl, di_curve: di,
    global_risk: { regime_hint: globalRiskScore(markets).hint, score: globalRiskScore(markets).score, readings: inter }, china: { score: null, live_events: 0, drivers: [], note: "sem dado" }, commodities: { score: aggregate([]).score || null, iron_ore: markets.IRON_ORE ?? null, brent: markets.BRENT ?? null, wti: null, copper: null, note: "n" }, flow: { classification: input.flow.classification, value_brl_mi: input.flow.value, captured_at: null, note: "" },
    win: { ...win, regime }, dol, regime, intermarket: inter, event_risk: er, trade_candidates: buildB3Candidates({ win, dol, regime, eventRisk: er }), alerts: buildAlerts({ win, dol, brl, di, markets, eventRisk: er, previous: null }), changes_since_previous: [], warnings: [], brief: null, meta: { scoring_version: "b3-v1", prompt_version: null, model: null, events_interpreted: 0, data_coverage: { win: win.coverage, brl: brl.coverage } } };
}

describe("B3 UI — SSR com dados reais e com tudo nulo", () => {
  for (const withData of [true, false]) {
    it(`renderiza todos os painéis (${withData ? "com dados" : "sem dados"})`, () => {
      const r = buildResult(withData);
      const html = renderToStaticMarkup(<div>
        <ScoreCards r={r} /><InstrumentHeader name="WIN" s={r.win} /><ComponentTable comps={r.win.components} title="WIN" /><ComponentTable comps={r.brl.components} title="BRL" />
        <DiCurvePanel di={r.di_curve} /><IntermarketTable rows={r.intermarket} /><IntermarketTable rows={r.intermarket} filter="DOL" /><EventRiskB3 risks={r.event_risk} /><CandidateCards cands={r.trade_candidates} /><AlertList alerts={r.alerts} />
      </div>);
      expect(html).toContain("WIN Macro Score"); expect(html).toContain("DOL Divergence");
      if (withData) { expect(html).toContain("BEAR STEEPENING".toLowerCase().replace(" ", " ")); expect(html).toContain("FISCAL_RISK"); } else { expect(html).toContain("sem dado"); expect(html).toContain("Sem curva DI"); }
    });
  }
  it("formulários de entrada renderizam", () => {
    const html = renderToStaticMarkup(<div><DiCurveForm contracts={[{ code: "DI1F27", tenor: "SHORT" }]} value={[{ code: "DI1F27", tenor: "SHORT", rate: "", change_bp: "" }]} onChange={() => undefined} cause="" onCause={() => undefined} /><MarketForm value={emptyMarkets()} onChange={() => undefined} /></div>);
    expect(html).toContain("DI1F27"); expect(html).toContain("Fluxo estrangeiro");
  });
  it("SmcChecklist mostra bloco macro B3", () => {
    const a: TechnicalAnalysis = { symbol: "WDOF27", image_quality: "GOOD", macro_bias: "LONG", htf_bias: "BULLISH", draw_on_liquidity: [], timeframes: [], poi: [], location: { htf_premium_discount: "DISCOUNT", poi_reached: true, poi_description: "FVG", is_extended: false }, liquidity_sweep: true, liquidity_sweep_detail: { timeframe: "M15", description: "x" }, rejection: true, displacement: true, displacement_detail: { timeframe: "M5", created_fvg: true, description: "y" }, mss: { present: true, type: "EXTERNAL_MSS", timeframe: "M15", follow_through: true, broke_what: "LH" }, retest: { occurred: true, poi_type: "FVG", description: null }, entry_model: "MODEL_B_CONFIRMED", setup_grade: "A", status: "READY", disqualifiers: [], suggested_direction: "LONG", wait_for: [], invalidation: "abaixo", targets: ["BSL"], risk_recommendation: "NORMAL", management_notes: "", intermarket_note: null, warnings: [], confidence: "HIGH" };
    const c = buildB3Checklist(a, { instrument: "WDO", macro: buildResult(true), macroBias: "LONG", eventRisk: "LOW", correlationOk: true });
    const html = renderToStaticMarkup(<SmcChecklist c={c} />);
    expect(html).toContain("Checklist macro B3"); expect(html).toContain("WDO");
  });
});
