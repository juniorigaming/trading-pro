/**
 * Motor de score B3 — determinístico, auditável, sem IA.
 * - USD: reutiliza o motor G8 (mesmos eventos, mesma fórmula) — nunca há "dois USD".
 * - BRL: score de eventos (motor G8 aplicado a BRL) decomposto por categoria + contexto (DI, fiscal, fluxo, commodities, China, risk sentiment).
 * - WIN: componentes configuráveis (spec item 8). DOL: USD − BRL.
 * Componentes sem dado ficam score=null e NÃO entram na média (nunca se inventa número).
 */
import type { Confidence, CurrencyScoreView } from "@/lib/ai/types";
import { baseContribution, decayFactor, roundToStep, type ScoredEvent } from "@/lib/macro/scoring";
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "@/lib/macro/config";
import { DEFAULT_B3_CONFIG, type B3Config } from "./config";
import { diScoreForBrl, diScoreForWin } from "./di-curve";
import type { B3Alert, B3Candidate, B3EventRisk, B3Regime, Direction3, DolScore, FlowClass, InstrumentScore, IntermarketRow, MarketReading, ScoreComponent, DiCurveAnalysis } from "./types";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function clampStep(x: number, cfg: B3Config = DEFAULT_B3_CONFIG): number {
  return Math.max(-cfg.clamp, Math.min(cfg.clamp, roundToStep(x, cfg.score_step)));
}
export function biasOf(score: number, cfg: B3Config = DEFAULT_B3_CONFIG): "BULLISH" | "NEUTRAL" | "BEARISH" {
  return score >= cfg.bias_threshold ? "BULLISH" : score <= -cfg.bias_threshold ? "BEARISH" : "NEUTRAL";
}
const CONF_RANK: Record<Confidence, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
export function minConfidence(a: Confidence, b: Confidence): Confidence { return CONF_RANK[a] <= CONF_RANK[b] ? a : b; }

export function directionOf(changePct: number | null, changeBp: number | null, cfg: B3Config = DEFAULT_B3_CONFIG): Direction3 {
  if (changeBp !== null && Number.isFinite(changeBp)) return changeBp >= cfg.rate_move_bp.small ? "UP" : changeBp <= -cfg.rate_move_bp.small ? "DOWN" : "FLAT";
  if (changePct !== null && Number.isFinite(changePct)) return changePct >= cfg.market_move_pct.small ? "UP" : changePct <= -cfg.market_move_pct.small ? "DOWN" : "FLAT";
  return "UNKNOWN";
}

/** Converte variação de mercado em score −2..+2 (sinal = direção do ativo). */
function moveScore(r: MarketReading | null | undefined, cfg: B3Config): number | null {
  if (!r || r.stale) return null;
  if (r.change_bp !== null && Number.isFinite(r.change_bp)) { const a = Math.abs(r.change_bp); const m = a >= cfg.rate_move_bp.large ? 2 : a >= cfg.rate_move_bp.small ? 1 : 0; return Math.sign(r.change_bp) * m; }
  if (r.change_pct !== null && Number.isFinite(r.change_pct)) { const a = Math.abs(r.change_pct); const m = a >= cfg.market_move_pct.large ? 2 : a >= cfg.market_move_pct.small ? 1 : 0; return Math.sign(r.change_pct) * m; }
  return null;
}
const fmtMove = (r: MarketReading | null | undefined) => !r ? "sem dado" : r.change_bp !== null ? `${r.change_bp > 0 ? "+" : ""}${r.change_bp}bp` : r.change_pct !== null ? `${r.change_pct > 0 ? "+" : ""}${r.change_pct.toFixed(2)}%` : r.value !== null ? `${r.value}` : "sem variação";

/** Agrega componentes: média ponderada só do que tem dado; cobertura = peso com dado / peso total. */
export function aggregate(components: ScoreComponent[], cfg: B3Config = DEFAULT_B3_CONFIG): { score: number; raw: number; coverage: number; confidence: Confidence; drivers: string[] } {
  let num = 0, den = 0, total = 0, agree = 0;
  for (const c of components) {
    total += c.weight;
    if (c.score === null) continue;
    const cf = c.confidence === "HIGH" ? 1 : c.confidence === "MEDIUM" ? 0.8 : 0.5;
    num += c.score * c.weight * cf; den += c.weight * cf; agree += Math.sign(c.score) * c.weight * cf;
  }
  const raw = den > 0 ? num / den : 0;
  const coverage = total > 0 ? Number((den / total).toFixed(2)) : 0;
  const agreement = den > 0 ? Math.abs(agree) / den : 0;
  const withData = components.filter((c) => c.score !== null);
  let confidence: Confidence = "LOW";
  if (coverage >= cfg.min_coverage_for_high && agreement >= 0.5 && withData.length >= 4) confidence = "HIGH";
  else if (coverage >= cfg.min_coverage_for_medium && withData.length >= 2 && agreement >= 0.3) confidence = "MEDIUM";
  const drivers = [...withData].filter((c) => c.score !== 0).sort((a, b) => Math.abs(b.score! * b.weight) - Math.abs(a.score! * a.weight)).slice(0, 5).map((c) => `${c.key} ${c.score! > 0 ? "+" : ""}${c.score}: ${c.reason}`);
  return { score: clampStep(raw, cfg), raw: Number(raw.toFixed(4)), coverage, confidence, drivers };
}

// ---------------------------------------------------------------------------
// Score por categoria (reaproveita a fórmula do motor G8 para decompor BRL/CNY/USD)
// ---------------------------------------------------------------------------
export interface CategoryScore { score: number | null; n: number; weight: number; hot_cool?: string }
export function categoryScores(events: ScoredEvent[], currency: string, now: Date, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): Record<string, CategoryScore> {
  const out: Record<string, { num: number; den: number; n: number }> = {};
  for (const e of events) {
    if (e.currency !== currency || e.superseded || e.impact === "holiday") continue;
    const bc = baseContribution(e, cfg);
    const age = (now.getTime() - e.released_at.getTime()) / 86_400_000;
    const w = bc.weight * bc.impact_factor * bc.confidence_factor * decayFactor(e.category, age, cfg);
    if (w < cfg.min_weight_alive) continue;
    const o = (out[e.category] ??= { num: 0, den: 0, n: 0 });
    o.num += bc.direction_value * w; o.den += w; o.n++;
  }
  const res: Record<string, CategoryScore> = {};
  for (const [k, v] of Object.entries(out)) res[k] = { score: v.den > 0 ? Number((v.num / v.den).toFixed(2)) : null, n: v.n, weight: Number(v.den.toFixed(3)) };
  return res;
}

const confFromN = (n: number): Confidence => (n >= 3 ? "HIGH" : n >= 2 ? "MEDIUM" : "LOW");

// ---------------------------------------------------------------------------
// Inputs de contexto
// ---------------------------------------------------------------------------
export interface B3ScoringInput {
  now: Date;
  usd: CurrencyScoreView; // do motor G8
  brlEvents: CurrencyScoreView; // motor G8 aplicado a BRL
  cnyEvents: CurrencyScoreView | null;
  scoredEvents: ScoredEvent[]; // todas as moedas (para decompor por categoria)
  di: DiCurveAnalysis | null;
  markets: Record<string, MarketReading>; // por símbolo
  flow: { classification: FlowClass; value: number | null };
  previous?: { brl?: number | null; win?: number | null; dol?: number | null } | null;
  cfg?: B3Config;
  scoringCfg?: ScoringConfig;
}

export function classifyFlow(valueBrlMi: number | null | undefined, cfg: B3Config = DEFAULT_B3_CONFIG): FlowClass {
  if (valueBrlMi === null || valueBrlMi === undefined || !Number.isFinite(valueBrlMi)) return "UNKNOWN";
  if (valueBrlMi >= cfg.flow_threshold_brl_mi) return "INFLOW";
  if (valueBrlMi <= -cfg.flow_threshold_brl_mi) return "OUTFLOW";
  return "NEUTRAL";
}

/** Risk sentiment global a partir de SPX/NAS/VIX/DXY/US10Y (null sem dado). */
export function globalRiskScore(m: Record<string, MarketReading>, cfg: B3Config = DEFAULT_B3_CONFIG): { score: number | null; hint: "RISK_ON" | "RISK_OFF" | "MIXED" | "UNKNOWN"; parts: string[] } {
  const parts: string[] = []; let num = 0, den = 0;
  const add = (key: string, s: number | null, w: number, invert = false) => { if (s === null) return; const v = invert ? -s : s; num += v * w; den += w; parts.push(`${key} ${fmtMove(m[key])}`); };
  add("SPX", moveScore(m.SPX, cfg), 1); add("NAS100", moveScore(m.NAS100, cfg), 0.8); add("VIX", moveScore(m.VIX, cfg), 0.8, true); add("DXY", moveScore(m.DXY, cfg), 0.5, true); add("US10Y", moveScore(m.US10Y, cfg), 0.6, true);
  if (den === 0) return { score: null, hint: "UNKNOWN", parts };
  const s = num / den;
  return { score: Number(s.toFixed(2)), hint: s >= 0.5 ? "RISK_ON" : s <= -0.5 ? "RISK_OFF" : "MIXED", parts };
}

// ---------------------------------------------------------------------------
// BRL
// ---------------------------------------------------------------------------
export function computeBrlScore(i: B3ScoringInput): InstrumentScore {
  const cfg = i.cfg ?? DEFAULT_B3_CONFIG, scfg = i.scoringCfg ?? DEFAULT_SCORING_CONFIG;
  const cats = categoryScores(i.scoredEvents, "BRL", i.now, scfg);
  const w = cfg.brl_weights;
  const cat = (k: string) => cats[k] ?? { score: null, n: 0, weight: 0 };
  const comp: ScoreComponent[] = [];
  const cb = cat("CENTRAL_BANK");
  comp.push({ key: "BCB_POLICY", score: cb.score, weight: w.BCB_POLICY, confidence: confFromN(cb.n), reason: cb.n ? `${cb.n} evento(s) BCB/Copom interpretados (surpresa vs esperado, não só direção da Selic)` : "Sem decisão/comunicação do BCB interpretada", source: cb.n ? "events" : null });
  const inf = cat("INFLATION");
  comp.push({ key: "BRAZIL_INFLATION", score: inf.score, weight: w.BRAZIL_INFLATION, confidence: confFromN(inf.n), reason: inf.n ? `${inf.n} dado(s) de inflação (IPCA/IPCA-15/IGP-M) — classificação para o BRL` : "Sem dado de inflação", source: inf.n ? "events" : null });
  const act = ["GROWTH", "ACTIVITY", "EMPLOYMENT", "CONSUMPTION"].map(cat).filter((c) => c.score !== null);
  const actScore = act.length ? Number((act.reduce((s, c) => s + c.score! * c.weight, 0) / act.reduce((s, c) => s + c.weight, 0)).toFixed(2)) : null;
  comp.push({ key: "BRAZIL_ACTIVITY", score: actScore, weight: w.BRAZIL_ACTIVITY, confidence: confFromN(act.reduce((s, c) => s + c.n, 0)), reason: act.length ? `${act.reduce((s, c) => s + c.n, 0)} dado(s) de atividade/emprego` : "Sem dado de atividade", source: act.length ? "events" : null });
  const fis = cat("FISCAL");
  comp.push({ key: "FISCAL_RISK", score: fis.score, weight: w.FISCAL_RISK, confidence: confFromN(fis.n), reason: fis.n ? `${fis.n} dado(s) fiscais (primário/nominal/dívida/arrecadação)` : "Sem dado fiscal estruturado — risco fiscal não pontuado", source: fis.n ? "events" : null });
  const di = diScoreForBrl(i.di, cfg);
  comp.push({ key: "DI_CURVE", score: di.score, weight: w.DI_CURVE, confidence: i.di && !i.di.requires_manual_confirmation ? "MEDIUM" : "LOW", reason: di.reason, source: di.score === null ? null : "di_curve" });
  const flowScore = i.flow.classification === "INFLOW" ? 1 : i.flow.classification === "OUTFLOW" ? -1 : i.flow.classification === "NEUTRAL" ? 0 : null;
  comp.push({ key: "FOREIGN_FLOW", score: flowScore, weight: w.FOREIGN_FLOW, confidence: "MEDIUM", reason: flowScore === null ? "Fluxo estrangeiro não informado" : `Fluxo ${i.flow.classification}${i.flow.value !== null ? ` (R$ ${i.flow.value} mi)` : ""}`, source: flowScore === null ? null : "flow" });
  const iron = moveScore(i.markets.IRON_ORE, cfg), brent = moveScore(i.markets.BRENT, cfg) ?? moveScore(i.markets.WTI, cfg), copper = moveScore(i.markets.COPPER, cfg);
  const cmd = [iron, brent, copper].filter((x): x is number => x !== null);
  comp.push({ key: "COMMODITIES", score: cmd.length ? Number((cmd.reduce((a, b) => a + b, 0) / cmd.length).toFixed(2)) : null, weight: w.COMMODITIES, confidence: cmd.length >= 2 ? "MEDIUM" : "LOW", reason: cmd.length ? `Minério ${fmtMove(i.markets.IRON_ORE)} · Brent ${fmtMove(i.markets.BRENT ?? i.markets.WTI)}${copper !== null ? ` · Cobre ${fmtMove(i.markets.COPPER)}` : ""}` : "Sem cotação de commodities", source: cmd.length ? "market" : null });
  const cny = i.cnyEvents && i.cnyEvents.live_events > 0 ? i.cnyEvents.score : null;
  comp.push({ key: "CHINA", score: cny, weight: w.CHINA, confidence: i.cnyEvents ? confFromN(i.cnyEvents.live_events) : "LOW", reason: cny === null ? "Sem dado chinês interpretado" : `China score ${cny > 0 ? "+" : ""}${cny} (${i.cnyEvents!.live_events} dado(s)) → transmissão via minério/commodities`, source: cny === null ? null : "events" });
  // Carry: só com DI curto e US02Y disponíveis
  const diShort = i.di?.short.rate ?? null, us02 = i.markets.US02Y?.value ?? null;
  let carry: number | null = null; let carryReason = "Carry não avaliado (precisa DI curto e US02Y)";
  if (diShort !== null && us02 !== null) { const diff = diShort - us02; carry = diff >= 10 ? 1 : diff >= 7 ? 0.5 : diff >= 4 ? 0 : -0.5; carryReason = `Diferencial DI curto − US02Y = ${diff.toFixed(2)} p.p.`; if (i.di?.short.state === "DOWN" && carry > 0) { carry -= 0.5; carryReason += " (curto caindo reduz atratividade)"; } }
  comp.push({ key: "CARRY", score: carry, weight: w.CARRY, confidence: "MEDIUM", reason: carryReason, source: carry === null ? null : "derived" });
  const gr = globalRiskScore(i.markets, cfg);
  comp.push({ key: "GLOBAL_RISK_SENTIMENT", score: gr.score, weight: w.GLOBAL_RISK_SENTIMENT, confidence: gr.parts.length >= 3 ? "MEDIUM" : "LOW", reason: gr.parts.length ? `${gr.hint}: ${gr.parts.join(", ")}` : "Sem leitura de risk sentiment (S&P/NAS/VIX/DXY/US10Y)", source: gr.score === null ? null : "market" });
  const dxy = moveScore(i.markets.DXY, cfg);
  comp.push({ key: "USD_PRESSURE", score: dxy === null ? null : -dxy, weight: w.USD_PRESSURE, confidence: "MEDIUM", reason: dxy === null ? "DXY não informado" : `DXY ${fmtMove(i.markets.DXY)} (dólar global ${dxy > 0 ? "pressiona" : dxy < 0 ? "alivia" : "neutro p/"} BRL)`, source: dxy === null ? null : "market" });

  const ag = aggregate(comp, cfg);
  const prev = i.previous?.brl ?? null;
  return { score: ag.score, bias: biasOf(ag.score, cfg), confidence: ag.confidence, components: comp, drivers: ag.drivers, coverage: ag.coverage, previous_score: prev, delta: prev === null ? null : Number((ag.score - prev).toFixed(2)) };
}

// ---------------------------------------------------------------------------
// WIN
// ---------------------------------------------------------------------------
export function computeWinScore(i: B3ScoringInput, brl: InstrumentScore): InstrumentScore {
  const cfg = i.cfg ?? DEFAULT_B3_CONFIG, scfg = i.scoringCfg ?? DEFAULT_SCORING_CONFIG;
  const cats = categoryScores(i.scoredEvents, "BRL", i.now, scfg);
  const cat = (k: string) => cats[k] ?? { score: null, n: 0, weight: 0 };
  const w = cfg.win_weights;
  const comp: ScoreComponent[] = [];
  // Doméstico: atividade forte = + bolsa; inflação quente = − (via juros); BCB hawkish = −; fiscal ruim = −
  const act = ["GROWTH", "ACTIVITY", "EMPLOYMENT", "CONSUMPTION"].map(cat).filter((c) => c.score !== null);
  const actScore = act.length ? Number((act.reduce((s, c) => s + c.score! * c.weight, 0) / act.reduce((s, c) => s + c.weight, 0)).toFixed(2)) : null;
  comp.push({ key: "BRAZIL_ACTIVITY", score: actScore, weight: w.BRAZIL_ACTIVITY, confidence: confFromN(act.reduce((s, c) => s + c.n, 0)), reason: act.length ? "Atividade/emprego (positivo p/ lucros domésticos)" : "Sem dado de atividade", source: act.length ? "events" : null });
  const inf = cat("INFLATION");
  comp.push({ key: "BRAZIL_INFLATION", score: inf.score === null ? null : -inf.score, weight: w.BRAZIL_INFLATION, confidence: confFromN(inf.n), reason: inf.n ? "Inflação (quente = pressão via juros; fria = alívio)" : "Sem dado de inflação", source: inf.n ? "events" : null });
  const cb = cat("CENTRAL_BANK");
  comp.push({ key: "BCB_POLICY", score: cb.score === null ? null : -cb.score, weight: w.BCB_POLICY, confidence: confFromN(cb.n), reason: cb.n ? "BCB: surpresa hawkish pesa em bolsa; dovish alivia" : "Sem comunicação do BCB interpretada", source: cb.n ? "events" : null });
  const di = diScoreForWin(i.di, cfg);
  comp.push({ key: "DI_CURVE", score: di.score, weight: w.DI_CURVE, confidence: i.di && !i.di.requires_manual_confirmation ? "MEDIUM" : "LOW", reason: di.reason, source: di.score === null ? null : "di_curve" });
  const fis = cat("FISCAL");
  comp.push({ key: "FISCAL_RISK", score: fis.score, weight: w.FISCAL_RISK, confidence: confFromN(fis.n), reason: fis.n ? "Dados fiscais (deterioração = prêmio de risco)" : "Sem dado fiscal estruturado", source: fis.n ? "events" : null });
  comp.push({ key: "BRL", score: brl.coverage > 0 ? brl.score : null, weight: w.BRL, confidence: brl.confidence, reason: brl.coverage > 0 ? `BRL ${brl.score > 0 ? "+" : ""}${brl.score} (câmbio forte costuma acompanhar fluxo p/ bolsa)` : "BRL sem dados", source: brl.coverage > 0 ? "derived" : null });
  const flowScore = i.flow.classification === "INFLOW" ? 1 : i.flow.classification === "OUTFLOW" ? -1 : i.flow.classification === "NEUTRAL" ? 0 : null;
  comp.push({ key: "FOREIGN_FLOW", score: flowScore, weight: w.FOREIGN_FLOW, confidence: "MEDIUM", reason: flowScore === null ? "Fluxo estrangeiro não informado" : `Fluxo ${i.flow.classification}${i.flow.value !== null ? ` (R$ ${i.flow.value} mi)` : ""}`, source: flowScore === null ? null : "flow" });
  const spx = moveScore(i.markets.SPX, cfg), nas = moveScore(i.markets.NAS100, cfg);
  const useq = spx !== null && nas !== null ? (spx + nas) / 2 : spx ?? nas;
  comp.push({ key: "US_EQUITIES", score: useq, weight: w.US_EQUITIES, confidence: spx !== null && nas !== null ? "HIGH" : "MEDIUM", reason: useq === null ? "S&P/NAS não informados" : `S&P ${fmtMove(i.markets.SPX)} · NAS ${fmtMove(i.markets.NAS100)}`, source: useq === null ? null : "market" });
  const y10 = moveScore(i.markets.US10Y, cfg), y02 = moveScore(i.markets.US02Y, cfg);
  const yl = y10 ?? y02;
  comp.push({ key: "US_YIELDS", score: yl === null ? null : -yl, weight: w.US_YIELDS, confidence: "MEDIUM", reason: yl === null ? "US10Y/US02Y não informados" : `US10Y ${fmtMove(i.markets.US10Y)} · US02Y ${fmtMove(i.markets.US02Y)} (yields ↑ = pressão em EM)`, source: yl === null ? null : "market" });
  const dxy = moveScore(i.markets.DXY, cfg);
  comp.push({ key: "DXY", score: dxy === null ? null : -dxy, weight: w.DXY, confidence: "MEDIUM", reason: dxy === null ? "DXY não informado" : `DXY ${fmtMove(i.markets.DXY)}`, source: dxy === null ? null : "market" });
  const cny = i.cnyEvents && i.cnyEvents.live_events > 0 ? i.cnyEvents.score : null;
  comp.push({ key: "CHINA", score: cny, weight: w.CHINA, confidence: i.cnyEvents ? confFromN(i.cnyEvents.live_events) : "LOW", reason: cny === null ? "Sem dado chinês interpretado" : `China ${cny > 0 ? "+" : ""}${cny} → VALE/minério/commodities`, source: cny === null ? null : "events" });
  const iron = moveScore(i.markets.IRON_ORE, cfg);
  comp.push({ key: "IRON_ORE", score: iron, weight: w.IRON_ORE, confidence: "MEDIUM", reason: iron === null ? "Minério não informado" : `Minério ${fmtMove(i.markets.IRON_ORE)} (peso VALE no IBOV)`, source: iron === null ? null : "market" });
  const oil = moveScore(i.markets.BRENT, cfg) ?? moveScore(i.markets.WTI, cfg);
  comp.push({ key: "OIL", score: oil, weight: w.OIL, confidence: "MEDIUM", reason: oil === null ? "Brent/WTI não informados" : `Petróleo ${fmtMove(i.markets.BRENT ?? i.markets.WTI)} (PETR no IBOV)`, source: oil === null ? null : "market" });
  const gr = globalRiskScore(i.markets, cfg);
  comp.push({ key: "GLOBAL_RISK_SENTIMENT", score: gr.score, weight: w.GLOBAL_RISK_SENTIMENT, confidence: gr.parts.length >= 3 ? "MEDIUM" : "LOW", reason: gr.parts.length ? `${gr.hint}: ${gr.parts.join(", ")}` : "Sem leitura de risk sentiment", source: gr.score === null ? null : "market" });

  const ag = aggregate(comp, cfg);
  const prev = i.previous?.win ?? null;
  return { score: ag.score, bias: biasOf(ag.score, cfg), confidence: ag.confidence, components: comp, drivers: ag.drivers, coverage: ag.coverage, previous_score: prev, delta: prev === null ? null : Number((ag.score - prev).toFixed(2)) };
}

// ---------------------------------------------------------------------------
// DOL = USD − BRL
// ---------------------------------------------------------------------------
export function computeDolScore(usd: { score: number; confidence: Confidence }, brl: InstrumentScore, previousDivergence: number | null = null, cfg: B3Config = DEFAULT_B3_CONFIG): DolScore {
  const divergence = Number((usd.score - brl.score).toFixed(2));
  const bias: DolScore["bias"] = divergence >= cfg.dol_min_divergence ? "LONG" : divergence <= -cfg.dol_min_divergence ? "SHORT" : "NEUTRAL";
  const drivers = [`USD ${usd.score > 0 ? "+" : ""}${usd.score.toFixed(2)} (motor G8)`, `BRL ${brl.score > 0 ? "+" : ""}${brl.score.toFixed(2)}`, ...brl.drivers.slice(0, 3)];
  return { usd_score: usd.score, brl_score: brl.score, divergence, bias, confidence: minConfidence(usd.confidence, brl.confidence), drivers, previous_divergence: previousDivergence, delta: previousDivergence === null ? null : Number((divergence - previousDivergence).toFixed(2)) };
}

// ---------------------------------------------------------------------------
// Regime
// ---------------------------------------------------------------------------
export function classifyRegime(p: { global: { score: number | null; hint: string }; win: InstrumentScore; brl: InstrumentScore; di: DiCurveAnalysis | null; eventRisk: B3EventRisk[] }): B3Regime {
  if (p.eventRisk.some((r) => r.level === "EXTREME")) return "HIGH_EVENT_RISK";
  const domestic = [p.win.components, p.brl.components].flat().filter((c) => ["BRAZIL_ACTIVITY", "BCB_POLICY", "FISCAL_RISK", "DI_CURVE", "FOREIGN_FLOW", "BRAZIL_INFLATION"].includes(c.key) && c.score !== null);
  const domScore = domestic.length ? domestic.reduce((s, c) => s + c.score! * c.weight, 0) / domestic.reduce((s, c) => s + c.weight, 0) : null;
  const g = p.global.score;
  if (g !== null && g >= 0.5 && (domScore === null || domScore >= -0.25)) return "RISK_ON";
  if (g !== null && g <= -0.5 && (domScore === null || domScore <= 0.25)) return "RISK_OFF";
  if (domScore !== null && domScore >= 0.5 && (g === null || Math.abs(g) < 0.5)) return "DOMESTIC_BULLISH";
  if (domScore !== null && domScore <= -0.5 && (g === null || Math.abs(g) < 0.5)) return "DOMESTIC_BEARISH";
  return "MIXED";
}

// ---------------------------------------------------------------------------
// Intermarket (painel) — direção, variação, contribuição, aviso de correlação
// ---------------------------------------------------------------------------
const IM_LABEL: Record<string, string> = { IBOV: "IBOV", WIN: "WIN", DOL: "DOL", WDO: "WDO", USDBRL: "USD/BRL", SPX: "S&P 500", NAS100: "NAS100", DXY: "DXY", US10Y: "US10Y", US02Y: "US02Y", BRENT: "Brent", WTI: "WTI", IRON_ORE: "Minério", COPPER: "Cobre", VIX: "VIX", FOREIGN_FLOW: "Fluxo estrangeiro" };
export function buildIntermarket(markets: Record<string, MarketReading>, di: DiCurveAnalysis | null, win: InstrumentScore, cfg: B3Config = DEFAULT_B3_CONFIG): IntermarketRow[] {
  const rows: IntermarketRow[] = [];
  const contrib = (key: string) => win.components.find((c) => c.key === key)?.score ?? null;
  const push = (symbol: string, r: MarketReading | null, key: string | null, applies: ("WIN" | "DOL")[], corr: (r: MarketReading) => string | null) => {
    const reading = r ?? { symbol, value: null, change_pct: null, change_bp: null, direction: "UNKNOWN" as Direction3, captured_at: null, source: "none", stale: true };
    rows.push({ ...reading, label: IM_LABEL[symbol] ?? symbol, score_contribution: key ? contrib(key) : null, correlation_warning: r ? corr(r) : null, applies_to: applies });
  };
  const winDir = win.bias === "BULLISH" ? "UP" : win.bias === "BEARISH" ? "DOWN" : null;
  push("IBOV", markets.IBOV ?? markets.WIN ?? null, null, ["WIN"], (r) => winDir && r.direction !== "UNKNOWN" && r.direction !== "FLAT" && r.direction !== winDir ? `IBOV ${r.direction} contra o viés macro ${win.bias} — preço discorda do macro` : null);
  push("USDBRL", markets.USDBRL ?? markets.DOL ?? markets.WDO ?? null, null, ["DOL"], () => null);
  push("DI_SHORT", di && di.short.code ? { symbol: di.short.code, value: di.short.rate, change_pct: null, change_bp: di.short.change_bp, direction: di.short.state, captured_at: null, source: "di_curve", stale: false } : null, "DI_CURVE", ["WIN", "DOL"], () => null);
  push("DI_LONG", di && di.long.code ? { symbol: di.long.code, value: di.long.rate, change_pct: null, change_bp: di.long.change_bp, direction: di.long.state, captured_at: null, source: "di_curve", stale: false } : null, "DI_CURVE", ["WIN", "DOL"], (r) => winDir === "UP" && r.direction === "UP" ? "WIN bullish com DI longo subindo — conflito juros × bolsa" : winDir === "DOWN" && r.direction === "DOWN" ? "WIN bearish mas DI longo caindo forte — sinal conflitante" : null);
  push("SPX", markets.SPX ?? null, "US_EQUITIES", ["WIN"], (r) => winDir && r.direction !== "UNKNOWN" && r.direction !== "FLAT" && r.direction !== winDir ? `S&P ${r.direction} contra viés WIN ${win.bias}` : null);
  push("NAS100", markets.NAS100 ?? null, "US_EQUITIES", ["WIN"], () => null);
  push("DXY", markets.DXY ?? null, "DXY", ["WIN", "DOL"], (r) => r.direction === "UP" && winDir === "UP" ? "DXY subindo com WIN bullish — atenção ao fluxo" : null);
  push("US10Y", markets.US10Y ?? null, "US_YIELDS", ["WIN", "DOL"], () => null);
  push("US02Y", markets.US02Y ?? null, "US_YIELDS", ["DOL"], () => null);
  push("BRENT", markets.BRENT ?? markets.WTI ?? null, "OIL", ["WIN"], () => null);
  push("IRON_ORE", markets.IRON_ORE ?? null, "IRON_ORE", ["WIN"], (r) => r.direction === "DOWN" && winDir === "UP" ? "Minério caindo com WIN bullish — VALE pode pesar" : null);
  push("VIX", markets.VIX ?? null, "GLOBAL_RISK_SENTIMENT", ["WIN", "DOL"], (r) => r.direction === "UP" && winDir === "UP" ? "VIX subindo com WIN bullish — risk-off latente" : null);
  push("FOREIGN_FLOW", markets.FOREIGN_FLOW ?? null, "FOREIGN_FLOW", ["WIN", "DOL"], () => null);
  void cfg;
  return rows;
}

// ---------------------------------------------------------------------------
// Candidatos — macro define instrumento e direção; nunca é gatilho
// ---------------------------------------------------------------------------
export function buildB3Candidates(p: { win: InstrumentScore; dol: DolScore; regime: B3Regime; eventRisk: B3EventRisk[]; cfg?: B3Config }): B3Candidate[] {
  const cfg = p.cfg ?? DEFAULT_B3_CONFIG;
  const out: B3Candidate[] = [];
  const er = (i: "WIN" | "DOL") => p.eventRisk.find((r) => r.instrument === i) ?? { level: "LOW" as const, events: [] };
  if (Math.abs(p.win.score) >= cfg.win_min_score && p.win.bias !== "NEUTRAL") {
    const r = er("WIN");
    out.push({ instrument: "WIN", bias: p.win.bias === "BULLISH" ? "LONG" : "SHORT", score: p.win.score, usd_score: null, brl_score: null, regime: p.regime, confidence: p.win.confidence, priority: 0, event_risk: r.level, event_risk_events: r.events,
      reason: `WIN macro ${p.win.bias} (${p.win.score > 0 ? "+" : ""}${p.win.score}, regime ${p.regime}). Procurar apenas setups ${p.win.bias === "BULLISH" ? "LONG" : "SHORT"} quando a estrutura confirmar: sweep de liquidez → displacement → MSS → retest. Drivers: ${p.win.drivers.slice(0, 3).join("; ") || "n/d"}.` });
  }
  if (p.dol.bias !== "NEUTRAL") {
    const r = er("DOL");
    for (const inst of ["DOL", "WDO"] as const) out.push({ instrument: inst, bias: p.dol.bias as "LONG" | "SHORT", score: p.dol.divergence, usd_score: p.dol.usd_score, brl_score: p.dol.brl_score, regime: p.regime, confidence: p.dol.confidence, priority: 0, event_risk: r.level, event_risk_events: r.events,
      reason: `USD ${p.dol.usd_score > 0 ? "+" : ""}${p.dol.usd_score.toFixed(2)} × BRL ${p.dol.brl_score > 0 ? "+" : ""}${p.dol.brl_score.toFixed(2)} → divergência ${p.dol.divergence > 0 ? "+" : ""}${p.dol.divergence.toFixed(2)} → ${p.dol.bias} ${inst}. Executar só após sweep + POI + displacement + MSS + retest.` });
  }
  const confRank = { HIGH: 0, MEDIUM: 1, LOW: 2 }, riskRank = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 };
  out.sort((a, b) => Math.abs(b.score) - Math.abs(a.score) || confRank[a.confidence] - confRank[b.confidence] || riskRank[a.event_risk] - riskRank[b.event_risk]);
  out.forEach((c, i) => (c.priority = i + 1));
  return out;
}

// ---------------------------------------------------------------------------
// Alertas (spec item 31)
// ---------------------------------------------------------------------------
export function buildAlerts(p: { win: InstrumentScore; dol: DolScore; brl: InstrumentScore; di: DiCurveAnalysis | null; markets: Record<string, MarketReading>; eventRisk: B3EventRisk[]; previous?: { brl?: number | null; win?: number | null; dol?: number | null } | null; cfg?: B3Config }): B3Alert[] {
  const cfg = p.cfg ?? DEFAULT_B3_CONFIG;
  const a: B3Alert[] = [];
  const diLong = p.di?.long.change_bp ?? null;
  if (p.win.bias === "BEARISH" && diLong !== null && diLong <= -cfg.rate_move_bp.large) a.push({ level: "WARNING", code: "WIN_BEARISH_DI_FALLING", instrument: "WIN", message: `WIN bearish macro but DI falling sharply (${diLong}bp) — conflicting signal.` });
  if (p.win.bias === "BULLISH" && diLong !== null && diLong >= cfg.rate_move_bp.large) a.push({ level: "WARNING", code: "WIN_BULLISH_DI_RISING", instrument: "WIN", message: `WIN bullish macro but DI rising sharply (+${diLong}bp) — conflicting signal.` });
  const dxy = p.markets.DXY;
  if (p.dol.bias === "LONG" && dxy && dxy.direction === "DOWN") a.push({ level: "WARNING", code: "DOL_LONG_DXY_DOWN", instrument: "DOL", message: "DOL long macro divergence, but DXY falling today — check global USD before looking for longs." });
  if (p.dol.bias === "SHORT" && dxy && dxy.direction === "UP") a.push({ level: "WARNING", code: "DOL_SHORT_DXY_UP", instrument: "DOL", message: "DOL short macro divergence, but DXY rising today — conflicting signal." });
  for (const r of p.eventRisk) {
    const soon = r.events.filter((e) => e.key_event && e.minutes_until >= 0 && e.minutes_until <= 60);
    for (const e of soon.slice(0, 2)) a.push({ level: "DANGER", code: "KEY_EVENT_IMMINENT", instrument: r.instrument, message: `${r.instrument} ${r.instrument === "DOL" ? (p.dol.bias !== "NEUTRAL" ? p.dol.bias.toLowerCase() + " macro divergence" : "macro") : p.win.bias.toLowerCase() + " macro"}, but ${e.currency} event (${e.event}) in ${e.minutes_until} minutes.` });
    if (r.level === "HIGH" || r.level === "EXTREME") { const k = r.next_key_event ?? r.events[0]?.event ?? "evento"; if (!a.some((x) => x.code === "HIGH_EVENT_RISK" && x.message.includes(k))) a.push({ level: r.level === "EXTREME" ? "DANGER" : "WARNING", code: "HIGH_EVENT_RISK", instrument: r.instrument, message: `High event risk: ${k}.` }); }
  }
  const prevBrl = p.previous?.brl ?? null;
  if (prevBrl !== null && Math.abs(p.brl.score - prevBrl) >= 0.75) a.push({ level: "INFO", code: "BRL_SCORE_CHANGED", instrument: "BOTH", message: `BRL score changed from ${prevBrl > 0 ? "+" : ""}${prevBrl.toFixed(2)} to ${p.brl.score > 0 ? "+" : ""}${p.brl.score.toFixed(2)}.` });
  const prevWin = p.previous?.win ?? null;
  if (prevWin !== null && Math.sign(prevWin) !== Math.sign(p.win.score) && Math.abs(p.win.score - prevWin) >= 1) a.push({ level: "WARNING", code: "WIN_NARRATIVE_SHIFT", instrument: "WIN", message: `WIN macro flipped from ${prevWin > 0 ? "+" : ""}${prevWin.toFixed(2)} to ${p.win.score > 0 ? "+" : ""}${p.win.score.toFixed(2)} — reduce conviction until confirmed.` });
  if (p.win.coverage < cfg.min_coverage_for_medium) a.push({ level: "INFO", code: "LOW_DATA_COVERAGE", instrument: "WIN", message: `WIN score cobre só ${(p.win.coverage * 100).toFixed(0)}% dos componentes — informe DI, exterior e commodities para confiança.` });
  const fis = p.brl.components.find((c) => c.key === "FISCAL_RISK");
  if (fis && fis.score === null) a.push({ level: "INFO", code: "FISCAL_NOT_SCORED", instrument: "BOTH", message: "Risco fiscal não pontuado (sem dado estruturado). Não assuma neutralidade." });
  return a;
}
