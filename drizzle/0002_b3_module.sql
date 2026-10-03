-- =====================================================================
-- 0002 — Módulo B3 Macro (WIN & DOL). Idempotente (IF NOT EXISTS).
-- Reutiliza economic_events / macro_interpretations (BRL e CNY passam a ser aceitos).

-- 0) economic_events: o CHECK da migration 0001 só aceitava G8 → ampliar para BRL/CNY (nome do constraint é o padrão do Postgres)
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'economic_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%currency%' LOOP
    EXECUTE format('ALTER TABLE economic_events DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE economic_events ADD CONSTRAINT economic_events_currency_check CHECK (currency IN ('USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD','BRL','CNY'));
END $$;
-- =====================================================================

CREATE TABLE IF NOT EXISTS b3_macro_analyses (
  id SERIAL PRIMARY KEY,
  analysis_date DATE NOT NULL,
  session TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  input_type TEXT NOT NULL,
  images_count SMALLINT NOT NULL DEFAULT 0,
  events_count SMALLINT NOT NULL DEFAULT 0,
  model TEXT,
  prompt_version TEXT,
  scoring_version TEXT NOT NULL,
  regime TEXT,
  win_score REAL,
  dol_divergence REAL,
  result_json JSONB NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_b3_analyses_created ON b3_macro_analyses (created_at DESC);

CREATE TABLE IF NOT EXISTS b3_scores (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER REFERENCES b3_macro_analyses(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  session TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  instrument TEXT NOT NULL,
  score REAL NOT NULL,
  bias TEXT NOT NULL,
  confidence TEXT NOT NULL,
  regime TEXT,
  previous_score REAL,
  score_delta REAL,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
  scoring_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_b3_scores_instr_time ON b3_scores (instrument, computed_at);

CREATE TABLE IF NOT EXISTS di_curve_snapshots (
  id SERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analysis_id INTEGER,
  contracts JSONB NOT NULL,
  short_rate REAL, mid_rate REAL, long_rate REAL,
  short_change_bp REAL, mid_change_bp REAL, long_change_bp REAL,
  slope_bp REAL, slope_change_bp REAL,
  shape TEXT, cause TEXT, interpretation TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  ocr_confidence REAL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS ix_di_curve_time ON di_curve_snapshots (captured_at DESC);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id SERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analysis_id INTEGER,
  symbol TEXT NOT NULL,
  value REAL,
  change_pct REAL,
  change_bp REAL,
  direction TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  ocr_confidence REAL,
  requires_manual_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT
);
CREATE INDEX IF NOT EXISTS ix_market_snap_symbol_time ON market_snapshots (symbol, captured_at);

CREATE TABLE IF NOT EXISTS b3_trade_candidates (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER REFERENCES b3_macro_analyses(id) ON DELETE CASCADE,
  candidate_date DATE NOT NULL,
  session TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  instrument TEXT NOT NULL,
  bias TEXT NOT NULL,
  score REAL NOT NULL,
  usd_score REAL,
  brl_score REAL,
  regime TEXT,
  confidence TEXT NOT NULL,
  priority SMALLINT NOT NULL,
  event_risk TEXT NOT NULL,
  event_risk_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS b3_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal: campos B3 (não altera nada existente)
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS market TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS b3_analysis_id INTEGER;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS win_macro_score REAL;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS dol_macro_score REAL;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS usd_score REAL;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS brl_score REAL;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS di_short REAL;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS di_long REAL;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS risk_regime TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS dxy_state TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS us10y_state TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS sp500_state TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS nasdaq_state TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS iron_ore_state TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS oil_state TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS event_risk_at_entry TEXT;

-- Interpretação: implicação fiscal (nova dimensão usada pelo Brasil; G8 recebe 'NA')
ALTER TABLE macro_interpretations ADD COLUMN IF NOT EXISTS fiscal_implication TEXT;

-- Contratos DI padrão (editáveis em /b3 → Curva DI → configurar). Não sobrescreve se já existir.
INSERT INTO b3_settings (key, value_json) VALUES
  ('di_contracts', '[{"code":"DI1F27","tenor":"SHORT"},{"code":"DI1F29","tenor":"MID"},{"code":"DI1F31","tenor":"LONG"}]'::jsonb)
ON CONFLICT (key) DO NOTHING;
