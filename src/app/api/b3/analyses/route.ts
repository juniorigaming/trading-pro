import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { b3MacroAnalyses } from "@/db/schema";
import { errorResponse, json } from "@/lib/api-utils";
import { getLatestB3Analysis } from "@/lib/b3/pipeline";
import type { B3Session } from "@/lib/b3/types";
export const dynamic = "force-dynamic";
/** GET ?latest=1[&session=] | ?id= | lista */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) { const rows = await getDb().select().from(b3MacroAnalyses).where(eq(b3MacroAnalyses.id, Number(id))).limit(1); return rows[0] ? json({ ...(rows[0].resultJson as object), analysis_id: String(rows[0].id) }) : json({ error: "Análise não encontrada" }, 404); }
    if (url.searchParams.get("latest")) return json(await getLatestB3Analysis((url.searchParams.get("session") as B3Session | null) ?? undefined));
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);
    const rows = await getDb().select({ id: b3MacroAnalyses.id, analysisDate: b3MacroAnalyses.analysisDate, session: b3MacroAnalyses.session, createdAt: b3MacroAnalyses.createdAt, inputType: b3MacroAnalyses.inputType, imagesCount: b3MacroAnalyses.imagesCount, eventsCount: b3MacroAnalyses.eventsCount, model: b3MacroAnalyses.model, promptVersion: b3MacroAnalyses.promptVersion, scoringVersion: b3MacroAnalyses.scoringVersion, regime: b3MacroAnalyses.regime, winScore: b3MacroAnalyses.winScore, dolDivergence: b3MacroAnalyses.dolDivergence, warnings: b3MacroAnalyses.warnings })
      .from(b3MacroAnalyses).orderBy(desc(b3MacroAnalyses.createdAt)).limit(limit);
    // snake_case para o front (nunca expor camelCase cru do Drizzle)
    return json(rows.map((r) => ({ id: r.id, analysis_date: r.analysisDate, session: r.session, created_at: r.createdAt, input_type: r.inputType, images_count: r.imagesCount, events_count: r.eventsCount, model: r.model, prompt_version: r.promptVersion, scoring_version: r.scoringVersion, regime: r.regime, win_score: r.winScore, dol_divergence: r.dolDivergence, warnings: r.warnings })));
  } catch (e) { return errorResponse(e, "Falha ao listar análises B3"); }
}
