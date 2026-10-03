import { describe, expect, it } from "vitest";
import { analyzeDiCurve, classifyShape, diScoreForWin, inferCause } from "@/lib/b3/di-curve";
import { aggregate, buildAlerts, buildB3Candidates, classifyFlow, classifyRegime, computeBrlScore, computeDolScore, computeWinScore, directionOf, globalRiskScore, type B3ScoringInput } from "@/lib/b3/scoring";
import { b3EventRisk, keyEventLabel } from "@/lib/b3/event-risk";
import { buildB3Checklist } from "@/lib/b3/checklist";
import { b3InstrumentOf, type MarketReading, type InstrumentScore } from "@/lib/b3/types";
import { DEFAULT_B3_CONFIG, mergeB3Config } from "@/lib/b3/config";
import { B3AnalyzeBody, DiCurveBody, MarketsBody } from "@/lib/b3/schema";
import { MarketExtractionSchema, B3BriefSchema, toJsonSchema } from "@/lib/ai/schemas";
import { mockStructured } from "@/lib/ai/mock";
import type { CurrencyScoreView, PendingEventView } from "@/lib/ai/types";
import type { TechnicalAnalysis } from "@/lib/ai/schemas";
import type { ScoredEvent } from "@/lib/macro/scoring";

const now = new Date("2026-10-02T13:00:00Z");
const ccy = (currency: string, score: number, live = 2): CurrencyScoreView => ({ currency: currency as CurrencyScoreView["currency"], score, score_raw: score, previous_score: null, score_delta: null, momentum: null, classification: "NEUTRAL", bias: score >= 0.5 ? "BULLISH" : score <= -0.5 ? "BEARISH" : "NEUTRAL", confidence: "MEDIUM", rank: 1, live_events: live, drivers: [] });
const reading = (symbol: string, change_pct: number | null, change_bp: number | null = null, value: number | null = null): MarketReading => ({ symbol, value, change_pct, change_bp, direction: directionOf(change_pct, change_bp), captured_at: now.toISOString(), source: "manual", stale: false });
const ev = (currency: string, category: ScoredEvent["category"], classification: ScoredEvent["classification"], daysAgo = 1): ScoredEvent => ({ event_id: Math.floor(Math.random() * 1e6), currency: currency as ScoredEvent["currency"], event: `${category} ${currency}`, impact: "high", released_at: new Date(now.getTime() - daysAgo * 86_400_000), superseded: false, category, importance: "HIGH", classification, confidence: "HIGH" });

const baseInput = (over: Partial<B3ScoringInput> = {}): B3ScoringInput => ({ now, usd: ccy("USD", 0), brlEvents: ccy("BRL", 0, 0), cnyEvents: null, scoredEvents: [], di: null, markets: {}, flow: { classification: "UNKNOWN", value: null }, previous: null, ...over });

describe("B3 — símbolos e sessões", () => {
  it("reconhece WIN/WDO/DOL com vencimento", () => {
    expect(b3InstrumentOf("WINZ26")).toBe("WIN"); expect(b3InstrumentOf("WDOF27")).toBe("WDO"); expect(b3InstrumentOf("DOLX26")).toBe("DOL"); expect(b3InstrumentOf("IND")).toBe("WIN"); expect(b3InstrumentOf("EURUSD")).toBeNull();
  });
});

describe("B3 — DOL = USD − BRL (exemplos da spec)", () => {
  const brl = (score: number): InstrumentScore => ({ score, bias: score >= 0.5 ? "BULLISH" : score <= -0.5 ? "BEARISH" : "NEUTRAL", confidence: "MEDIUM", components: [], drivers: [], coverage: 1, previous_score: null, delta: null });
  it("USD +1.50 / BRL −1.00 → +2.50 LONG", () => { const d = computeDolScore({ score: 1.5, confidence: "HIGH" }, brl(-1)); expect(d.divergence).toBe(2.5); expect(d.bias).toBe("LONG"); expect(d.confidence).toBe("MEDIUM"); });
  it("USD −1.00 / BRL +1.00 → −2.00 SHORT", () => { const d = computeDolScore({ score: -1, confidence: "MEDIUM" }, brl(1)); expect(d.divergence).toBe(-2); expect(d.bias).toBe("SHORT"); });
  it("abaixo do limiar → NEUTRAL", () => { expect(computeDolScore({ score: 0.5, confidence: "HIGH" }, brl(0)).bias).toBe("NEUTRAL"); });
});

describe("B3 — nunca inventa dado", () => {
  it("sem nenhum input: todos os componentes null, score 0, cobertura 0, confiança LOW", () => {
    const i = baseInput();
    const brl = computeBrlScore(i); const win = computeWinScore(i, brl);
    expect(brl.components.every((c) => c.score === null)).toBe(true); expect(brl.score).toBe(0); expect(brl.coverage).toBe(0); expect(brl.confidence).toBe("LOW");
    expect(win.components.every((c) => c.score === null)).toBe(true); expect(win.confidence).toBe("LOW");
    expect(win.components.map((c) => c.key)).toEqual(["BRAZIL_ACTIVITY", "BRAZIL_INFLATION", "BCB_POLICY", "DI_CURVE", "FISCAL_RISK", "BRL", "FOREIGN_FLOW", "US_EQUITIES", "US_YIELDS", "DXY", "CHINA", "IRON_ORE", "OIL", "GLOBAL_RISK_SENTIMENT"]);
  });
  it("aggregate ignora componentes null e calcula cobertura", () => {
    const a = aggregate([{ key: "A", score: 2, weight: 1, confidence: "HIGH", reason: "", source: "market" }, { key: "B", score: null, weight: 1, confidence: "LOW", reason: "", source: null }]);
    expect(a.score).toBe(2); expect(a.coverage).toBe(0.5);
  });
  it("fluxo sem valor → UNKNOWN; com valor → INFLOW/OUTFLOW", () => { expect(classifyFlow(null)).toBe("UNKNOWN"); expect(classifyFlow(800)).toBe("INFLOW"); expect(classifyFlow(-1200)).toBe("OUTFLOW"); expect(classifyFlow(100)).toBe("NEUTRAL"); });
});

describe("B3 — regimes (exemplos da spec)", () => {
  it("S&P↑ NAS↑ US10Y↓ DI↓ BRL forte commodities↑ → RISK_ON / WIN BULLISH", () => {
    const markets = { SPX: reading("SPX", 1.2), NAS100: reading("NAS100", 1.5), US10Y: reading("US10Y", null, -8), DXY: reading("DXY", -0.5), IRON_ORE: reading("IRON_ORE", 2), BRENT: reading("BRENT", 1.1) };
    const di = analyzeDiCurve([{ code: "DI1F27", tenor: "SHORT", rate: 14.5, change_bp: -6 }, { code: "DI1F29", tenor: "MID", rate: 13.9, change_bp: -10 }, { code: "DI1F31", tenor: "LONG", rate: 13.7, change_bp: -14 }], { evidence: { inflation_cool: true } });
    const i = baseInput({ markets, di, flow: { classification: "INFLOW", value: 900 }, scoredEvents: [ev("BRL", "INFLATION", "BULLISH"), ev("BRL", "GROWTH", "BULLISH")] });
    const brl = computeBrlScore(i); const win = computeWinScore(i, brl);
    const regime = classifyRegime({ global: globalRiskScore(markets), win, brl, di, eventRisk: [] });
    expect(regime).toBe("RISK_ON"); expect(win.bias).toBe("BULLISH"); expect(win.score).toBeGreaterThanOrEqual(1);
  });
  it("yields↑ DXY↑ DI longo↑ BRL fraco exterior↓ → RISK_OFF / WIN BEARISH", () => {
    const markets = { SPX: reading("SPX", -1.4), NAS100: reading("NAS100", -2), US10Y: reading("US10Y", null, 9), DXY: reading("DXY", 0.8), VIX: reading("VIX", 8) };
    const di = analyzeDiCurve([{ code: "DI1F27", tenor: "SHORT", rate: 14.5, change_bp: 3 }, { code: "DI1F31", tenor: "LONG", rate: 14.2, change_bp: 15 }], { evidence: { fiscal_negative: true } });
    const i = baseInput({ markets, di, flow: { classification: "OUTFLOW", value: -1500 }, scoredEvents: [ev("BRL", "FISCAL", "VERY_BEARISH")] });
    const brl = computeBrlScore(i); const win = computeWinScore(i, brl);
    expect(classifyRegime({ global: globalRiskScore(markets), win, brl, di, eventRisk: [] })).toBe("RISK_OFF"); expect(win.bias).toBe("BEARISH"); expect(brl.bias).toBe("BEARISH");
  });
  it("event risk EXTREME domina → HIGH_EVENT_RISK", () => {
    const i = baseInput(); const brl = computeBrlScore(i); const win = computeWinScore(i, brl);
    expect(classifyRegime({ global: { score: 1, hint: "RISK_ON" }, win, brl, di: null, eventRisk: [{ instrument: "WIN", level: "EXTREME", events: [], next_key_event: "COPOM" }] })).toBe("HIGH_EVENT_RISK");
  });
});

describe("B3 — curva DI", () => {
  it("classifica forma e não decide direção sem causa", () => {
    expect(classifyShape(2, 15)).toBe("BEAR_STEEPENING"); expect(classifyShape(-10, -3)).toBe("BULL_STEEPENING"); expect(classifyShape(8, 2)).toBe("BEAR_FLATTENING"); expect(classifyShape(-2, -12)).toBe("BULL_FLATTENING"); expect(classifyShape(1, 1)).toBe("STABLE"); expect(classifyShape(null, null)).toBe("UNKNOWN");
    expect(inferCause("BEAR_STEEPENING", {})).toBe("UNKNOWN"); expect(inferCause("BEAR_STEEPENING", { fiscal_negative: true })).toBe("FISCAL_RISK"); expect(inferCause("BULL_FLATTENING", { bcb_dovish: true })).toBe("BCB_DOVISH");
  });
  it("DI subindo por fiscal pressiona bolsa E BRL; por atividade é misto p/ bolsa", () => {
    const fiscal = analyzeDiCurve([{ code: "DI1F27", tenor: "SHORT", rate: 14.6, change_bp: 4 }, { code: "DI1F31", tenor: "LONG", rate: 14.3, change_bp: 16 }], { evidence: { fiscal_negative: true } });
    expect(fiscal.equity_implication).toBe("PRESSURE"); expect(fiscal.brl_implication).toBe("PRESSURE"); expect(diScoreForWin(fiscal).score).toBe(-2);
    const growth = analyzeDiCurve([{ code: "DI1F27", tenor: "SHORT", rate: 14.6, change_bp: 4 }, { code: "DI1F31", tenor: "LONG", rate: 14.3, change_bp: 16 }], { evidence: { user_cause: "GROWTH" } });
    expect(growth.equity_implication).toBe("MIXED"); expect(diScoreForWin(growth).score).toBe(-1);
  });
  it("contratos sem taxa → requires_manual_confirmation e score null", () => {
    const d = analyzeDiCurve([{ code: "DI1F27", tenor: "SHORT", rate: null, change_bp: null }]);
    expect(d.requires_manual_confirmation).toBe(true); expect(diScoreForWin(d).score).toBeNull();
  });
  it("inclinação em bp = (longo − curto) × 100", () => { const d = analyzeDiCurve([{ code: "DI1F27", tenor: "SHORT", rate: 14.5, change_bp: 0 }, { code: "DI1F31", tenor: "LONG", rate: 13.9, change_bp: 0 }]); expect(d.slope_bp).toBe(-60); });
});

describe("B3 — event risk e alertas", () => {
  const pend = (currency: string, event: string, min: number, impact = "high"): PendingEventView => ({ id: 1, currency: currency as PendingEventView["currency"], event, scheduled_at: new Date(now.getTime() + min * 60_000).toISOString(), impact, forecast: null, previous: null, minutes_until: min });
  it("COPOM em 45 min → EXTREME para WIN e DOL; rotula eventos-chave", () => {
    const r = b3EventRisk([pend("BRL", "Copom - Decisão Selic", 45)], { now });
    expect(r.find((x) => x.instrument === "WIN")!.level).toBe("EXTREME"); expect(r.find((x) => x.instrument === "DOL")!.level).toBe("EXTREME");
    expect(keyEventLabel({ currency: "USD", event: "Non-Farm Employment Change" })).toBe("NFP"); expect(keyEventLabel({ currency: "BRL", event: "IPCA-15 m/m" })).toBe("IPCA-15"); expect(keyEventLabel({ currency: "CNY", event: "Caixin Manufacturing PMI" })).toBe("China PMI");
  });
  it("China PMI entra no WIN mas não no DOL", () => {
    const r = b3EventRisk([pend("CNY", "Manufacturing PMI", 120, "medium")], { now });
    expect(r.find((x) => x.instrument === "WIN")!.events.length).toBe(1); expect(r.find((x) => x.instrument === "DOL")!.events.length).toBe(0);
  });
  it("gera alertas de conflito e de evento iminente (spec item 31)", () => {
    const di = analyzeDiCurve([{ code: "DI1F27", tenor: "SHORT", rate: 14.5, change_bp: -8 }, { code: "DI1F31", tenor: "LONG", rate: 13.9, change_bp: -15 }]);
    const win: InstrumentScore = { score: -1.25, bias: "BEARISH", confidence: "HIGH", components: [], drivers: [], coverage: 0.8, previous_score: null, delta: null };
    const brl: InstrumentScore = { score: -1, bias: "BEARISH", confidence: "MEDIUM", components: [{ key: "FISCAL_RISK", score: null, weight: 1, confidence: "LOW", reason: "", source: null }], drivers: [], coverage: 0.5, previous_score: 0.5, delta: -1.5 };
    const dol = computeDolScore({ score: 1.25, confidence: "HIGH" }, brl);
    const er = b3EventRisk([pend("USD", "CPI m/m", 10)], { now });
    const alerts = buildAlerts({ win, dol, brl, di, markets: { DXY: reading("DXY", -0.6) }, eventRisk: er, previous: { brl: 0.5 } });
    const codes = alerts.map((a) => a.code);
    expect(codes).toContain("WIN_BEARISH_DI_FALLING"); expect(codes).toContain("DOL_LONG_DXY_DOWN"); expect(codes).toContain("KEY_EVENT_IMMINENT"); expect(codes).toContain("BRL_SCORE_CHANGED"); expect(codes).toContain("FISCAL_NOT_SCORED");
    expect(alerts.find((a) => a.code === "BRL_SCORE_CHANGED")!.message).toContain("+0.50 to -1.00");
  });
});

describe("B3 — candidatos e checklist", () => {
  it("macro nunca é gatilho: candidato traz instruções de processo", () => {
    const win: InstrumentScore = { score: -1.25, bias: "BEARISH", confidence: "HIGH", components: [], drivers: ["US_EQUITIES -2: S&P"], coverage: 0.8, previous_score: null, delta: null };
    const brl: InstrumentScore = { score: -0.75, bias: "BEARISH", confidence: "MEDIUM", components: [], drivers: [], coverage: 0.5, previous_score: null, delta: null };
    const dol = computeDolScore({ score: 1.25, confidence: "HIGH" }, brl);
    const c = buildB3Candidates({ win, dol, regime: "RISK_OFF", eventRisk: [] });
    expect(c.map((x) => `${x.instrument}:${x.bias}`)).toEqual(["DOL:LONG", "WDO:LONG", "WIN:SHORT"]);
    expect(c[2].reason).toMatch(/sweep/); expect(c[0].priority).toBe(1);
  });
  it("checklist WIN: POI tocado sem sweep/displacement → NO_TRADE mesmo com macro alinhada", () => {
    const a: TechnicalAnalysis = { symbol: "WINZ26", image_quality: "GOOD", macro_bias: "SHORT", htf_bias: "BEARISH", draw_on_liquidity: [{ target: "SSL 135k", direction: "DOWN", timeframe: "H4", confidence: "MEDIUM" }], timeframes: [], poi: [{ type: "OB", direction: "BEARISH", timeframe: "H1", location: "138.2k", status: "BEING_TESTED", quality_note: "" }],
      location: { htf_premium_discount: "PREMIUM", poi_reached: true, poi_description: "OB H1", is_extended: false }, liquidity_sweep: false, liquidity_sweep_detail: { timeframe: null, description: null }, rejection: false, displacement: false, displacement_detail: { timeframe: null, created_fvg: false, description: null },
      mss: { present: false, type: "NONE", timeframe: null, follow_through: false, broke_what: null }, retest: { occurred: false, poi_type: "NONE", description: null }, entry_model: "MODEL_A_AGGRESSIVE", setup_grade: "B", status: "READY", disqualifiers: [], suggested_direction: "SHORT", wait_for: [], invalidation: "acima do OB", targets: ["SSL"], risk_recommendation: "REDUCED", management_notes: "", intermarket_note: null, warnings: [], confidence: "MEDIUM" };
    const r = buildB3Checklist(a, { instrument: "WIN", macro: null, macroBias: "SHORT" });
    expect(r.instrument).toBe("WIN"); expect(r.setup_grade).toBe("NO_TRADE"); expect(r.disqualifiers).toContain("POI_TOUCH_ONLY"); expect(r.macro_items.map((i) => i.key)).toEqual(["b3_regime", "b3_di", "b3_brl", "b3_useq", "b3_cmd"]); expect(r.macro_items.every((i) => i.ok === null)).toBe(true);
    const d = buildB3Checklist(a, { instrument: "DOL", macro: null });
    expect(d.macro_items.map((i) => i.key)).toEqual(["b3_usd", "b3_brl", "b3_div", "b3_dxy", "b3_yields", "b3_di"]);
  });
});

describe("B3 — schemas e mocks", () => {
  it("payloads válidos/ inválidos", () => {
    expect(DiCurveBody.safeParse({ contracts: [{ code: "DI1F27", tenor: "SHORT", rate: 14.85, change_bp: -5 }] }).success).toBe(true);
    expect(DiCurveBody.safeParse({ contracts: [{ code: "ABC", tenor: "SHORT", rate: 1, change_bp: 0 }] }).success).toBe(false);
    expect(MarketsBody.safeParse({ rows: [{ symbol: "DXY", value: 104.2, change_pct: 0.3, change_bp: null }] }).success).toBe(true);
    expect(B3AnalyzeBody.safeParse({ session: "OPEN", events: [{ date: "2026-10-02", time: "09:00", currency: "BRL", event: "IPCA m/m", impact: "high", actual: "0.4%", forecast: "0.3%", previous: "0.2%", source: "manual" }] }).success).toBe(true);
    expect(B3AnalyzeBody.safeParse({ session: "LONDON" }).success).toBe(false);
  });
  it("JSON Schema estrito + mock válido para market_extraction e b3_brief", () => {
    const js = toJsonSchema(MarketExtractionSchema) as { additionalProperties: boolean; required: string[] };
    expect(js.additionalProperties).toBe(false); expect(js.required).toContain("rows");
    expect(MarketExtractionSchema.safeParse(mockStructured("market_extraction", "")).success).toBe(true);
    expect(B3BriefSchema.safeParse(mockStructured("b3_brief", "")).success).toBe(true);
  });
  it("config mescla pesos parciais sem perder defaults", () => { const c = mergeB3Config({ win_weights: { DI_CURVE: 2 } as never }); expect(c.win_weights.DI_CURVE).toBe(2); expect(c.win_weights.US_EQUITIES).toBe(DEFAULT_B3_CONFIG.win_weights.US_EQUITIES); });
});
