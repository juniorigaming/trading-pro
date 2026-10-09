/**
 * Schema do módulo de IA (Macro / G8 / SMC-ICT / Journal / Estatísticas).
 * Espelha a migration drizzle/0001_ai_module.sql.
 * RAW (economic_events) e INTERPRETAÇÃO (macro_interpretations) são tabelas separadas:
 * mudar a metodologia de scoring nunca sobrescreve o dado bruto.
 */
import {
  pgTable,
  serial,
  integer,
  smallint,
  text,
  boolean,
  real,
  numeric,
  timestamp,
  date,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { trades } from "./schema";

const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------
// 1) RAW DATA — calendário econômico (realized + pending)
// ---------------------------------------------------------------------------
export const economicEvents = pgTable(
  "economic_events",
  {
    id: serial("id").primaryKey(),
    eventKey: text("event_key").notNull(), // 'USD|core_cpi_mom' (normalizado p/ supersede)
    currency: text("currency").notNull(), // USD EUR GBP JPY CHF CAD AUD NZD
    event: text("event").notNull(),
    impact: text("impact").notNull(), // high medium low holiday unknown
    scheduledAt: ts("scheduled_at").notNull(),
    actual: text("actual"),
    forecast: text("forecast"),
    previous: text("previous"),
    actualNum: real("actual_num"),
    forecastNum: real("forecast_num"),
    previousNum: real("previous_num"),
    status: text("status").notNull().default("pending"), // pending | released | cancelled
    source: text("source").notNull(), // screenshot_ai | calendar_api | manual
    sourceRef: text("source_ref"),
    ocrConfidence: real("ocr_confidence"),
    requiresManualConfirmation: boolean("requires_manual_confirmation").notNull().default(false),
    userEdited: boolean("user_edited").notNull().default(false),
    userEdits: jsonb("user_edits"), // {field: {from, to}} — auditoria das edições pós-OCR
    supersededBy: integer("superseded_by"),
    supersededAt: ts("superseded_at"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("ux_econ_events_key_time").on(t.eventKey, t.scheduledAt),
    index("ix_econ_events_ccy_time").on(t.currency, t.scheduledAt),
    index("ix_econ_events_status_time").on(t.status, t.scheduledAt),
  ],
);

// ---------------------------------------------------------------------------
// 2) INTERPRETAÇÃO — gerada pela IA, versionada
// ---------------------------------------------------------------------------
export const macroInterpretations = pgTable(
  "macro_interpretations",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull().references(() => economicEvents.id, { onDelete: "cascade" }),
    analysisId: integer("analysis_id"),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    importance: text("importance").notNull(), // HIGH MEDIUM_HIGH MEDIUM LOW
    classification: text("classification").notNull(), // VERY_BULLISH ... VERY_BEARISH
    directionValue: smallint("direction_value").notNull(), // -2..+2
    surpriseVsForecast: text("surprise_vs_forecast"),
    changeVsPrevious: text("change_vs_previous"),
    growthImplication: text("growth_implication").notNull(),
    inflationImplication: text("inflation_implication").notNull(),
    centralBank: text("central_bank").notNull(),
    centralBankImplication: text("central_bank_implication").notNull(),
    fiscalImplication: text("fiscal_implication"), // migration 0002 (B3)
    pricedIn: text("priced_in"),
    currencyImplication: text("currency_implication").notNull(),
    confidence: text("confidence").notNull(),
    reasoningSummary: text("reasoning_summary").notNull(),
    // calculado pelo backend (auditoria)
    weight: real("weight").notNull(),
    impactFactor: real("impact_factor").notNull(),
    confidenceFactor: real("confidence_factor").notNull(),
    scoreContribution: real("score_contribution").notNull(),
    scoringVersion: text("scoring_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("ix_interp_event_current").on(t.eventId, t.isCurrent)],
);

// ---------------------------------------------------------------------------
// 3) ANÁLISE MACRO (cabeçalho de cada execução) + SCORES + CANDIDATOS
// ---------------------------------------------------------------------------
export const macroAnalyses = pgTable("macro_analyses", {
  id: serial("id").primaryKey(),
  analysisDate: date("analysis_date").notNull(),
  session: text("session").notNull(), // ASIA | LONDON | NEW_YORK
  createdAt: ts("created_at").defaultNow().notNull(),
  inputType: text("input_type").notNull(), // screenshot | structured | recompute
  imagesCount: smallint("images_count").notNull().default(0),
  eventsCount: smallint("events_count").notNull().default(0),
  model: text("model"),
  promptVersion: text("prompt_version"),
  scoringVersion: text("scoring_version").notNull(),
  analysisVersion: text("analysis_version").notNull().default("1"),
  resultJson: jsonb("result_json").notNull(), // MacroAnalysis structured output
  warnings: jsonb("warnings").notNull().default([]),
});

export const currencyScores = pgTable(
  "currency_scores",
  {
    id: serial("id").primaryKey(),
    analysisId: integer("analysis_id").references(() => macroAnalyses.id, { onDelete: "cascade" }),
    scoreDate: date("score_date").notNull(),
    session: text("session").notNull(),
    computedAt: ts("computed_at").defaultNow().notNull(),
    currency: text("currency").notNull(),
    score: real("score").notNull(),
    scoreRaw: real("score_raw").notNull(),
    classification: text("classification").notNull(),
    bias: text("bias").notNull(),
    confidence: text("confidence").notNull(),
    rank: smallint("rank").notNull(),
    previousScore: real("previous_score"),
    scoreDelta: real("score_delta"),
    momentum: text("momentum"), // STRENGTHENING | WEAKENING | STABLE | NARRATIVE_SHIFT
    liveEvents: smallint("live_events").notNull().default(0),
    drivers: jsonb("drivers").notNull().default([]),
    scoringVersion: text("scoring_version").notNull(),
  },
  (t) => [index("ix_currency_scores_ccy_time").on(t.currency, t.computedAt)],
);

export const tradeCandidates = pgTable("trade_candidates", {
  id: serial("id").primaryKey(),
  analysisId: integer("analysis_id").references(() => macroAnalyses.id, { onDelete: "cascade" }),
  candidateDate: date("candidate_date").notNull(),
  session: text("session").notNull(),
  computedAt: ts("computed_at").defaultNow().notNull(),
  symbol: text("symbol").notNull(),
  bias: text("bias").notNull(), // LONG | SHORT
  strongCurrency: text("strong_currency").notNull(),
  weakCurrency: text("weak_currency").notNull(),
  strongScore: real("strong_score").notNull(),
  weakScore: real("weak_score").notNull(),
  macroDivergence: real("macro_divergence").notNull(),
  confidence: text("confidence").notNull(),
  priority: smallint("priority").notNull(),
  eventRisk: text("event_risk").notNull(), // LOW MEDIUM HIGH EXTREME
  eventRiskEvents: jsonb("event_risk_events").notNull().default([]),
  reason: text("reason"),
});

// ---------------------------------------------------------------------------
// 4) ANÁLISE TÉCNICA SMC/ICT
// ---------------------------------------------------------------------------
export const technicalAnalyses = pgTable(
  "technical_analyses",
  {
    id: serial("id").primaryKey(),
    createdAt: ts("created_at").defaultNow().notNull(),
    symbol: text("symbol").notNull(),
    session: text("session"),
    macroAnalysisId: integer("macro_analysis_id"),
    candidateId: integer("candidate_id"),
    macroBias: text("macro_bias"), // LONG SHORT NEUTRAL
    macroDivergence: real("macro_divergence"),
    timeframes: jsonb("timeframes").notNull().default([]), // ['D1','H4',...]
    images: jsonb("images").notNull().default([]), // [{timeframe, name, size}] (dados binários não são persistidos)
    resultJson: jsonb("result_json").notNull(),
    checklistJson: jsonb("checklist_json").notNull(),
    htfBias: text("htf_bias"),
    liquiditySweep: boolean("liquidity_sweep"),
    displacement: boolean("displacement"),
    mssPresent: boolean("mss_present"),
    mssTimeframe: text("mss_timeframe"),
    mssType: text("mss_type"),
    entryModelAi: text("entry_model_ai"),
    entryModelFinal: text("entry_model_final"),
    setupGradeAi: text("setup_grade_ai"),
    setupGradeFinal: text("setup_grade_final"),
    status: text("status").notNull(), // READY | WAIT | INVALID
    eventRisk: text("event_risk"),
    intermarketId: integer("intermarket_id"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
  },
  (t) => [index("ix_tech_analyses_symbol").on(t.symbol, t.createdAt)],
);

// ---------------------------------------------------------------------------
// 5) JOURNAL — extensão 1:1 da tabela trades existente
// ---------------------------------------------------------------------------
export const tradeJournal = pgTable("trade_journal", {
  tradeId: integer("trade_id").primaryKey().references(() => trades.id, { onDelete: "cascade" }),
  strongCurrency: text("strong_currency"),
  weakCurrency: text("weak_currency"),
  macroDivergence: real("macro_divergence"),
  macroScores: jsonb("macro_scores"), // snapshot {USD: 1.25, ...}
  macroAnalysisId: integer("macro_analysis_id"),
  technicalAnalysisId: integer("technical_analysis_id"),
  htfBias: text("htf_bias"),
  drawOnLiquidity: text("draw_on_liquidity"),
  poi: text("poi"),
  liquiditySweep: boolean("liquidity_sweep"),
  mssTimeframe: text("mss_timeframe"),
  mssType: text("mss_type"), // INTERNAL_MSS | EXTERNAL_MSS
  displacement: boolean("displacement"),
  fvg: boolean("fvg"),
  entryModel: text("entry_model"), // MODEL_A_AGGRESSIVE | MODEL_B_CONFIRMED
  setupGrade: text("setup_grade"), // A | B | C
  setupGradeLockedAt: ts("setup_grade_locked_at"),
  plannedRr: real("planned_rr"),
  riskUsd: numeric("risk_usd"),
  riskPercent: real("risk_percent"),
  errorTags: jsonb("error_tags").notNull().default([]),
  lesson: text("lesson"),
  aiReviewJson: jsonb("ai_review_json"),
  // --- B3 (WIN/DOL/WDO) — migration 0002 ---
  market: text("market"), // FOREX | B3 | OTHER
  b3AnalysisId: integer("b3_analysis_id"),
  winMacroScore: real("win_macro_score"),
  dolMacroScore: real("dol_macro_score"),
  usdScore: real("usd_score"),
  brlScore: real("brl_score"),
  diShort: real("di_short"),
  diLong: real("di_long"),
  riskRegime: text("risk_regime"),
  dxyState: text("dxy_state"), // UP DOWN FLAT UNKNOWN
  us10yState: text("us10y_state"),
  sp500State: text("sp500_state"),
  nasdaqState: text("nasdaq_state"),
  ironOreState: text("iron_ore_state"),
  oilState: text("oil_state"),
  eventRiskAtEntry: text("event_risk_at_entry"), // LOW MEDIUM HIGH EXTREME
  createdAt: ts("created_at").defaultNow().notNull(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});

export const tradeMetrics = pgTable("trade_metrics", {
  tradeId: integer("trade_id").primaryKey().references(() => trades.id, { onDelete: "cascade" }),
  maePrice: numeric("mae_price"),
  maeR: real("mae_r"),
  mfePrice: numeric("mfe_price"),
  mfeR: real("mfe_r"),
  realizedR: real("realized_r"),
  initialRiskR: real("initial_risk_r").default(1),
  currentRiskR: real("current_risk_r"),
  protectedStructure: text("protected_structure"),
  source: text("source").notNull().default("manual"),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});

export const tradeScreenshots = pgTable("trade_screenshots", {
  id: serial("id").primaryKey(),
  tradeId: integer("trade_id").notNull().references(() => trades.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // BEFORE | AFTER | OTHER
  timeframe: text("timeframe"),
  dataUrl: text("data_url").notNull(), // data:image/jpeg;base64 (comprimido no cliente, ≤ 400KB)
  createdAt: ts("created_at").defaultNow().notNull(),
});

export const errorTags = pgTable(
  "error_tags",
  {
    tradeId: integer("trade_id").notNull().references(() => trades.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tradeId, t.tag] })],
);

// ---------------------------------------------------------------------------
// 6) EXPOSIÇÃO / INTERMARKET / AUDITORIA / CONFIG
// ---------------------------------------------------------------------------
export const currencyExposure = pgTable("currency_exposure", {
  id: serial("id").primaryKey(),
  computedAt: ts("computed_at").defaultNow().notNull(),
  exposure: jsonb("exposure").notNull(), // {AUD:-3, USD:1,...}
  openTrades: jsonb("open_trades").notNull().default([]),
  alerts: jsonb("alerts").notNull().default([]),
});

export const intermarketSnapshots = pgTable("intermarket_snapshots", {
  id: serial("id").primaryKey(),
  capturedAt: ts("captured_at").defaultNow().notNull(),
  dxy: real("dxy"),
  dxyChangePct: real("dxy_change_pct"),
  us02y: real("us02y"),
  us10y: real("us10y"),
  realYield: real("real_yield"),
  us02yChangeBp: real("us02y_change_bp"),
  us10yChangeBp: real("us10y_change_bp"),
  regime: text("regime"),
  interpretation: text("interpretation"),
  note: text("note"),
  source: text("source").notNull().default("manual"),
});

export const aiCalls = pgTable("ai_calls", {
  id: serial("id").primaryKey(),
  createdAt: ts("created_at").defaultNow().notNull(),
  purpose: text("purpose").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  schemaName: text("schema_name").notNull(),
  inputType: text("input_type").notNull(),
  imagesCount: smallint("images_count").notNull().default(0),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  latencyMs: integer("latency_ms"),
  ok: boolean("ok").notNull(),
  error: text("error"),
  retries: smallint("retries").notNull().default(0),
});

export const scoringConfig = pgTable("scoring_config", {
  version: text("version").primaryKey(),
  isActive: boolean("is_active").notNull().default(false),
  configJson: jsonb("config_json").notNull(),
  createdAt: ts("created_at").defaultNow().notNull(),
});
