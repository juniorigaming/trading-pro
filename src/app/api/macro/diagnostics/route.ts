/**
 * GET /api/macro/diagnostics
 * Diagnóstico das tabelas do módulo IA/Macro em produção (sem precisar abrir o Neon):
 *   - existência das tabelas, contagem de linhas
 *   - CHECK constraints reais (definição) de macro_interpretations / economic_events / currency_scores
 *   - comparação com os enums do código → `mismatches` lista o que precisa do SQL drizzle/0004_fix_macro_checks.sql
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { CLASSIFICATIONS } from "@/lib/ai/types";
export const dynamic = "force-dynamic";

const TABLES = ["economic_events", "macro_interpretations", "currency_scores", "trade_candidates", "macro_analyses", "ai_calls", "scoring_config"] as const;

interface ConstraintRow { table_name: string; conname: string; definition: string }

export async function GET(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const db = getDb();
    const tables: Record<string, { exists: boolean; rows: number | null }> = {};
    for (const t of TABLES) {
      const reg = await db.execute(sql`SELECT to_regclass(${"public." + t}) AS r`);
      const exists = Boolean((reg.rows[0] as { r: string | null } | undefined)?.r);
      let rows: number | null = null;
      if (exists) {
        const c = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM public.${t}`));
        rows = Number((c.rows[0] as { n: number }).n);
      }
      tables[t] = { exists, rows };
    }

    const cons = await db.execute(sql`
      SELECT c.conrelid::regclass::text AS table_name, c.conname, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      WHERE c.contype = 'c'
        AND c.conrelid IN (SELECT oid FROM pg_class WHERE relname IN ('economic_events','macro_interpretations','currency_scores','trade_candidates') AND relnamespace = 'public'::regnamespace)
      ORDER BY 1, 2`);
    const constraints = cons.rows as unknown as ConstraintRow[];

    // Verifica se a CHECK de classification aceita exatamente os valores do código.
    const mismatches: string[] = [];
    const cls = constraints.find((c) => c.table_name.endsWith("macro_interpretations") && /classification/i.test(c.definition));
    if (cls) {
      const missing = CLASSIFICATIONS.filter((v) => !cls.definition.includes(`'${v}'`));
      if (missing.length) mismatches.push(`macro_interpretations.${cls.conname} não aceita: ${missing.join(", ")} — definição atual: ${cls.definition}`);
    }
    // Linhas já gravadas fora do enum (um UPDATE nelas — ex.: supersede ao reanalisar — também dispara a CHECK).
    let distinct: { classification: string; n: number }[] = [];
    if (tables.macro_interpretations.exists) {
      const d = await db.execute(sql`SELECT classification, count(*)::int AS n FROM public.macro_interpretations GROUP BY 1 ORDER BY 2 DESC`);
      distinct = d.rows as unknown as { classification: string; n: number }[];
      const bad = distinct.filter((r) => !(CLASSIFICATIONS as readonly string[]).includes(r.classification));
      if (bad.length) mismatches.push(`macro_interpretations tem ${bad.reduce((a, b) => a + Number(b.n), 0)} linha(s) com classification fora do enum: ${bad.map((b) => `"${b.classification}"×${b.n}`).join(", ")}`);
    }
    const col = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'macro_interpretations' ORDER BY ordinal_position`);

    return json({
      ok: mismatches.length === 0,
      expected: { classification: CLASSIFICATIONS },
      tables,
      constraints,
      columns: col.rows,
      classification_values: distinct,
      mismatches,
      fix: mismatches.length ? "Execute drizzle/0004_fix_macro_checks.sql no Neon SQL Editor e repita a análise." : null,
    });
  } catch (e) { return errorResponse(e, "Falha no diagnóstico"); }
}
