-- 0004 — Corrige/realinha as CHECK constraints de macro_interpretations com os enums do código.
-- Idempotente: pode ser executado quantas vezes for preciso no Neon SQL Editor.
--
-- Contexto: produção devolveu
--   new row for relation "macro_interpretations" violates check constraint "macro_interpretations_classification_check"
-- Este script remove TODAS as CHECK constraints da tabela que mencionem classification / importance / confidence /
-- category / direction_value e recria exatamente com os valores aceitos pelo backend (src/lib/ai/types.ts).

DO $$
DECLARE c RECORD;
BEGIN
  IF to_regclass('public.macro_interpretations') IS NULL THEN
    RAISE NOTICE 'macro_interpretations não existe — rode antes drizzle/0001_ai_module.sql';
    RETURN;
  END IF;

  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.macro_interpretations'::regclass
      AND contype = 'c'
      AND (pg_get_constraintdef(oid) ILIKE '%classification%'
        OR pg_get_constraintdef(oid) ILIKE '%importance%'
        OR pg_get_constraintdef(oid) ILIKE '%confidence%'
        OR pg_get_constraintdef(oid) ILIKE '%category%'
        OR pg_get_constraintdef(oid) ILIKE '%direction_value%')
  LOOP
    EXECUTE format('ALTER TABLE public.macro_interpretations DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'constraint removida: %', c.conname;
  END LOOP;

  -- Normaliza linhas antigas que porventura estejam fora do padrão (casing/espaços) antes de recriar as constraints.
  UPDATE public.macro_interpretations
     SET classification = regexp_replace(upper(trim(classification)), '[\s-]+', '_', 'g')
   WHERE classification <> regexp_replace(upper(trim(classification)), '[\s-]+', '_', 'g');
  -- sinônimos usados por versões antigas / outros prompts → enum canônico
  UPDATE public.macro_interpretations SET classification = CASE
      WHEN classification IN ('VERY_STRONG','STRONGLY_BULLISH','STRONG_BULLISH','VERY_POSITIVE','STRONG_POSITIVE','VERY_HAWKISH') THEN 'VERY_BULLISH'
      WHEN classification IN ('STRONG','MODERATELY_STRONG','MODERATELY_BULLISH','SLIGHTLY_BULLISH','MILDLY_BULLISH','POSITIVE','HAWKISH') THEN 'BULLISH'
      WHEN classification IN ('WEAK','MODERATELY_WEAK','MODERATELY_BEARISH','SLIGHTLY_BEARISH','MILDLY_BEARISH','NEGATIVE','DOVISH') THEN 'BEARISH'
      WHEN classification IN ('VERY_WEAK','STRONGLY_BEARISH','STRONG_BEARISH','VERY_NEGATIVE','STRONG_NEGATIVE','VERY_DOVISH') THEN 'VERY_BEARISH'
      WHEN classification LIKE '%VERY_BULLISH%' THEN 'VERY_BULLISH'
      WHEN classification LIKE '%VERY_BEARISH%' THEN 'VERY_BEARISH'
      WHEN classification LIKE '%BULLISH%' THEN 'BULLISH'
      WHEN classification LIKE '%BEARISH%' THEN 'BEARISH'
      ELSE 'NEUTRAL' END
   WHERE classification NOT IN ('VERY_BULLISH','BULLISH','NEUTRAL','BEARISH','VERY_BEARISH');
  UPDATE public.macro_interpretations SET direction_value = GREATEST(-2, LEAST(2, direction_value)) WHERE direction_value < -2 OR direction_value > 2;

  ALTER TABLE public.macro_interpretations
    ADD CONSTRAINT macro_interpretations_classification_check
    CHECK (classification IN ('VERY_BULLISH','BULLISH','NEUTRAL','BEARISH','VERY_BEARISH'));

  ALTER TABLE public.macro_interpretations
    ADD CONSTRAINT macro_interpretations_direction_value_check
    CHECK (direction_value BETWEEN -2 AND 2);

  RAISE NOTICE 'macro_interpretations: constraints recriadas';
END $$;

-- Conferência (opcional): lista as constraints atuais da tabela.
SELECT conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'public.macro_interpretations'::regclass AND contype = 'c'
ORDER BY conname;
