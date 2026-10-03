/**
 * Schema do módulo B3 Macro — WIN & DOL. Espelha drizzle/0002_b3_module.sql.
 * Reutiliza economic_events (moedas BRL/CNY passam a ser aceitas) e macro_interpretations.
 * Tabelas novas: b3_macro_analyses, b3_scores (USD/BRL/WIN/DOL num só lugar, coluna instrument),
 * di_curve_snapshots, market_snapshots (intermarket + commodities + fluxo), b3_trade_candidates, b3_settings.
 */
import { pgTable, serial, integer, smallint, text, boolean, real, timestamp, date, jsonb, index } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const b3MacroAnalyses = pgTable("b3_macro_analyses", {
  id: serial("id").primaryKey(),
  analysisDate: date("analysis_date").notNull(),
  session: text("session").notNull(), // PRE_MARKET OPEN MORNING NY_OVERLAP AFTERNOON CLOSE
  createdAt: ts("created_at").defaultNow().notNull(),
  inputType: text("input_type").notNull(), // screenshot | structured | manual | recompute
  imagesCount: smallint("images_count").notNull().default(0),
  eventsCount: smallint("events_count").notNull().default(0),
  model: text("model"),
  promptVersion: text("prompt_version"),
  scoringVersion: text("scoring_version").notNull(),
  regime: text("regime"),
  winScore: real("win_score"),
  dolDivergence: real("dol_divergence"),
  resultJson: jsonb("result_json").notNull(), // B3AnalysisResult
  warnings: jsonb("warnings").notNull().default([]),
});

/** Scores persistidos por instrumento: USD (reuso do G8), BRL, WIN, DOL. */
export const b3Scores = pgTable(
  "b3_scores",
  {
    id: serial("id").primaryKey(),
    analysisId: integer("analysis_id").references(() => b3MacroAnalyses.id, { onDelete: "cascade" }),
    scoreDate: date("score_date").notNull(),
    session: text("session").notNull(),
    computedAt: ts("computed_at").defaultNow().notNull(),
    instrument: text("instrument").notNull(), // USD | BRL | WIN | DOL
    score: real("score").notNull(),
    bias: text("bias").notNull(), // BULLISH NEUTRAL BEARISH | LONG SHORT NEUTRAL (DOL)
    confidence: text("confidence").notNull(),
    regime: text("regime"),
    previousScore: real("previous_score"),
    scoreDelta: real("score_delta"),
    components: jsonb("components").notNull().default([]), // ScoreComponent[]
    drivers: jsonb("drivers").notNull().default([]),
    scoringVersion: text("scoring_version").notNull(),
  },
  (t) => [index("ix_b3_scores_instr_time").on(t.instrument, t.computedAt)],
);

export const diCurveSnapshots = pgTable("di_curve_snapshots", {
  id: serial("id").primaryKey(),
  capturedAt: ts("captured_at").defaultNow().notNull(),
  analysisId: integer("analysis_id"),
  contracts: jsonb("contracts").notNull(), // [{code, tenor: SHORT|MID|LONG, rate, change_bp}]
  shortRate: real("short_rate"),
  midRate: real("mid_rate"),
  longRate: real("long_rate"),
  shortChangeBp: real("short_change_bp"),
  midChangeBp: real("mid_change_bp"),
  longChangeBp: real("long_change_bp"),
  slopeBp: real("slope_bp"), // long − short
  slopeChangeBp: real("slope_change_bp"),
  shape: text("shape"), // BULL_STEEPENING BEAR_STEEPENING BULL_FLATTENING BEAR_FLATTENING PARALLEL_UP PARALLEL_DOWN STABLE UNKNOWN
  cause: text("cause"), // INFLATION FISCAL_RISK BCB_HAWKISH BCB_DOVISH GLOBAL_YIELDS RISK_PREMIUM GROWTH UNKNOWN
  interpretation: text("interpretation"),
  source: text("source").notNull().default("manual"), // manual | screenshot_ai | api
  ocrConfidence: real("ocr_confidence"),
  note: text("note"),
});

/** Snapshot genérico de mercado/intermarket/commodities/fluxo (um ativo por linha). */
export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    id: serial("id").primaryKey(),
    capturedAt: ts("captured_at").defaultNow().notNull(),
    analysisId: integer("analysis_id"),
    symbol: text("symbol").notNull(), // IBOV WIN DOL WDO USDBRL SPX NAS100 DXY US02Y US10Y BRENT WTI IRON_ORE COPPER VIX FOREIGN_FLOW
    value: real("value"),
    changePct: real("change_pct"),
    changeBp: real("change_bp"),
    direction: text("direction"), // UP DOWN FLAT UNKNOWN
    source: text("source").notNull().default("manual"),
    ocrConfidence: real("ocr_confidence"),
    requiresManualConfirmation: boolean("requires_manual_confirmation").notNull().default(false),
    note: text("note"),
  },
  (t) => [index("ix_market_snap_symbol_time").on(t.symbol, t.capturedAt)],
);

export const b3TradeCandidates = pgTable("b3_trade_candidates", {
  id: serial("id").primaryKey(),
  analysisId: integer("analysis_id").references(() => b3MacroAnalyses.id, { onDelete: "cascade" }),
  candidateDate: date("candidate_date").notNull(),
  session: text("session").notNull(),
  computedAt: ts("computed_at").defaultNow().notNull(),
  instrument: text("instrument").notNull(), // WIN | DOL | WDO
  bias: text("bias").notNull(), // LONG | SHORT
  score: real("score").notNull(), // WIN score ou DOL divergence
  usdScore: real("usd_score"),
  brlScore: real("brl_score"),
  regime: text("regime"),
  confidence: text("confidence").notNull(),
  priority: smallint("priority").notNull(),
  eventRisk: text("event_risk").notNull(),
  eventRiskEvents: jsonb("event_risk_events").notNull().default([]),
  reason: text("reason"),
});

/** Configurações dinâmicas do módulo (contratos DI, pesos) — nada hardcoded por data. */
export const b3Settings = pgTable("b3_settings", {
  key: text("key").primaryKey(), // di_contracts | weights
  valueJson: jsonb("value_json").notNull(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});
