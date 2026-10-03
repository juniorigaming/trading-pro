/** Tipos do módulo B3 Macro — WIN & DOL. */
import type { Confidence, EventRiskLevel, PendingEventView, CurrencyScoreView } from "@/lib/ai/types";

export const B3_SESSIONS = ["PRE_MARKET", "OPEN", "MORNING", "NY_OVERLAP", "AFTERNOON", "CLOSE"] as const;
export type B3Session = (typeof B3_SESSIONS)[number];
export const B3_SESSION_LABEL: Record<B3Session, string> = { PRE_MARKET: "Pré-mercado", OPEN: "Abertura", MORNING: "Manhã", NY_OVERLAP: "Overlap NY", AFTERNOON: "Tarde", CLOSE: "Fechamento" };

/** Sessão B3 pela hora de Brasília (UTC−3). PRE <9h · OPEN 9–9:30 · MORNING 9:30–11:30 · NY_OVERLAP 11:30–14 · AFTERNOON 14–17 · CLOSE 17+ */
export function guessB3Session(d = new Date()): B3Session {
  const h = ((d.getUTCHours() + 24 - 3) % 24) + d.getUTCMinutes() / 60;
  return h < 9 ? "PRE_MARKET" : h < 9.5 ? "OPEN" : h < 11.5 ? "MORNING" : h < 14 ? "NY_OVERLAP" : h < 17 ? "AFTERNOON" : "CLOSE";
}

export const B3_INSTRUMENTS = ["WIN", "DOL", "WDO"] as const;
export type B3Instrument = (typeof B3_INSTRUMENTS)[number];
/** Reconhece símbolos de B3 incluindo vencimentos (WINZ26, WDOF27, DOLX26, INDV26). */
export const B3_SYMBOL_RE = /^(WIN|IND|WDO|DOL)[A-Z]?\d{0,2}$/i;
export function b3InstrumentOf(symbol: string): B3Instrument | null {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^(WIN|IND)/.test(s)) return "WIN";
  if (/^WDO/.test(s)) return "WDO";
  if (/^DOL/.test(s)) return "DOL";
  return null;
}

export const B3_REGIMES = ["RISK_ON", "RISK_OFF", "DOMESTIC_BULLISH", "DOMESTIC_BEARISH", "MIXED", "HIGH_EVENT_RISK"] as const;
export type B3Regime = (typeof B3_REGIMES)[number];

export const WIN_COMPONENTS = [
  "BRAZIL_ACTIVITY", "BRAZIL_INFLATION", "BCB_POLICY", "DI_CURVE", "FISCAL_RISK", "BRL", "FOREIGN_FLOW",
  "US_EQUITIES", "US_YIELDS", "DXY", "CHINA", "IRON_ORE", "OIL", "GLOBAL_RISK_SENTIMENT",
] as const;
export type WinComponentKey = (typeof WIN_COMPONENTS)[number];

export const BRL_COMPONENTS = [
  "BCB_POLICY", "BRAZIL_INFLATION", "BRAZIL_ACTIVITY", "FISCAL_RISK", "DI_CURVE", "FOREIGN_FLOW", "COMMODITIES", "CHINA", "CARRY", "GLOBAL_RISK_SENTIMENT", "USD_PRESSURE",
] as const;
export type BrlComponentKey = (typeof BRL_COMPONENTS)[number];

export type Direction3 = "UP" | "DOWN" | "FLAT" | "UNKNOWN";
export type FlowClass = "INFLOW" | "NEUTRAL" | "OUTFLOW" | "UNKNOWN";

/** Um componente de score: sempre explica de onde veio. score=null ⇒ sem dado (nunca inventado). */
export interface ScoreComponent {
  key: string;
  score: number | null; // −2..+2 ou null (sem dado)
  weight: number;
  confidence: Confidence;
  reason: string;
  source: "events" | "di_curve" | "market" | "flow" | "g8_engine" | "derived" | null;
  requires_manual_confirmation?: boolean;
}

export interface InstrumentScore {
  score: number; // −2..+2 (passo 0.25)
  bias: "BULLISH" | "NEUTRAL" | "BEARISH";
  confidence: Confidence;
  components: ScoreComponent[];
  drivers: string[]; // textos curtos dos componentes mais pesados
  coverage: number; // 0..1 — fração do peso total com dado disponível
  previous_score: number | null;
  delta: number | null;
}

export interface DolScore {
  usd_score: number;
  brl_score: number;
  divergence: number; // USD − BRL
  bias: "LONG" | "SHORT" | "NEUTRAL";
  confidence: Confidence;
  drivers: string[];
  previous_divergence: number | null;
  delta: number | null;
}

// --- Curva DI ---------------------------------------------------------------
export type DiTenor = "SHORT" | "MID" | "LONG";
export interface DiContractInput { code: string; tenor: DiTenor; rate: number | null; change_bp: number | null }
export type DiShape = "BULL_STEEPENING" | "BEAR_STEEPENING" | "BULL_FLATTENING" | "BEAR_FLATTENING" | "PARALLEL_UP" | "PARALLEL_DOWN" | "STABLE" | "UNKNOWN";
export type DiCause = "INFLATION" | "FISCAL_RISK" | "BCB_HAWKISH" | "BCB_DOVISH" | "GLOBAL_YIELDS" | "RISK_PREMIUM" | "GROWTH" | "UNKNOWN";
export interface DiCurveAnalysis {
  contracts: DiContractInput[];
  short: { code: string | null; rate: number | null; change_bp: number | null; state: Direction3 };
  mid: { code: string | null; rate: number | null; change_bp: number | null; state: Direction3 };
  long: { code: string | null; rate: number | null; change_bp: number | null; state: Direction3 };
  slope_bp: number | null; // long − short (em bp)
  slope_change_bp: number | null; // Δlong − Δshort
  shape: DiShape;
  cause: DiCause;
  interpretation: string;
  equity_implication: "SUPPORTIVE" | "PRESSURE" | "MIXED" | "UNKNOWN";
  brl_implication: "SUPPORTIVE" | "PRESSURE" | "MIXED" | "UNKNOWN";
  requires_manual_confirmation: boolean;
}

// --- Mercado / intermarket --------------------------------------------------
export interface MarketReading { symbol: string; value: number | null; change_pct: number | null; change_bp: number | null; direction: Direction3; captured_at: string | null; source: string; stale: boolean }
export interface IntermarketRow extends MarketReading { label: string; score_contribution: number | null; correlation_warning: string | null; applies_to: ("WIN" | "DOL")[] }

// --- Event risk ---------------------------------------------------------------
export interface B3EventRisk { instrument: "WIN" | "DOL"; level: EventRiskLevel; events: (PendingEventView & { key_event: boolean })[]; next_key_event: string | null }

// --- Candidatos / alertas -----------------------------------------------------
export interface B3Candidate {
  instrument: B3Instrument;
  bias: "LONG" | "SHORT";
  score: number; // WIN score ou DOL divergence
  usd_score: number | null;
  brl_score: number | null;
  regime: B3Regime;
  confidence: Confidence;
  priority: number;
  event_risk: EventRiskLevel;
  event_risk_events: PendingEventView[];
  reason: string;
}
export interface B3Alert { level: "INFO" | "WARNING" | "DANGER"; code: string; message: string; instrument: "WIN" | "DOL" | "BOTH" }

// --- Resultado estruturado (spec item 27) -----------------------------------
export interface B3AnalysisResult {
  analysis_id: string | null;
  date: string;
  session: B3Session;
  brazil_macro: { score_from_events: number | null; live_events: number; drivers: CurrencyScoreView["drivers"]; categories: Record<string, { score: number | null; n: number }> };
  usd: { score: number; bias: string; confidence: Confidence; source: "g8_engine"; live_events: number; drivers: CurrencyScoreView["drivers"]; b3_context_note: string | null };
  brl: InstrumentScore;
  di_curve: DiCurveAnalysis | null;
  global_risk: { regime_hint: "RISK_ON" | "RISK_OFF" | "MIXED" | "UNKNOWN"; score: number | null; readings: IntermarketRow[] };
  china: { score: number | null; live_events: number; drivers: string[]; note: string };
  commodities: { score: number | null; iron_ore: MarketReading | null; brent: MarketReading | null; wti: MarketReading | null; copper: MarketReading | null; note: string };
  flow: { classification: FlowClass; value_brl_mi: number | null; captured_at: string | null; note: string };
  win: InstrumentScore & { regime: B3Regime };
  dol: DolScore;
  regime: B3Regime;
  intermarket: IntermarketRow[];
  event_risk: B3EventRisk[];
  trade_candidates: B3Candidate[];
  alerts: B3Alert[];
  changes_since_previous: string[];
  warnings: string[];
  brief: { headline: string; regime_narrative: string; win_view: string; dol_view: string; di_curve_cause: DiCause; di_curve_comment: string; conflicts: string[] } | null;
  meta: { scoring_version: string; prompt_version: string | null; model: string | null; events_interpreted: number; data_coverage: { win: number; brl: number } };
}
