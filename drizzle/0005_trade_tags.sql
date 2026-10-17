-- Tags livres por operação para análise de edge (idempotente).
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN trades.tags IS 'Etiquetas livres da operação para filtros e análise de edge no Trading Pro';
