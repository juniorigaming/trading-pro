/**
 * Configuração central do motor de scoring (pesos, decaimento, limiares).
 * Pode ser sobrescrita pela tabela scoring_config (linha is_active=true) sem reescrever a lógica.
 */
import type { Category, Classification, Confidence, Importance } from "@/lib/ai/types";

export interface ScoringConfig {
  version: string;
  /** valor base da classificação */
  direction_value: Record<Classification, number>;
  /** peso por tier de importância (a IA classifica importance; a categoria ajusta) */
  importance_weight: Record<Importance, number>;
  /** multiplicador por categoria (BC e inflação pesam mais que sentimento) */
  category_multiplier: Record<Category, number>;
  /** ajuste pelo impacto do calendário (FF high/medium/low) */
  impact_factor: Record<"high" | "medium" | "low" | "holiday" | "unknown", number>;
  confidence_factor: Record<Confidence, number>;
  /** meia-vida em dias: dado decai; banco central persiste mais tempo */
  half_life_days: { default: number; CENTRAL_BANK: number; INFLATION: number; EMPLOYMENT: number };
  /** abaixo disso o evento deixa de contar como "vivo" */
  min_weight_alive: number;
  /** máximo de dias para considerar um evento (hard cutoff) */
  max_age_days: number;
  score_step: number;
  clamp: number;
  classification_thresholds: { very_strong: number; strong: number; moderately_strong: number };
  narrative_shift_min_delta: number;
  momentum_min_delta: number;
  pair_min_divergence: number;
  event_risk_hours: { intraday: number; overnight: number };
  /**
   * Massa de evidência mínima para o score atingir força plena (anti "1 evento = moeda forte").
   * score = média_ponderada × massa/(massa + evidence_k). Com pouca evidência o score encolhe para 0.
   */
  evidence_k: number;
  /** Multiplicador do score nativo (−2..+2) para a escala de apresentação (−5..+5). */
  display_scale: number;
  /** Bandas de força relativa do par, já na escala de apresentação (−5..+5). */
  pair_bands: { neutral: number; weak: number; moderate: number; strong: number };
  /** Confiança mínima (0–100) para um par ser APRESENTÁVEL como candidato. Abaixo disso ele só aparece em 'pares a evitar'. */
  candidate_min_confidence_pct: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  version: "v2-evidence",
  direction_value: { VERY_BULLISH: 2, BULLISH: 1, NEUTRAL: 0, BEARISH: -1, VERY_BEARISH: -2 },
  importance_weight: { HIGH: 1.0, MEDIUM_HIGH: 0.7, MEDIUM: 0.45, LOW: 0.25 },
  category_multiplier: {
    CENTRAL_BANK: 1.0, INFLATION: 0.95, EMPLOYMENT: 0.9, GROWTH: 0.75, ACTIVITY: 0.65, CONSUMPTION: 0.6,
    HOUSING: 0.4, TRADE: 0.4, SENTIMENT: 0.35, FISCAL: 0.85, OTHER: 0.3,
  },
  impact_factor: { high: 1.0, medium: 0.65, low: 0.35, holiday: 0, unknown: 0.5 },
  confidence_factor: { HIGH: 1.0, MEDIUM: 0.75, LOW: 0.4 },
  half_life_days: { default: 5, CENTRAL_BANK: 14, INFLATION: 10, EMPLOYMENT: 8 },
  min_weight_alive: 0.06,
  max_age_days: 45,
  score_step: 0.25,
  clamp: 2.0,
  classification_thresholds: { very_strong: 1.5, strong: 1.0, moderately_strong: 0.5 },
  narrative_shift_min_delta: 1.0,
  momentum_min_delta: 0.25,
  // 0.4 nativo = 1.0 na escala de apresentação (−5..+5): abaixo disso o par é considerado neutro.
  pair_min_divergence: 0.4,
  event_risk_hours: { intraday: 4, overnight: 14 },
  evidence_k: 0.55,
  display_scale: 2.5,
  pair_bands: { neutral: 0.5, weak: 1.0, moderate: 1.5, strong: 2.5 },
  candidate_min_confidence_pct: 40,
};

/** Mescla config vinda do banco com os defaults (campos ausentes caem no default). */
export function mergeScoringConfig(partial: Partial<ScoringConfig> | null | undefined): ScoringConfig {
  if (!partial) return DEFAULT_SCORING_CONFIG;
  const d = DEFAULT_SCORING_CONFIG;
  return {
    ...d, ...partial,
    direction_value: { ...d.direction_value, ...(partial.direction_value ?? {}) },
    importance_weight: { ...d.importance_weight, ...(partial.importance_weight ?? {}) },
    category_multiplier: { ...d.category_multiplier, ...(partial.category_multiplier ?? {}) },
    impact_factor: { ...d.impact_factor, ...(partial.impact_factor ?? {}) },
    confidence_factor: { ...d.confidence_factor, ...(partial.confidence_factor ?? {}) },
    half_life_days: { ...d.half_life_days, ...(partial.half_life_days ?? {}) },
    classification_thresholds: { ...d.classification_thresholds, ...(partial.classification_thresholds ?? {}) },
    event_risk_hours: { ...d.event_risk_hours, ...(partial.event_risk_hours ?? {}) },
    pair_bands: { ...d.pair_bands, ...(partial.pair_bands ?? {}) },
  };
}
