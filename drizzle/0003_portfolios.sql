-- =====================================================================
-- 0003 — Carteiras multi-mercado (FOREX · B3 · CRYPTO). Idempotente.
-- Todas as operações já existentes (import MT5) ficam na carteira FOREX.
-- =====================================================================

-- 1) coluna da carteira em trades
ALTER TABLE trades ADD COLUMN IF NOT EXISTS portfolio TEXT NOT NULL DEFAULT 'FOREX';
ALTER TABLE trades ADD COLUMN IF NOT EXISTS external_id TEXT;

-- 2) garante valores válidos (constraint só é criado se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trades_portfolio_check') THEN
    ALTER TABLE trades ADD CONSTRAINT trades_portfolio_check CHECK (portfolio IN ('FOREX','B3','CRYPTO'));
  END IF;
END $$;

-- 3) índices para o filtro por carteira e para o anti-duplicidade da importação
CREATE INDEX IF NOT EXISTS trades_portfolio_date_idx ON trades (portfolio, date DESC);
CREATE INDEX IF NOT EXISTS trades_portfolio_external_idx ON trades (portfolio, external_id);

-- 4) registros antigos: tickets MT5 gravados em notes ("Ticket 123") viram external_id
UPDATE trades
   SET external_id = substring(notes from 'Ticket\s+(\d+)')
 WHERE external_id IS NULL
   AND notes ~ 'Ticket\s+\d+';

-- 5) configurações das carteiras novas (zeradas). FOREX continua usando a chave legada "settings".
INSERT INTO config (key, value)
VALUES ('settings:B3', '{"accountName":"Carteira B3","currency":"BRL","initialCapital":0,"totalDeposits":0,"totalWithdrawals":0}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO config (key, value)
VALUES ('settings:CRYPTO', '{"accountName":"Carteira Cripto","currency":"USDT","initialCapital":0,"totalDeposits":0,"totalWithdrawals":0}')
ON CONFLICT (key) DO NOTHING;
