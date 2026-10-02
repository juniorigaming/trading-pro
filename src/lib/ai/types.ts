/** Tipos e enums compartilhados do módulo de IA. */

export const G8 = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"] as const;
export type Currency = (typeof G8)[number];

export const SESSIONS = ["ASIA", "LONDON", "NEW_YORK"] as const;
export type Session = (typeof SESSIONS)[number];

export const CENTRAL_BANKS: Record<Currency, string> = {
  USD: "FED", EUR: "ECB", GBP: "BOE", JPY: "BOJ", CHF: "SNB", CAD: "BOC", AUD: "RBA", NZD: "RBNZ",
};

export const CLASSIFICATIONS = ["VERY_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "VERY_BEARISH"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const CATEGORIES = ["INFLATION", "EMPLOYMENT", "GROWTH", "ACTIVITY", "CENTRAL_BANK", "HOUSING", "CONSUMPTION", "SENTIMENT", "TRADE", "OTHER"] as const;
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
  currency: Currency;
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

export interface CurrencyScoreView {
  currency: Currency;
  score: number;
  score_raw: number;
  previous_score: number | null;
  score_delta: number | null;
  momentum: Momentum | null;
  classification: ScoreClassification;
  bias: "BULLISH" | "NEUTRAL" | "BEARISH";
  confidence: Confidence;
  rank: number;
  live_events: number;
  drivers: { event_id: number; event: string; classification: Classification; weight: number; released_at: string }[];
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
  event_risk_events: PendingEventView[];
  reason: string;
}

export interface PendingEventView {
  id: number;
  currency: Currency;
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
  ranking: Currency[];
  trade_candidates: TradeCandidateView[];
  pending_events: PendingEventView[];
  event_risk: { currency: Currency; current_bias: string; level: EventRiskLevel; events: PendingEventView[] }[];
  pairs_to_avoid: { symbol: string; reason: string }[];
  warnings: string[];
  meta: { scoring_version: string; prompt_version: string | null; model: string | null; events_interpreted: number };
}
