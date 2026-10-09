/**
 * Matriz Forte × Fraca — divergência macro entre moedas e candidatos de pares.
 * Macro define QUE par e QUAL direção — nunca é gatilho de entrada.
 */
import { G8, type Confidence, type Currency, type CurrencyScoreView, type EventRiskLevel, type PairStrengthClass, type PendingEventView, type TradeCandidateView } from "@/lib/ai/types";
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "./config";

/** Ordem de prioridade de base nas convenções de mercado (EUR > GBP > AUD > NZD > USD > CAD > CHF > JPY). */
const BASE_PRIORITY: Currency[] = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

/** Retorna o símbolo convencional para duas moedas, ex. (JPY, NZD) → NZDJPY. */
export function conventionalPair(a: Currency, b: Currency): { symbol: string; base: Currency; quote: Currency } {
  const [base, quote] = BASE_PRIORITY.indexOf(a) < BASE_PRIORITY.indexOf(b) ? [a, b] : [b, a];
  return { symbol: `${base}${quote}`, base, quote };
}

export const G8_PAIRS: { symbol: string; base: Currency; quote: Currency }[] = (() => {
  const out: { symbol: string; base: Currency; quote: Currency }[] = [];
  for (let i = 0; i < G8.length; i++) for (let j = i + 1; j < G8.length; j++) out.push(conventionalPair(G8[i], G8[j]));
  return out;
})();

/** Divide um símbolo em base/quote. Suporta sufixos de corretora (EURUSD.s, EURUSDm). */
export function splitSymbol(symbol: string): { base: string; quote: string } | null {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = s.match(/^([A-Z]{3})([A-Z]{3})/);
  if (!m) return null;
  return { base: m[1], quote: m[2] };
}

export interface DivergenceCell { strong: Currency; weak: Currency; divergence: number }

/** Matriz 8×8 de diferenças (linha − coluna). */
export function divergenceMatrix(scores: CurrencyScoreView[]): Record<Currency, Record<Currency, number>> {
  const map = Object.fromEntries(scores.map((s) => [s.currency, s.score])) as Record<Currency, number>;
  const out = {} as Record<Currency, Record<Currency, number>>;
  for (const a of G8) { out[a] = {} as Record<Currency, number>; for (const b of G8) out[a][b] = Number(((map[a] ?? 0) - (map[b] ?? 0)).toFixed(2)); }
  return out;
}


/** Converte o score nativo (−2..+2) para a escala de apresentação (−5..+5). */
export function toDisplayScale(score: number, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
  return Number((score * cfg.display_scale).toFixed(2));
}

/** Classifica a força relativa do par pela assimetria, já na escala −5..+5. */
export function classifyRelativeStrength(rel: number, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): PairStrengthClass {
  const a = Math.abs(rel);
  const b = cfg.pair_bands;
  if (a < b.neutral) return "NEUTRO";
  if (a >= b.strong) return rel > 0 ? "FORTE LONG" : "FORTE SHORT";
  if (a >= b.weak) return rel > 0 ? "LONG" : "SHORT";
  return "NEUTRO"; // entre neutral e weak: assimetria existe mas é fraca demais para direcionar
}

/** Rótulo da assimetria (texto do dashboard). */
export function divergenceLabel(rel: number, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): string {
  const a = Math.abs(rel);
  const b = cfg.pair_bands;
  if (a < b.neutral) return "praticamente neutro";
  if (a < b.weak) return "viés muito fraco";
  if (a < b.moderate) return "viés moderado";
  if (a < b.strong) return "viés forte";
  return "viés muito forte";
}

/**
 * Confiança 0–100 do par. Nunca deriva só da assimetria: uma diferença grande
 * apoiada em evidência fraca NÃO vira alta confiança.
 */
export function pairConfidencePct(base: CurrencyScoreView, quote: CurrencyScoreView, rel: number, risk: EventRiskLevel, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
  const cb = base.confidence_pct ?? 0, cq = quote.confidence_pct ?? 0;
  const legs = Math.min(cb, cq) * 0.6 + ((cb + cq) / 2) * 0.4; // a perna mais fraca manda
  const a = Math.abs(rel);
  const asym = Math.min(1, a / cfg.pair_bands.strong);         // 0..1
  const conflictPenalty = (base.conflict ? 0.85 : 1) * (quote.conflict ? 0.85 : 1);
  const riskPenalty = risk === "EXTREME" ? 0.75 : risk === "HIGH" ? 0.88 : 1;
  const noData = base.no_data || quote.no_data ? 0.4 : 1;
  const pct = legs * (0.55 + 0.45 * asym) * conflictPenalty * riskPenalty * noData;
  return Math.max(0, Math.min(99, Math.round(pct)));
}

export interface CandidateInput {
  scores: CurrencyScoreView[];
  pending: PendingEventView[]; // eventos pendentes (para event risk)
  eventRiskFor: (currencies: Currency[], pending: PendingEventView[]) => { level: EventRiskLevel; events: PendingEventView[] };
  cfg?: ScoringConfig;
  maxCandidates?: number;
}

/** Gera candidatos ordenados pela maior assimetria macro (força relativa), com confiança e invalidação. */
export function buildTradeCandidates(input: CandidateInput): TradeCandidateView[] {
  const cfg = input.cfg ?? DEFAULT_SCORING_CONFIG;
  const byCcy = Object.fromEntries(input.scores.map((s) => [s.currency, s])) as Record<Currency, CurrencyScoreView>;
  const list: TradeCandidateView[] = [];
  for (const p of G8_PAIRS) {
    const b = byCcy[p.base], q = byCcy[p.quote];
    if (!b || !q) continue;
    // Sem dado vivo numa das pernas não há viés macro — é ausência de evidência, não fraqueza.
    if (b.no_data || q.no_data) continue;
    const div = Number((b.score - q.score).toFixed(2));
    if (Math.abs(div) < cfg.pair_min_divergence) continue;
    const rel = Number((toDisplayScale(b.score, cfg) - toDisplayScale(q.score, cfg)).toFixed(2));
    const strengthClass = classifyRelativeStrength(rel, cfg);
    if (strengthClass === "NEUTRO") continue;
    const bias: "LONG" | "SHORT" = rel > 0 ? "LONG" : "SHORT";
    const strong = rel > 0 ? b : q;
    const weak = rel > 0 ? q : b;
    const risk = input.eventRiskFor([p.base, p.quote], input.pending);
    const confPct = pairConfidencePct(b, q, rel, risk.level, cfg);
    const invalidation = risk.events.slice(0, 4).map((e) => `${e.currency} ${e.event} (${e.minutes_until < 60 ? `${e.minutes_until}min` : `${(e.minutes_until / 60).toFixed(1)}h`})`);
    const mixed = b.conflict || q.conflict;
    list.push({
      symbol: p.symbol, bias, strong_currency: strong.currency, weak_currency: weak.currency,
      strong_score: strong.score, weak_score: weak.score, macro_divergence: Math.abs(div),
      confidence: confidenceEnumFromPct(confPct), priority: 0,
      event_risk: risk.level, event_risk_events: risk.events,
      relative_strength: rel, strength_class: strengthClass, confidence_pct: confPct,
      base_currency: p.base, quote_currency: p.quote,
      base_score: toDisplayScale(b.score, cfg), quote_score: toDisplayScale(q.score, cfg),
      invalidation_events: invalidation,
      reason: `${p.base} ${fmt(toDisplayScale(b.score, cfg))} vs ${p.quote} ${fmt(toDisplayScale(q.score, cfg))} → força relativa ${fmt(rel)} (${divergenceLabel(rel, cfg)}), confiança ${confPct}%.` +
        `${mixed ? " Há indicadores conflitantes numa das pernas (viés misto) — convicção reduzida." : ""}` +
        ` ${strengthClass} em ${p.symbol} é o lado favorecido pela macro; aguardar confirmação SMC/ICT.`,
    });
  }
  // Ordena pela assimetria ponderada pela confiança (evidência manda, não só o tamanho do Δ).
  list.sort((a, b) =>
    Math.abs(b.relative_strength ?? 0) * ((b.confidence_pct ?? 0) / 100) - Math.abs(a.relative_strength ?? 0) * ((a.confidence_pct ?? 0) / 100)
    || Math.abs(b.relative_strength ?? 0) - Math.abs(a.relative_strength ?? 0)
    || a.symbol.localeCompare(b.symbol));
  list.forEach((c, i) => (c.priority = i + 1));
  return list.slice(0, input.maxCandidates ?? 12);
}

function confidenceEnumFromPct(pct: number): Confidence {
  return pct >= 65 ? "HIGH" : pct >= 40 ? "MEDIUM" : "LOW";
}

function fmt(n: number) { return `${n > 0 ? "+" : ""}${n.toFixed(2)}`; }
