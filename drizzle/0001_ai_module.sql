-- ============================================================================
-- Migration 0001 — Módulo de IA (Macro / Ranking G8 / SMC-ICT / Journal / Stats)
-- Idempotente. Não altera a tabela `trades` existente (extensão 1:1 via trade_journal).
-- Rodar: npm run db:migrate:ai   (usa DATABASE_URL do .env)
--   ou colar no Neon SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS economic_events (
  id SERIAL PRIMARY KEY,
  event_key TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD')),
  event TEXT NOT NULL,
  impact TEXT NOT NULL CHECK (impact IN ('high','medium','low','holiday','unknown')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  actual TEXT, forecast TEXT, previous TEXT,
  actual_num REAL, forecast_num REAL, previous_num REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','released','cancelled')),
  source TEXT NOT NULL CHECK (source IN ('screenshot_ai','calendar_api','manual')),
  source_ref TEXT,
  ocr_confidence REAL,
  requires_manual_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  user_edited BOOLEAN NOT NULL DEFAULT FALSE,
  user_edits JSONB,
  superseded_by INTEGER,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_econ_events_key_time ON economic_events(event_key, scheduled_at);
CREATE INDEX IF NOT EXISTS ix_econ_events_ccy_time ON economic_events(currency, scheduled_at);
CREATE INDEX IF NOT EXISTS ix_econ_events_status_time ON economic_events(status, scheduled_at);

CREATE TABLE IF NOT EXISTS macro_analyses (
  id SERIAL PRIMARY KEY,
  analysis_date DATE NOT NULL,
  session TEXT NOT NULL CHECK (session IN ('ASIA','LONDON','NEW_YORK')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  input_type TEXT NOT NULL,
  images_count SMALLINT NOT NULL DEFAULT 0,
  events_count SMALLINT NOT NULL DEFAULT 0,
  model TEXT, prompt_version TEXT,
  scoring_version TEXT NOT NULL,
  analysis_version TEXT NOT NULL DEFAULT '1',
  result_json JSONB NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS macro_interpretations (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES economic_events(id) ON DELETE CASCADE,
  analysis_id INTEGER,
  category TEXT NOT NULL,
  subcategory TEXT,
  importance TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('VERY_BULLISH','BULLISH','NEUTRAL','BEARISH','VERY_BEARISH')),
  direction_value SMALLINT NOT NULL CHECK (direction_value BETWEEN -2 AND 2),
  surprise_vs_forecast TEXT, change_vs_previous TEXT,
  growth_implication TEXT NOT NULL, inflation_implication TEXT NOT NULL,
  central_bank TEXT NOT NULL, central_bank_implication TEXT NOT NULL,
  priced_in TEXT,
  currency_implication TEXT NOT NULL,
  confidence TEXT NOT NULL,
  reasoning_summary TEXT NOT NULL,
  weight REAL NOT NULL, impact_factor REAL NOT NULL, confidence_factor REAL NOT NULL,
  score_contribution REAL NOT NULL,
  scoring_version TEXT NOT NULL, prompt_version TEXT NOT NULL, model TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_interp_event_current ON macro_interpretations(event_id, is_current);

CREATE TABLE IF NOT EXISTS currency_scores (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER REFERENCES macro_analyses(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  session TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  currency TEXT NOT NULL,
  score REAL NOT NULL, score_raw REAL NOT NULL,
  classification TEXT NOT NULL, bias TEXT NOT NULL, confidence TEXT NOT NULL,
  rank SMALLINT NOT NULL,
  previous_score REAL, score_delta REAL, momentum TEXT,
  live_events SMALLINT NOT NULL DEFAULT 0,
  drivers JSONB NOT NULL DEFAULT '[]',
  scoring_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_currency_scores_ccy_time ON currency_scores(currency, computed_at);

CREATE TABLE IF NOT EXISTS trade_candidates (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER REFERENCES macro_analyses(id) ON DELETE CASCADE,
  candidate_date DATE NOT NULL,
  session TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  symbol TEXT NOT NULL,
  bias TEXT NOT NULL CHECK (bias IN ('LONG','SHORT')),
  strong_currency TEXT NOT NULL, weak_currency TEXT NOT NULL,
  strong_score REAL NOT NULL, weak_score REAL NOT NULL,
  macro_divergence REAL NOT NULL,
  confidence TEXT NOT NULL,
  priority SMALLINT NOT NULL,
  event_risk TEXT NOT NULL CHECK (event_risk IN ('LOW','MEDIUM','HIGH','EXTREME')),
  event_risk_events JSONB NOT NULL DEFAULT '[]',
  reason TEXT
);

CREATE TABLE IF NOT EXISTS technical_analyses (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  symbol TEXT NOT NULL,
  session TEXT,
  macro_analysis_id INTEGER, candidate_id INTEGER,
  macro_bias TEXT, macro_divergence REAL,
  timeframes JSONB NOT NULL DEFAULT '[]',
  images JSONB NOT NULL DEFAULT '[]',
  result_json JSONB NOT NULL,
  checklist_json JSONB NOT NULL,
  htf_bias TEXT,
  liquidity_sweep BOOLEAN, displacement BOOLEAN, mss_present BOOLEAN,
  mss_timeframe TEXT, mss_type TEXT,
  entry_model_ai TEXT, entry_model_final TEXT,
  setup_grade_ai TEXT, setup_grade_final TEXT,
  status TEXT NOT NULL CHECK (status IN ('READY','WAIT','INVALID')),
  event_risk TEXT,
  intermarket_id INTEGER,
  model TEXT NOT NULL, prompt_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_tech_analyses_symbol ON technical_analyses(symbol, created_at);

CREATE TABLE IF NOT EXISTS trade_journal (
  trade_id INTEGER PRIMARY KEY REFERENCES trades(id) ON DELETE CASCADE,
  strong_currency TEXT, weak_currency TEXT, macro_divergence REAL, macro_scores JSONB,
  macro_analysis_id INTEGER, technical_analysis_id INTEGER,
  htf_bias TEXT, draw_on_liquidity TEXT, poi TEXT,
  liquidity_sweep BOOLEAN, mss_timeframe TEXT, mss_type TEXT,
  displacement BOOLEAN, fvg BOOLEAN,
  entry_model TEXT, setup_grade TEXT, setup_grade_locked_at TIMESTAMPTZ,
  planned_rr REAL, risk_usd NUMERIC, risk_percent REAL,
  error_tags JSONB NOT NULL DEFAULT '[]',
  lesson TEXT,
  ai_review_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_metrics (
  trade_id INTEGER PRIMARY KEY REFERENCES trades(id) ON DELETE CASCADE,
  mae_price NUMERIC, mae_r REAL, mfe_price NUMERIC, mfe_r REAL,
  realized_r REAL, initial_risk_r REAL DEFAULT 1, current_risk_r REAL,
  protected_structure TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_screenshots (
  id SERIAL PRIMARY KEY,
  trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('BEFORE','AFTER','OTHER')),
  timeframe TEXT,
  data_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_trade_screenshots_trade ON trade_screenshots(trade_id);

CREATE TABLE IF NOT EXISTS error_tags (
  trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_id, tag)
);

CREATE TABLE IF NOT EXISTS currency_exposure (
  id SERIAL PRIMARY KEY,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exposure JSONB NOT NULL,
  open_trades JSONB NOT NULL DEFAULT '[]',
  alerts JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS intermarket_snapshots (
  id SERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dxy REAL, dxy_change_pct REAL, us02y REAL, us10y REAL, real_yield REAL,
  us02y_change_bp REAL, us10y_change_bp REAL,
  regime TEXT, interpretation TEXT, note TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS ai_calls (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purpose TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
  prompt_version TEXT NOT NULL, schema_name TEXT NOT NULL, input_type TEXT NOT NULL,
  images_count SMALLINT NOT NULL DEFAULT 0,
  input_tokens INTEGER, output_tokens INTEGER, latency_ms INTEGER,
  ok BOOLEAN NOT NULL, error TEXT,
  retries SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scoring_config (
  version TEXT PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  config_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- pending_events: view derivada do RAW (um único lugar de verdade)
CREATE OR REPLACE VIEW pending_events AS
SELECT * FROM economic_events
WHERE status = 'pending' AND actual IS NULL
ORDER BY scheduled_at;
