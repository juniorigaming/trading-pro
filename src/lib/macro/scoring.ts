/**
 * Motor de score G8 — determinístico, auditável, sem IA.
 * contribution = direction_value × importance_weight × category_multiplier × impact_factor × confidence_factor × decay(idade)
 * score(ccy) = média ponderada das contribuições vivas, arredondada em passos (0.25) e limitada a ±2.
 */
import { G8, type AnyCurrency, type Category, type Classification, type Confidence, type Currency, type CurrencyScoreView, type Importance, type Momentum, type ScoreClassification, type ScoreDriver } from "@/lib/ai/types";
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "./config";

export interface ScoredEvent {
  event_id: number;
  currency: AnyCurrency;
  event: string;
  impact: "high" | "medium" | "low" | "holiday" | "unknown";
  released_at: Date; // scheduled_at do evento (quando saiu)
  superseded: boolean;
  category: Category;
  importance: Importance;
  classification: Classification;
  confidence: Confidence;
  // --- auditoria (opcionais; vindos da classificação determinística) ---
  actual?: string | null; forecast?: string | null; previous?: string | null;
  surprise?: number | null; reference_basis?: "FORECAST" | "PREVIOUS" | "NONE";
  rule_id?: string | null; explanation?: string; source?: string;
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

/**
 * Confiança 0–100 do score de uma moeda. NÃO é probabilidade de alta/baixa:
 * é a força da EVIDÊNCIA macro disponível. Combina:
 *  - massa de evidência (peso total vivo, não quantidade de eventos);
 *  - concordância de direção entre os eventos (conflito derruba a confiança);
 *  - qualidade: fatia do peso vindo de evidência de alta importância/alto impacto.
 */
export function confidenceScore(live: { w: number; dir: number; primary: boolean }[]): { pct: number; agreement: number; mass: number; conflict: boolean } {
  if (live.length === 0) return { pct: 0, agreement: 0, mass: 0, conflict: false };
  const mass = live.reduce((s, x) => s + x.w, 0);
  if (mass <= 0) return { pct: 0, agreement: 0, mass: 0, conflict: false };
  const directional = live.filter((x) => x.dir !== 0);
  const dirMass = directional.reduce((s, x) => s + x.w, 0);
  const signed = directional.reduce((s, x) => s + x.w * Math.sign(x.dir), 0);
  const agreement = dirMass > 0 ? Math.abs(signed) / dirMass : 0; // 1 = todos no mesmo sentido
  const primaryMass = live.filter((x) => x.primary).reduce((s, x) => s + x.w, 0);
  const quality = primaryMass / mass;

  const massFactor = mass / (mass + 0.8);        // satura: muita evidência ⇒ ~1
  const agreementFactor = 0.35 + 0.65 * agreement; // conflito total ⇒ 0.35
  const qualityFactor = 0.7 + 0.3 * quality;       // só evidência fraca ⇒ 0.7

  const pct = Math.round(100 * massFactor * agreementFactor * qualityFactor);
  // Conflito relevante: direções opostas com peso material dos dois lados.
  const conflict = directional.length >= 2 && agreement < 0.6;
  return { pct: Math.max(0, Math.min(99, pct)), agreement: Number(agreement.toFixed(3)), mass: Number(mass.toFixed(4)), conflict };
}

/** Enum de confiança derivado do percentual (mantido para compatibilidade com o schema/banco). */
export function confidenceEnum(pct: number): Confidence {
  if (pct >= 65) return "HIGH";
  if (pct >= 40) return "MEDIUM";
  return "LOW";
}

export interface ComputeInput {
  events: ScoredEvent[];
  now: Date;
  /** Não usado pelo pipeline G8 (cada análise começa limpa). Mantido para o módulo B3. */
  previousScores?: Partial<Record<string, number | null | undefined>>;
  cfg?: ScoringConfig;
  /** Moedas a pontuar (padrão G8). O módulo B3 usa o MESMO motor para BRL/CNY/USD. */
  currencies?: readonly AnyCurrency[];
}

/**
 * Calcula o score das moedas + ranking. Puro: mesma entrada ⇒ mesma saída.
 *  - Moeda SEM evidência mensurada ⇒ score = null, status INSUFFICIENT_EVIDENCE, sem rank.
 *  - Evento UNKNOWN (direção não mensurável) ⇒ não pontua; fica em excluded_events com o motivo.
 *  - Moeda com evidência só NEUTRA (surpresa dentro do limiar) ⇒ score 0 MEDIDO (não é "sem dado").
 */
export function computeCurrencyScores(input: ComputeInput): CurrencyScoreView[] {
  const cfg = input.cfg ?? DEFAULT_SCORING_CONFIG;
  const out: CurrencyScoreView[] = [];
  for (const ccy of (input.currencies ?? G8) as readonly Currency[]) {
    const evs = input.events.filter((e) => e.currency === ccy && !e.superseded && e.impact !== "holiday");
    let num = 0, den = 0;
    const live: { w: number; dir: number; primary: boolean }[] = [];
    const drivers: ScoreDriver[] = [];
    const excluded: { event_id: number; event: string; reason: string }[] = [];
    for (const e of evs) {
      if (e.classification === "UNKNOWN") {
        excluded.push({ event_id: e.event_id, event: e.event, reason: e.explanation ?? "Direção não mensurável — não pontua." });
        continue;
      }
      const bc = baseContribution(e, cfg);
      const ageDays = (input.now.getTime() - e.released_at.getTime()) / 86_400_000;
      const decay = decayFactor(e.category, ageDays, cfg);
      const w = bc.weight * bc.impact_factor * bc.confidence_factor * decay;
      if (w < cfg.min_weight_alive) { excluded.push({ event_id: e.event_id, event: e.event, reason: "Peso abaixo do mínimo (evento antigo ou de baixa confiança)." }); continue; }
      num += bc.direction_value * w;
      den += w;
      const primary = (e.importance === "HIGH" || e.importance === "MEDIUM_HIGH") && e.impact !== "low";
      live.push({ w, dir: bc.direction_value, primary });
      drivers.push({
        event_id: e.event_id, event: e.event, classification: e.classification, weight: Number(w.toFixed(4)),
        released_at: e.released_at.toISOString(),
        contribution: Number((bc.direction_value * w).toFixed(4)),
        category: e.category, importance: e.importance, primary,
        direction: e.classification.includes("BULLISH") ? "BULLISH" : e.classification.includes("BEARISH") ? "BEARISH" : "NEUTRAL",
        actual: e.actual ?? null, forecast: e.forecast ?? null, previous: e.previous ?? null,
        surprise: e.surprise ?? null, reference_basis: e.reference_basis ?? "NONE",
        rule_id: e.rule_id ?? null, explanation: e.explanation, source: e.source,
      });
    }
    drivers.sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0) || b.weight - a.weight);
    const noEvidence = live.length === 0;
    const base = { currency: ccy, live_events: live.length, drivers: drivers.slice(0, 12), excluded_events: excluded };
    // Comparação com snapshot anterior só existe quando o chamador a fornece (B3). O G8 nunca passa — cada análise começa limpa.
    const previous = input.previousScores?.[ccy] ?? null;
    if (noEvidence) {
      out.push({
        ...base, status: "INSUFFICIENT_EVIDENCE", score: null, score_raw: null, previous_score: null, score_delta: null, momentum: null, classification: null, bias: null,
        confidence: "INSUFFICIENT_EVIDENCE", confidence_pct: null, rank: null, no_data: true, score_display: null,
      });
      continue;
    }
    // Média ponderada das direções (−2..+2) ATENUADA pela massa de evidência.
    // Sem isso, uma única leitura secundária produziria força plena.
    const weighted = num / den;
    const evidenceFactor = den / (den + cfg.evidence_k);
    const raw = weighted * evidenceFactor;
    const score = Math.max(-cfg.clamp, Math.min(cfg.clamp, roundToStep(raw, cfg.score_step)));
    const conf = confidenceScore(live);
    out.push({
      ...base, status: "EVALUATED", score, score_raw: Number(raw.toFixed(4)),
      previous_score: previous, score_delta: previous === null ? null : Number((score - previous).toFixed(4)), momentum: momentumFrom(score, previous, cfg),
      classification: classifyScore(score, cfg), bias: biasFromScore(score, cfg),
      confidence: confidenceEnum(conf.pct), confidence_pct: conf.pct,
      evidence_mass: conf.mass, agreement: conf.agreement, conflict: conf.conflict, no_data: false,
      score_display: Number((score * cfg.display_scale).toFixed(2)), rank: 0,
    });
  }
  // ranking: APENAS moedas com evidência. Sem evidência não recebe posição artificial.
  const evaluated = out.filter((c) => c.status === "EVALUATED");
  evaluated.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.score_raw ?? 0) - (a.score_raw ?? 0) || (b.confidence_pct ?? 0) - (a.confidence_pct ?? 0) || a.currency.localeCompare(b.currency));
  evaluated.forEach((c, i) => (c.rank = i + 1));
  const insufficient = out.filter((c) => c.status !== "EVALUATED").sort((a, b) => a.currency.localeCompare(b.currency));
  return [...evaluated, ...insufficient];
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
