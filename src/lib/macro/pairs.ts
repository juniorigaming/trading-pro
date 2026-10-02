/**
 * Matriz Forte × Fraca — divergência macro entre moedas e candidatos de pares.
 * Macro define QUE par e QUAL direção — nunca é gatilho de entrada.
 */
import { G8, type Confidence, type Currency, type CurrencyScoreView, type EventRiskLevel, type PendingEventView, type TradeCandidateView } from "@/lib/ai/types";
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

function combineConfidence(a: Confidence, b: Confidence): Confidence {
  const o = { HIGH: 2, MEDIUM: 1, LOW: 0 };
  const v = Math.min(o[a], o[b]);
  return v === 2 ? "HIGH" : v === 1 ? "MEDIUM" : "LOW";
}

export interface CandidateInput {
  scores: CurrencyScoreView[];
  pending: PendingEventView[]; // eventos pendentes (para event risk)
  eventRiskFor: (currencies: Currency[], pending: PendingEventView[]) => { level: EventRiskLevel; events: PendingEventView[] };
  cfg?: ScoringConfig;
  maxCandidates?: number;
}

/** Gera candidatos ordenados pela maior divergência. */
export function buildTradeCandidates(input: CandidateInput): TradeCandidateView[] {
  const cfg = input.cfg ?? DEFAULT_SCORING_CONFIG;
  const byCcy = Object.fromEntries(input.scores.map((s) => [s.currency, s])) as Record<Currency, CurrencyScoreView>;
  const list: TradeCandidateView[] = [];
  for (const p of G8_PAIRS) {
    const b = byCcy[p.base], q = byCcy[p.quote];
    if (!b || !q) continue;
    const div = Number((b.score - q.score).toFixed(2));
    if (Math.abs(div) < cfg.pair_min_divergence) continue;
    const bias: "LONG" | "SHORT" = div > 0 ? "LONG" : "SHORT";
    const strong = div > 0 ? b : q;
    const weak = div > 0 ? q : b;
    const risk = input.eventRiskFor([p.base, p.quote], input.pending);
    list.push({
      symbol: p.symbol, bias, strong_currency: strong.currency, weak_currency: weak.currency,
      strong_score: strong.score, weak_score: weak.score, macro_divergence: Math.abs(div),
      confidence: combineConfidence(b.confidence, q.confidence), priority: 0,
      event_risk: risk.level, event_risk_events: risk.events,
      reason: `${strong.currency} ${fmt(strong.score)} (${strong.classification}) vs ${weak.currency} ${fmt(weak.score)} (${weak.classification}) → divergência ${Math.abs(div).toFixed(2)}. ${bias} ${p.symbol} é o lado favorecido pela macro; aguardar confirmação SMC.`,
    });
  }
  const confOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  list.sort((a, b) => b.macro_divergence - a.macro_divergence || confOrder[a.confidence] - confOrder[b.confidence] || a.symbol.localeCompare(b.symbol));
  list.forEach((c, i) => (c.priority = i + 1));
  return list.slice(0, input.maxCandidates ?? 12);
}

function fmt(n: number) { return `${n > 0 ? "+" : ""}${n.toFixed(2)}`; }
