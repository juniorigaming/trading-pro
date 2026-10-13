-- =====================================================================================
-- 0004 — Motor v2-evidence: remove as CHECK constraints de macro_interpretations.
-- O motor determinístico grava classification = 'UNKNOWN' (direção não mensurável) e a CHECK da 0001 só aceitava 5 valores.
-- Motivo: o código novo da Análise Macro (escala -5..+5 / confiança 0-100) grava valores
-- que a CHECK antiga (criada pela migration 0001) não aceita. A validação já é feita pela
-- aplicação (zod); a constraint só está derrubando a análise. Idempotente: pode rodar várias vezes.
-- =====================================================================================

-- 1) Remove TODAS as CHECK constraints da tabela (classification, direction_value e qualquer outra)
DO $$
DECLARE c RECORD;
BEGIN
  IF to_regclass('public.macro_interpretations') IS NULL THEN
    RAISE NOTICE 'tabela macro_interpretations não existe';
    RETURN;
  END IF;
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.macro_interpretations'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.macro_interpretations DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'removida: %', c.conname;
  END LOOP;
END $$;

-- 2) direction_value: garante que aceita a escala nova (-5..+5) sem estourar SMALLINT/REAL
ALTER TABLE public.macro_interpretations ALTER COLUMN direction_value TYPE REAL USING direction_value::real;

-- 3) Conferência: não deve sobrar nenhuma linha de CHECK aqui
SELECT conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'public.macro_interpretations'::regclass AND contype = 'c';

-- 4) Valores que já estão gravados (só para você ver o que o código está escrevendo)
SELECT classification, count(*) AS linhas
FROM public.macro_interpretations
GROUP BY classification ORDER BY linhas DESC;
