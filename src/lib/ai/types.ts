/** Tipos e enums compartilhados do módulo de IA. */

export const G8 = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"] as const;
export type Currency = (typeof G8)[number];
/** Moedas extras aceitas no calendário (módulo B3): BRL (Brasil) e CNY (China). O ranking G8 continua só com as 8. */
export const EXTRA_CURRENCIES = ["BRL", "CNY"] as const;
export const ALL_CURRENCIES = [...G8, ...EXTRA_CURRENCIES] as const;
export type AnyCurrency = (typeof ALL_CURRENCIES)[number];

export const SESSIONS = ["ASIA", "LONDON", "NEW_YORK"] as const;
export type Session = (typeof SESSIONS)[number];

export const CENTRAL_BANKS: Record<Currency, string> = {
  USD: "FED", EUR: "ECB", GBP: "BOE", JPY: "BOJ", CHF: "SNB", CAD: "BOC", AUD: "RBA", NZD: "RBNZ",
};

/** UNKNOWN = divulgação sem direção mensurável (fala sem texto, indicador fora da tabela, sem ATUAL/referência). Não pontua. */
export const CLASSIFICATIONS = ["VERY_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "VERY_BEARISH", "UNKNOWN"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const CATEGORIES = ["INFLATION", "EMPLOYMENT", "GROWTH", "ACTIVITY", "CENTRAL_BANK", "HOUSING", "CONSUMPTION", "SENTIMENT", "TRADE", "FISCAL", "OTHER"] as const;
export type Category = (typeof CATEGORIES)[number];

export const IMPORTANCE = ["HIGH", "MEDIUM_HIGH", "MEDIUM", "LOW"] as const;
export type Importance = (typeof IMPORTANCE)[number];

export const CONFIDENCE = ["HIGH", "MEDIUM", "LOW"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const EVENT_RISK = ["LOW", "MEDIUM", "HIGH", "EXTREME"] as const;
export type EventRiskLevel = (typeof EVENT_RISK)[number];

export const SCORE_CLASS = ["VERY_STRONG", "STRONG", "MODERATELY_STRONG", "NEUTRAL", "MODERATELY_WEAK", "WEAK", "VERY_WEAK"] as const;
export type ScoreClassification = (typeof SCORE_CLASS)[number];

export const MOMENTUM = ["STRENGTHENING", "WEAKENING", "STABLE", "NARRATIVE_SHIFT"] as const;
export type Momentum = (typeof MOMENTUM)[number];

export const TIMEFRAMES = ["MN", "W1", "D1", "H4", "H1", "M30", "M15", "M5", "M3", "M1"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const ENTRY_MODELS = ["NONE", "MODEL_A_AGGRESSIVE", "MODEL_B_CONFIRMED"] as const;
export const SETUP_GRADES = ["A", "B", "C", "NO_TRADE"] as const;
export const SETUP_STATUS = ["READY", "WAIT", "INVALID"] as const;

export const ERROR_TAGS = [
  "EARLY_ENTRY", "POI_TOUCH_ENTRY", "NO_MSS", "INTERNAL_MSS", "FOMO", "CHASED_PRICE", "ENTRY_IN_EXTENSION",
  "SHORT_IN_DISCOUNT", "LONG_IN_PREMIUM", "STOP_TOO_TIGHT", "PREMATURE_BE", "OVEREXPOSURE", "CORRELATED_EXPOSURE",
  "TRADED_BEFORE_NEWS", "IGNORED_MACRO_CHANGE", "REVENGE_TRADE",
  // B3 (WIN/DOL/WDO)
  "TRADED_AGAINST_DI", "TRADED_AGAINST_DOL", "TRADED_AGAINST_GLOBAL_RISK", "TRADED_BEFORE_COPOM", "TRADED_BEFORE_US_DATA",
  "IGNORED_FISCAL_RISK", "IGNORED_CHINA", "IGNORED_COMMODITIES",
] as const;
export type ErrorTag = (typeof ERROR_TAGS)[number];

export const DISQUALIFIERS = [
  "POI_TOUCH_ONLY", "NO_SWEEP", "NO_DISPLACEMENT", "NO_MSS", "INTERNAL_MSS_ONLY", "MSS_TOO_MICRO", "AGAINST_MACRO",
  "AGAINST_HTF", "LONG_IN_PREMIUM", "SHORT_IN_DISCOUNT", "EXTENDED_PRICE", "HIGH_EVENT_RISK", "POOR_IMAGE", "CONFLICTING_TIMEFRAMES",
] as const;

/** Linha do calendário econômico (RAW) — independe da origem (screenshot, API, manual). */
export interface EconomicEventInput {
  id?: number;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM | all_day | tentative
  currency: AnyCurrency;
  event: string;
  impact: "high" | "medium" | "low" | "holiday" | "unknown";
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: "screenshot_ai" | "calendar_api" | "manual";
  ocr_confidence?: number | null;
  requires_manual_confirmation?: boolean;
  user_edited?: boolean;
}

/** Status explícito por moeda. INSUFFICIENT_EVIDENCE ⇒ score = null (NUNCA 0), sem posição no ranking. */
export type CurrencyStatus = "EVALUATED" | "INSUFFICIENT_EVIDENCE";
/** Quanta evidência sustenta o score de uma moeda EVALUATED (rótulo para a UI; não altera o cálculo). */
export type EvidenceLevel = "WEAK" | "MODERATE" | "STRONG";
/** Moeda com evidência: score, rank e confiança são números (sem null). */
export type EvaluatedCurrency = CurrencyScoreView & { score: number; rank: number; confidence_pct: number };

/** Evidência usada no score (auditável). direction vem da tabela semântica (código), não da IA. */
export interface ScoreDriver {
  event_id: number; event: string; classification: Classification; weight: number; released_at: string;
  /** direction_value × peso — quanto este evento empurrou o score (sinal = direção). */
  contribution?: number;
  category?: Category;
  importance?: Importance;
  /** evidência primária (alta importância e impacto não-baixo) */
  primary?: boolean;
  direction?: "BULLISH" | "BEARISH" | "NEUTRAL";
  actual?: string | null; forecast?: string | null; previous?: string | null;
  /** ATUAL − referência (forecast, ou previous com confiança rebaixada). */
  surprise?: number | null;
  reference_basis?: "FORECAST" | "PREVIOUS" | "NONE";
  rule_id?: string | null;
  explanation?: string;
  source?: string;
  /** v3: limiar de ruído do indicador e surpresa normalizada (|surpresa| / limiar) — base comparável entre indicadores. */
  threshold?: number | null;
  surprise_ratio?: number | null;
  /** v3: score INDIVIDUAL do evento na escala −5..+5 (direção × magnitude × impacto × relevância × base). */
  event_score?: number | null;
  /** v3: confirmação do PREVIOUS — "agrees" (atual vs previous no mesmo sentido), "disagrees" ou null. */
  previous_check?: "agrees" | "disagrees" | null;
}

export interface CurrencyScoreView {
  currency: Currency;
  status: CurrencyStatus;
  /** Score nativo (−2..+2). NULL = sem evidência (ausência de dado ≠ zero = ausência de efeito). */
  score: number | null;
  score_raw: number | null;
  previous_score: number | null;
  score_delta: number | null;
  momentum: Momentum | null;
  classification: ScoreClassification | null;
  bias: "BULLISH" | "NEUTRAL" | "BEARISH" | null;
  /** HIGH/MEDIUM/LOW da EVIDÊNCIA; INSUFFICIENT_EVIDENCE quando não há dado. Nunca mascara falta de evidência. */
  confidence: Confidence | "INSUFFICIENT_EVIDENCE";
  /** Posição no ranking — só para moedas EVALUATED. */
  rank: number | null;
  live_events: number;
  drivers: ScoreDriver[];
  /** Eventos desta análise que NÃO pontuaram, com o motivo (direção desconhecida, etc.). */
  excluded_events?: { event_id: number; event: string; reason: string }[];
  /** Confiança 0–100 da EVIDÊNCIA macro (não é probabilidade de alta/baixa). null se sem evidência. */
  confidence_pct: number | null;
  /** Peso total vivo — massa de evidência (não é contagem de eventos). */
  evidence_mass?: number;
  /** WEAK = 1 dado de impacto baixo / sem forecast; MODERATE; STRONG. Só para EVALUATED. */
  evidence_level?: EvidenceLevel;
  agreement?: number;
  conflict?: boolean;
  no_data?: boolean;
  /** score × display_scale (−5..+5); null se sem evidência. */
  score_display: number | null;
  /** v3: rótulo de consistência entre os eventos da moeda (n/a com um único evento direcional). */
  consistency?: "HIGH" | "MIXED" | "LOW" | "NA";
  /** v3: decomposição da confiança (0–1 cada) + teto aplicado — auditável. */
  confidence_breakdown?: { quality: number; magnitude: number; consistency: number; quantity: number; certainty: number; raw_pct: number; cap_pct: number; conflict_penalty: boolean };
}

export interface TradeCandidateView {
  symbol: string;
  bias: "LONG" | "SHORT";
  strong_currency: Currency;
  weak_currency: Currency;
  strong_score: number;
  weak_score: number;
  macro_divergence: number;
  confidence: Confidence;
  priority: number;
  event_risk: EventRiskLevel;
  /** false when this analysis did not include a calendar; LOW must not be read as verified low risk. */
  event_risk_assessed?: boolean;
  event_risk_events: PendingEventView[];
  reason: string;
  /** Diferença exibida (score da base − cotada); cada score de moeda é −5..+5, então Δ pode chegar a −10..+10. */
  relative_strength?: number;
  /** FORTE LONG · LONG · NEUTRO · SHORT · FORTE SHORT */
  strength_class?: PairStrengthClass;
  /** Confiança 0–100 do par (combina as duas pernas, a assimetria e o conflito). */
  confidence_pct?: number;
  base_currency?: Currency;
  quote_currency?: Currency;
  base_score?: number;
  quote_score?: number;
  /** Eventos pendentes capazes de invalidar o viés. */
  invalidation_events?: string[];
  /** true = evidência suficiente para ser APRESENTADO como candidato. false = vai para 'pares a evitar'. */
  eligible?: boolean;
  /** Motivo de não ser elegível (quando eligible = false). */
  ineligible_reason?: string;
}

export const PAIR_STRENGTH = ["FORTE LONG", "LONG", "NEUTRO", "SHORT", "FORTE SHORT"] as const;
export type PairStrengthClass = (typeof PAIR_STRENGTH)[number];

export interface PendingEventView {
  id: number;
  currency: AnyCurrency;
  event: string;
  scheduled_at: string;
  impact: string;
  forecast: string | null;
  previous: string | null;
  minutes_until: number;
}

export interface MacroAnalysisResult {
  analysis_id: string;
  date: string;
  session: Session;
  currencies: CurrencyScoreView[];
  /** Moedas FORA do G8 (CNY, BRL) com evidência nesta análise — mostradas à parte; não entram no ranking G8 nem nos pares. */
  extra_currencies?: CurrencyScoreView[];
  ranking: Currency[];
  trade_candidates: TradeCandidateView[];
  pending_events: PendingEventView[];
  /** Whether this analysis included any calendar/event rows to assess scheduled risk. */
  calendar_status?: "PROVIDED" | "NOT_PROVIDED";
  event_risk: { currency: Currency; current_bias: string; level: EventRiskLevel; events: PendingEventView[] }[];
  pairs_to_avoid: { symbol: string; reason: string }[];
  /** Resumo macro consolidado (moeda mais forte/fraca, top 3 long/short, alertas). */
  summary?: MacroSummaryView;
  warnings: string[];
  meta: { scoring_version: string; prompt_version: string | null; model: string | null; events_interpreted: number };
  /** OK = ranking confiável. ANALISE_INSUFICIENTE = a validação de consistência falhou (ver audit.checks). */
  analysis_status?: "OK" | "ANALISE_INSUFICIENTE";
  /** Auditoria completa: extração bruta, eventos aceitos/rejeitados, checagens de consistência. */
  audit?: AnalysisAudit;
}

/** Resumo macro consolidado — fonte única para o dashboard (evita recalcular na UI). */
export interface MacroSummaryView {
  strongest: { currency: Currency; score: number; confidence_pct: number } | null;
  weakest: { currency: Currency; score: number; confidence_pct: number } | null;
  overall_risk: EventRiskLevel;
  /** moedas sem nenhum dado vivo — neutras por ausência de dado, NÃO fracas */
  no_data_currencies: Currency[];
  /** moedas com indicadores conflitantes (viés misto) */
  conflicted_currencies: Currency[];
  top_long: TradeCandidateView[];
  top_short: TradeCandidateView[];
  alerts: string[];
}

export interface AuditCheck { id: string; label: string; passed: boolean; detail: string }

export interface AnalysisAudit {
  analysis_id: string;
  checks: AuditCheck[];
  trusted: boolean;
  /** Extração por IA (quando a análise veio de screenshot). JSON bruto + validação. */
  extraction: {
    provider: string | null; model: string | null;
    raw_json: unknown;
    rows_received: number;
    accepted: { currency: string; event: string; time: string | null; actual: string | null; forecast: string | null; previous: string | null; confidence: number | null; raw_row_text: string | null }[];
    rejected: { index: number; currency: string | null; event: string | null; reason: string }[];
    values_discarded: { currency: string; event: string; field: "actual" | "forecast" | "previous"; value: string; reason: string }[];
    visual_verification: "OK" | "REJECTED_SOME" | "UNAVAILABLE" | "SKIPPED";
  } | null;
  /** Por moeda: evidência e score final (espelha currencies, mas em formato de auditoria). */
  scores: { currency: string; score: number | null; status: CurrencyStatus; evidence_count: number; excluded_count: number }[];
}
