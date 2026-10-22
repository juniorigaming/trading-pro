import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { macroAnalyses } from "@/db/schema";
import { errorResponse, json } from "@/lib/api-utils";
import { getLatestAnalysis } from "@/lib/macro/pipeline";
import type { MacroAnalysisResult, Session } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

/** GET ?latest=1[&session=] | ?id= | lista (histórico) */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const rows = await getDb().select().from(macroAnalyses).where(eq(macroAnalyses.id, Number(id))).limit(1);
      const analysis = rows[0];
      if (!analysis) return json({ error: "Análise não encontrada" }, 404);
      const result = analysis.resultJson && typeof analysis.resultJson === "object"
        ? analysis.resultJson as Partial<MacroAnalysisResult> : {};
      return json({
        ...analysis,
        resultJson: {
          ...result,
          calendar_status: result.calendar_status ?? (analysis.eventsCount > 0 ? "PROVIDED" : "NOT_PROVIDED"),
        },
      });
    }
    if (url.searchParams.get("latest")) {
      const session = url.searchParams.get("session") as Session | null;
      return json(await getLatestAnalysis(session ?? undefined));
    }
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);
    const rows = await getDb().select({ id: macroAnalyses.id, analysisDate: macroAnalyses.analysisDate, session: macroAnalyses.session, createdAt: macroAnalyses.createdAt, inputType: macroAnalyses.inputType, imagesCount: macroAnalyses.imagesCount, eventsCount: macroAnalyses.eventsCount, model: macroAnalyses.model, promptVersion: macroAnalyses.promptVersion, scoringVersion: macroAnalyses.scoringVersion, warnings: macroAnalyses.warnings })
      .from(macroAnalyses).orderBy(desc(macroAnalyses.createdAt)).limit(limit);
    return json(rows);
  } catch (e) { return errorResponse(e, "Falha ao listar análises"); }
}
