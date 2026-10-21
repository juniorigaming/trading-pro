import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { macroAnalyses } from "@/db/schema";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { ensureAIAudit } from "@/lib/ai/audit";
import { SESSIONS, type MacroAnalysisResult, type Session } from "@/lib/ai/types";
import { interpretPendingEvents, loadScoringConfig, recomputeScores } from "@/lib/macro/pipeline";
export const dynamic = "force-dynamic";

/** Recalcula a análise vigente com os eventos já salvos. Interpretação por IA só roda se solicitada explicitamente. */
export async function POST(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;
  try {
    const body = z.object({
      session: z.enum(SESSIONS).default("LONDON"),
      interpret: z.boolean().default(false),
    }).parse(await request.json().catch(() => ({})));
    const db = getDb();
    const [analysis] = await db.select().from(macroAnalyses)
      .where(eq(macroAnalyses.session, body.session))
      .orderBy(desc(macroAnalyses.createdAt)).limit(1);
    if (!analysis) return json({ error: "Nenhuma análise salva para esta sessão." }, 404);

    const cfg = await loadScoringConfig();
    let interpreted = 0;
    let interpretWarnings: string[] = [];
    if (body.interpret) {
      ensureAIAudit();
      const outcome = await interpretPendingEvents(cfg, analysis.id);
      interpreted = outcome.interpreted;
      interpretWarnings = outcome.warnings;
    }

    const computed = await recomputeScores({
      session: body.session, analysisId: analysis.id, cfg,
      inputType: (analysis.inputType === "screenshot" || analysis.inputType === "structured" || analysis.inputType === "manual")
        ? analysis.inputType : "manual",
    });
    const { trusted, audit, meta, warnings, checks, scopeId, ...fields } = computed;
    const previous = analysis.resultJson && typeof analysis.resultJson === "object"
      ? analysis.resultJson as Partial<MacroAnalysisResult> : {};
    const updated: MacroAnalysisResult = {
      ...previous,
      ...fields,
      analysis_id: String(analysis.id),
      analysis_status: trusted ? "OK" : "ANALISE_INSUFICIENTE",
      meta: {
        scoring_version: meta.scoring_version,
        prompt_version: previous.meta?.prompt_version ?? null,
        model: previous.meta?.model ?? "code",
        events_interpreted: (previous.meta?.events_interpreted ?? 0) + interpreted,
      },
      warnings: [...warnings, ...interpretWarnings],
      audit: { ...audit, analysis_id: String(analysis.id) },
    };
    await db.update(macroAnalyses).set({ resultJson: updated, warnings: updated.warnings, scoringVersion: cfg.version }).where(eq(macroAnalyses.id, analysis.id));
    return json({ ...updated, trusted, checks, scopeId, interpreted });
  } catch (e) {
    return errorResponse(e, "Falha ao recalcular");
  }
}
