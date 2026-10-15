/**
 * Motor de score G8 (v3-strength) — determinístico, auditável, sem IA.
 *
 *  SCORE do evento (−5..+5)  = direção × magnitude(|surpresa|/limiar) × impacto(÷3) × relevância × base(forecast/previous) × checagem do previous
 *  PESO do evento            = impacto(3/2/1) × relevância × qualidade do dado × força da surpresa × decaimento
 *  SCORE da moeda (−5..+5)   = média ponderada dos scores dos eventos  (quantidade NÃO encolhe o score)
 *  CONFIANÇA (1–100)         = 30% qualidade/impacto + 25% magnitude + 20% consistência + 15% quantidade + 10% certeza do dado,
 *                              limitada por teto conforme nº de evidências (70/80/90/100) e penalizada por conflito.
 *  SCORE ≠ CONFIANÇA: um evento forte e claro pode dar score alto com confiança moderada; muitos eventos pequenos e
 *  contraditórios dão score baixo e confiança baixa. Ranking ordena por SCORE (força), nunca por confiança.
 *  Internamente o score nativo continua em −2..+2 (= apresentação ÷ 2.5) para compatibilidade com pares/B3/histórico.
 */
import { G8, type AnyCurrency, type Category, type Classification, type Confidence, type Currency, type CurrencyScoreView, type EvidenceLevel, type Importance, type Momentum, type ScoreClassification, type ScoreDriver } from "@/lib/ai/types";
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
  /** limiar de ruído do indicador (mesma unidade da surpresa) — permite normalizar a surpresa entre indicadores. */
  threshold?: number | null;
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

// ---------------------------------------------------------------------------
// v3-strength: score individual do evento e confiança decomposta
// ---------------------------------------------------------------------------
const CLASS_RATIO_FALLBACK: Record<Classification, number> = { VERY_BULLISH: 3, BULLISH: 1, NEUTRAL: 0, BEARISH: 1, VERY_BEARISH: 3, UNKNOWN: 0 };

/** Surpresa normalizada m = |surpresa| / limiar (comparável entre CPI em p.p., payroll em K, M2 em %). Sem limiar ⇒ aproximação pela classificação. */
export function surpriseRatio(e: Pick<ScoredEvent, "surprise" | "threshold" | "classification">): number {
  if (e.surprise != null && e.threshold != null && e.threshold > 0 && Number.isFinite(e.surprise)) return Math.abs(e.surprise) / e.threshold;
  return CLASS_RATIO_FALLBACK[e.classification] ?? 0;
}

/** Magnitude saturada 0..5: m=1 (no limiar) ≈ 1.7 · m=2 ≈ 2.5 · m=4 ≈ 3.3 · m=10 ≈ 4.2 · m→∞ → 5. Nunca explode por divisão pequena. */
export function magnitudeFromRatio(m: number, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
  if (!Number.isFinite(m) || m <= 0) return 0;
  return 5 * m / (m + cfg.magnitude_k);
}

function directionSign(c: Classification): number { return c.includes("BULLISH") ? 1 : c.includes("BEARISH") ? -1 : 0; }

/** Checagem secundária: ATUAL vs PREVIOUS confirma (agrees) ou contradiz (disagrees) a direção medida vs FORECAST. */
export function previousCheck(e: Pick<ScoredEvent, "actual" | "previous" | "forecast" | "classification">): "agrees" | "disagrees" | null {
  const dir = directionSign(e.classification);
  if (dir === 0 || !e.forecast) return null;
  const a = parseNumeric(e.actual), p = parseNumeric(e.previous), f = parseNumeric(e.forecast);
  if (a === null || p === null || f === null || a === p) return null;
  // sentido "acima da referência" ⇒ sinal da regra = dir × sign(actual − forecast)
  const aboveIs = dir * Math.sign(a - f);
  if (aboveIs === 0) return null;
  return Math.sign(a - p) * aboveIs === dir ? "agrees" : "disagrees";
}

export interface EventScoreBreakdown {
  direction: number; ratio: number; magnitude: number; impact_norm: number; relevance: number; basis: number; previous_check: "agrees" | "disagrees" | null; previous_adj: number;
  /** score do evento na escala −5..+5 */
  score: number;
  /** peso do evento na média da moeda */
  weight: number;
  quality: number;
}

/** Score individual do evento (−5..+5) + peso. Puro. */
export function eventScore(e: ScoredEvent, decay = 1, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): EventScoreBreakdown {
  const direction = directionSign(e.classification);
  const ratio = surpriseRatio(e);
  const magnitude = magnitudeFromRatio(ratio, cfg);
  const impact_norm = (cfg.impact_weight[e.impact] ?? cfg.impact_weight.unknown) / 3;
  const relevance = cfg.relevance_factor[e.category] ?? cfg.relevance_factor.OTHER;
  // Base da surpresa: FORECAST vale 1.0; PREVIOUS (sem forecast) 0.7. Sem surpresa medida (classificação vinda da IA, módulo B3)
  // a classificação já embute o julgamento ⇒ fator 1.0 (não penalizar duas vezes).
  const measured = e.surprise != null && e.threshold != null && e.threshold > 0;
  const basis = measured ? (cfg.basis_factor[e.reference_basis ?? (e.forecast ? "FORECAST" : e.previous ? "PREVIOUS" : "NONE")] ?? 1) : 1;
  const previous_check = previousCheck(e);
  const previous_adj = previous_check === "agrees" ? 1.1 : previous_check === "disagrees" ? 0.85 : 1;
  const score = Math.max(-5, Math.min(5, direction * magnitude * impact_norm * relevance * basis * previous_adj));
  const quality = cfg.quality_factor[e.confidence] ?? cfg.quality_factor.LOW;
  const surpriseStrength = 0.5 + 0.5 * Math.min(1, ratio / 2); // evento "em linha" conta, mas com metade do peso
  const weight = (cfg.impact_weight[e.impact] ?? cfg.impact_weight.unknown) * relevance * quality * surpriseStrength * decay;
  return { direction, ratio, magnitude, impact_norm, relevance, basis, previous_check, previous_adj, score: Number(score.toFixed(3)), weight: Number(weight.toFixed(4)), quality };
}

export interface ConfidenceV3 {
  pct: number; agreement: number; mass: number; conflict: boolean; consistency: "HIGH" | "MIXED" | "LOW" | "NA";
  breakdown: { quality: number; magnitude: number; consistency: number; quantity: number; certainty: number; raw_pct: number; cap_pct: number; conflict_penalty: boolean };
}

/**
 * Confiança 1–100 = robustez da EVIDÊNCIA (não é probabilidade de o preço subir, nem de lucro).
 *  quality     = impacto (50%) + relevância (30%) + base forecast (20%), média ponderada
 *  magnitude   = quão longe do ruído as surpresas ficaram (min(1, m/3))
 *  consistency = concordância de direção entre eventos (1 evento direcional ⇒ 0.5 = "não aplicável")
 *  quantity    = min(1, n/4)
 *  certainty   = qualidade do dado (OCR, regra genérica, referência previous)
 *  teto por nº de evidências: 1 ⇒ 70 · 2 ⇒ 80 · 3 ⇒ 90 · 4+ ⇒ 100. Conflito material ⇒ ×0.8.
 */
export function confidenceV3(items: { w: number; s: number; ratio: number; impact_norm: number; relevance: number; basis: number; quality: number }[], cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): ConfidenceV3 {
  const empty: ConfidenceV3 = { pct: 0, agreement: 0, mass: 0, conflict: false, consistency: "NA", breakdown: { quality: 0, magnitude: 0, consistency: 0, quantity: 0, certainty: 0, raw_pct: 0, cap_pct: 0, conflict_penalty: false } };
  if (!items.length) return empty;
  const mass = items.reduce((a, x) => a + x.w, 0);
  if (mass <= 0) return empty;
  const wavg = (f: (x: typeof items[number]) => number) => items.reduce((a, x) => a + x.w * f(x), 0) / mass;
  const quality = wavg((x) => 0.5 * x.impact_norm + 0.3 * x.relevance + 0.2 * (x.basis >= 1 ? 1 : 0.4));
  const magnitude = wavg((x) => Math.min(1, x.ratio / 3));
  const directional = items.filter((x) => x.s !== 0);
  const dirMass = directional.reduce((a, x) => a + x.w, 0);
  const signed = directional.reduce((a, x) => a + x.w * Math.sign(x.s), 0);
  const agreement = dirMass > 0 ? Math.abs(signed) / dirMass : 0;
  let consistencyLabel: ConfidenceV3["consistency"];
  let consistency: number;
  if (directional.length <= 1) { consistencyLabel = "NA"; consistency = directional.length === 1 ? 0.5 : 0.4; }
  else if (agreement >= 0.8) { consistencyLabel = "HIGH"; consistency = 0.7 + 0.3 * agreement; }
  else if (agreement >= 0.5) { consistencyLabel = "MIXED"; consistency = 0.35 + 0.3 * agreement; }
  else { consistencyLabel = "LOW"; consistency = 0.15 + 0.3 * agreement; }
  const quantity = Math.min(1, items.length / 4);
  const certainty = wavg((x) => x.quality);
  const cw = cfg.confidence_weights;
  const raw = 100 * (cw.quality * quality + cw.magnitude * magnitude + cw.consistency * consistency + cw.quantity * quantity + cw.certainty * certainty);
  const cap = cfg.confidence_caps[Math.min(3, items.length - 1)];
  const conflict = directional.length >= 2 && agreement < 0.6;
  let pct = Math.min(cap, raw);
  if (conflict) pct *= 0.8;
  pct = Math.max(1, Math.min(100, Math.round(pct)));
  return {
    pct, agreement: Number(agreement.toFixed(3)), mass: Number(mass.toFixed(4)), conflict, consistency: consistencyLabel,
    breakdown: { quality: Number(quality.toFixed(3)), magnitude: Number(magnitude.toFixed(3)), consistency: Number(consistency.toFixed(3)), quantity: Number(quantity.toFixed(3)), certainty: Number(certainty.toFixed(3)), raw_pct: Math.round(raw), cap_pct: cap, conflict_penalty: conflict },
  };
}

/**
 * (legado v2) Confiança 0–100 do score de uma moeda. NÃO é probabilidade de alta/baixa:
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
  // Moeda avaliada tem SEMPRE confiança entre 1% e 99% (0% é reservado para "sem evidência").
  return { pct: Math.max(1, Math.min(99, pct)), agreement: Number(agreement.toFixed(3)), mass: Number(mass.toFixed(4)), conflict };
}

/**
 * Nível de evidência por trás do score — rótulo honesto para a UI:
 *  WEAK     = pouca massa (ex.: 1 dado de impacto baixo, ou dado sem forecast) e nenhuma evidência primária;
 *  MODERATE = massa intermediária ou evidência primária única;
 *  STRONG   = massa relevante (vários dados ou dado primário de alto impacto).
 */
export function evidenceLevel(mass: number, hasPrimary: boolean, cfg: ScoringConfig = DEFAULT_SCORING_CONFIG): EvidenceLevel {
  if (mass >= cfg.evidence_k) return "STRONG";
  if (hasPrimary || mass >= cfg.evidence_k * 0.4) return "MODERATE";
  return "WEAK";
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
    const live: { w: number; s: number; ratio: number; impact_norm: number; relevance: number; basis: number; quality: number; primary: boolean }[] = [];
    const drivers: ScoreDriver[] = [];
    const excluded: { event_id: number; event: string; reason: string }[] = [];
    for (const e of evs) {
      if (e.classification === "UNKNOWN") {
        excluded.push({ event_id: e.event_id, event: e.event, reason: e.explanation ?? "Direção não mensurável — não pontua." });
        continue;
      }
      const ageDays = (input.now.getTime() - e.released_at.getTime()) / 86_400_000;
      const decay = decayFactor(e.category, ageDays, cfg);
      const es = eventScore(e, decay, cfg);
      const w = es.weight;
      // Divulgação MEDIDA (direção conhecida) é evidência — fraca, mas evidência. O piso de peso só poda eventos que já
      // perderam metade do valor por idade; um dado de impacto baixo divulgado HOJE entra com seu peso e conta.
      if (w < cfg.min_weight_alive && decay < 0.5) { excluded.push({ event_id: e.event_id, event: e.event, reason: "Peso abaixo do mínimo (evento antigo demais para contar)." }); continue; }
      num += es.score * w;
      den += w;
      const primary = (e.importance === "HIGH" || e.importance === "MEDIUM_HIGH") && e.impact !== "low";
      live.push({ w, s: es.score, ratio: es.ratio, impact_norm: es.impact_norm, relevance: es.relevance, basis: es.basis, quality: es.quality, primary });
      drivers.push({
        event_id: e.event_id, event: e.event, classification: e.classification, weight: Number(w.toFixed(4)),
        released_at: e.released_at.toISOString(),
        // contribuição = score do evento × fatia do peso (preenchida após o loop, quando a massa total é conhecida)
        contribution: es.score * w,
        category: e.category, importance: e.importance, primary,
        direction: es.direction > 0 ? "BULLISH" : es.direction < 0 ? "BEARISH" : "NEUTRAL",
        actual: e.actual ?? null, forecast: e.forecast ?? null, previous: e.previous ?? null,
        surprise: e.surprise ?? null, reference_basis: e.reference_basis ?? "NONE",
        rule_id: e.rule_id ?? null, explanation: e.explanation, source: e.source,
        threshold: e.threshold ?? null, surprise_ratio: Number(es.ratio.toFixed(2)), event_score: es.score, previous_check: es.previous_check,
      });
    }
    // contribuição real de cada evento para a média (soma = score da moeda em −5..+5)
    for (const d of drivers) d.contribution = den > 0 ? Number(((d.contribution ?? 0) / den).toFixed(3)) : 0;
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
    // SCORE da moeda = média ponderada dos scores dos eventos (−5..+5). Quantidade de eventos NÃO encolhe o score:
    // um único dado relevante com surpresa grande pode dar score alto — a escassez reduz a CONFIANÇA, não a força.
    const display = num / den;
    const raw = display / cfg.display_scale; // escala nativa −2..+2 (compatibilidade: pares, B3, histórico)
    const score = Math.max(-cfg.clamp, Math.min(cfg.clamp, roundToStep(raw, cfg.score_step)));
    const conf = confidenceV3(live, cfg);
    const evidence_level = evidenceLevel(conf.mass, live.some((x) => x.primary), cfg);
    out.push({
      ...base, status: "EVALUATED", score, score_raw: Number(raw.toFixed(4)), evidence_level,
      previous_score: previous, score_delta: previous === null ? null : Number((score - previous).toFixed(4)), momentum: momentumFrom(score, previous, cfg),
      classification: classifyScore(score, cfg), bias: biasFromScore(score, cfg),
      confidence: confidenceEnum(conf.pct), confidence_pct: conf.pct,
      evidence_mass: conf.mass, agreement: conf.agreement, conflict: conf.conflict, no_data: false,
      consistency: conf.consistency, confidence_breakdown: conf.breakdown,
      score_display: Number(display.toFixed(2)), rank: 0,
    });
  }
  // ranking: APENAS moedas com evidência. Sem evidência não recebe posição artificial.
  const evaluated = out.filter((c) => c.status === "EVALUATED");
  // Ordenação = FORÇA macro (score), da mais forte à mais fraca. Confiança só desempata score idêntico; nunca reordena.
  evaluated.sort((a, b) => (b.score_raw ?? 0) - (a.score_raw ?? 0) || (b.confidence_pct ?? 0) - (a.confidence_pct ?? 0) || a.currency.localeCompare(b.currency));
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
