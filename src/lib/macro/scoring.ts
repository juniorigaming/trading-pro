/**
 * Motor de score G8 — determinístico, auditável, sem IA.
 * contribution = direction_value × importance_weight × category_multiplier × impact_factor × confidence_factor × decay(idade)
 * score(ccy) = média ponderada das contribuições vivas, arredondada em passos (0.25) e limitada a ±2.
 */
import { G8, type Category, type Classification, type Confidence, type Currency, type CurrencyScoreView, type Importance, type Momentum, type ScoreClassification } from "@/lib/ai/types";
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "./config";

export interface ScoredEvent {
  event_id: number;
  currency: Currency;
  event: string;
  impact: "high" | "medium" | "low" | "holiday" | "unknown";
  released_at: Date; // scheduled_at do evento (quando saiu)
  superseded: boolean;
  category: Category;
  importance: Importance;
  classification: Classification;
  confidence: Confidence;
}

export interface ContributionBreakdown {
  direction_value: number;
  weight: number; // importance × category
  impact_factor: number;
  confidence_factor: number;
  base_contribution: number; // sem decaimento (salvo em macro_interpretations.score_contribution)
}

/** Contribuição-base (sem decaimento) — gravada junto da interpretação para auditoria. */
export function baseContribution(e: Pick<ScoredEvent, "category" | "importance" | "classification" | "confidence" | "impact">, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): ContributionBreakdown {
  const direction_value = cfg.direction_value[e.classification] ?? 0;
  const weight = (cfg.importance_weight[e.importance] ?? 0.25) * (cfg.category_multiplier[e.category] ?? 0.3);
  const impact_factor = cfg.impact_factor[e.impact] ?? 0.5;
  const confidence_factor = cfg.confidence_factor[e.confidence] ?? 0.4;
  return { direction_value, weight, impact_factor, confidence_factor, base_contribution: direction_value * weight * impact_factor * confidence_factor };
}

export function decayFactor(category: Category, ageDays: number, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
  if (ageDays < 0) ageDays = 0;
  if (ageDays > cfg.max_age_days) return 0;
  const hl = (cfg.half_life_days as Record<string, number>)[category] ?? cfg.half_life_days.default;
  return Math.pow(0.5, ageDays / hl);
}

export function roundToStep(x: number, step: number): number {
  const r = Math.round(x / step) * step;
  return Object.is(r, -0) ? 0 : Number(r.toFixed(4));
}

export function classifyScore(score: number, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): ScoreClassification {
  const t = cfg.classification_thresholds;
  if (score >= t.very_strong) return "VERY_STRONG";
  if (score >= t.strong) return "STRONG";
  if (score >= t.moderately_strong) return "MODERATELY_STRONG";
  if (score <= -t.very_strong) return "VERY_WEAK";
  if (score <= -t.strong) return "WEAK";
  if (score <= -t.moderately_strong) return "MODERATELY_WEAK";
  return "NEUTRAL";
}

export function biasFromScore(score: number, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): "BULLISH" | "NEUTRAL" | "BEARISH" {
  if (score >= cfg.classification_thresholds.moderately_strong) return "BULLISH";
  if (score <= -cfg.classification_thresholds.moderately_strong) return "BEARISH";
  return "NEUTRAL";
}

export function momentumFrom(score: number, previous: number | null, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): Momentum | null {
  if (previous === null || previous === undefined) return null;
  const delta = score - previous;
  if (Math.abs(delta) >= cfg.narrative_shift_min_delta && Math.sign(score) !== 0 && Math.sign(previous) !== 0 && Math.sign(score) !== Math.sign(previous)) return "NARRATIVE_SHIFT";
  if (delta >= cfg.momentum_min_delta) return "STRENGTHENING";
  if (delta <= -cfg.momentum_min_delta) return "WEAKENING";
  return "STABLE";
}

/** Confiança do score: nº de eventos vivos e concordância de direção entre eles. */
export function confidenceFor(liveWeights: { w: number; dir: number }[]): Confidence {
  if (liveWeights.length === 0) return "LOW";
  const total = liveWeights.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return "LOW";
  const signed = liveWeights.reduce((s, x) => s + x.w * Math.sign(x.dir), 0);
  const agreement = Math.abs(signed) / total; // 1 = todos na mesma direção
  if (liveWeights.length >= 3 && agreement >= 0.6) return "HIGH";
  if (liveWeights.length >= 2 && agreement >= 0.4) return "MEDIUM";
  if (liveWeights.length >= 1 && agreement >= 0.8 && liveWeights.length >= 2) return "MEDIUM";
  return "LOW";
}

export interface ComputeInput {
  events: ScoredEvent[];
  now: Date;
  previousScores?: Partial<Record<Currency, number>>; // último snapshot
  cfg?: ScoringConfig;
}

/** Calcula o score das 8 moedas + ranking. Puro: mesma entrada ⇒ mesma saída. */
export function computeCurrencyScores(input: ComputeInput): CurrencyScoreView[] {
  const cfg = input.cfg ?? DEFAULT_SCORING_CONFIG;
  const out: CurrencyScoreView[] = [];
  for (const ccy of G8) {
    const evs = input.events.filter((e) => e.currency === ccy && !e.superseded && e.impact !== "holiday");
    let num = 0, den = 0;
    const live: { w: number; dir: number }[] = [];
    const drivers: CurrencyScoreView["drivers"] = [];
    for (const e of evs) {
      const bc = baseContribution(e, cfg);
      const ageDays = (input.now.getTime() - e.released_at.getTime()) / 86_400_000;
      const decay = decayFactor(e.category, ageDays, cfg);
      const w = bc.weight * bc.impact_factor * bc.confidence_factor * decay;
      if (w < cfg.min_weight_alive) continue;
      num += bc.direction_value * w;
      den += w;
      live.push({ w, dir: bc.direction_value });
      drivers.push({ event_id: e.event_id, event: e.event, classification: e.classification, weight: Number(w.toFixed(4)), released_at: e.released_at.toISOString() });
    }
    const raw = den > 0 ? num / den : 0; // já em −2..+2 (média ponderada de direction_value)
    const score = Math.max(-cfg.clamp, Math.min(cfg.clamp, roundToStep(raw, cfg.score_step)));
    const previous = input.previousScores?.[ccy] ?? null;
    drivers.sort((a, b) => b.weight - a.weight);
    out.push({
      currency: ccy, score, score_raw: Number(raw.toFixed(4)), previous_score: previous,
      score_delta: previous === null ? null : Number((score - previous).toFixed(4)),
      momentum: momentumFrom(score, previous, cfg),
      classification: classifyScore(score, cfg), bias: biasFromScore(score, cfg), confidence: confidenceFor(live),
      rank: 0, live_events: live.length, drivers: drivers.slice(0, 6),
    });
  }
  // ranking: score desc, desempate por score_raw, depois confiança
  const confOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  out.sort((a, b) => b.score - a.score || b.score_raw - a.score_raw || confOrder[a.confidence] - confOrder[b.confidence] || a.currency.localeCompare(b.currency));
  out.forEach((c, i) => (c.rank = i + 1));
  return out;
}

/** event_key normalizado para supersede: 'USD|core_cpi_mom' */
export function normalizeEventKey(currency: string, event: string): string {
  const k = event.toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(flash|final|prelim|preliminary|revised|rev)\b/g, " ")
    .replace(/[^a-z0-9%/ ]+/g, " ")
    .replace(/\s+/g, " ").trim()
    .replace(/ /g, "_").replace(/\//g, "_").replace(/%/g, "pct");
  return `${currency.toUpperCase()}|${k}`;
}

/** Converte '2.4%', '-0.1', '150K', '1.25B', '10 000.00' em número (ou null). */
export function parseNumeric(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s/g, "").replace(/,/g, ".");
  if (!s || /^(n\/?a|-|—)$/i.test(s)) return null;
  const m = s.match(/^([<>]?)(-?\d+(?:\.\d+)?)([%kmbt]?)$/i);
  if (!m) return null;
  let n = parseFloat(m[2]);
  const suf = m[3].toLowerCase();
  if (suf === "k") n *= 1e3; else if (suf === "m") n *= 1e6; else if (suf === "b") n *= 1e9; else if (suf === "t") n *= 1e12;
  return Number.isFinite(n) ? n : null;
}
