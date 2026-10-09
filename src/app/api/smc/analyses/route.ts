import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { technicalAnalyses } from "@/db/schema";
import { errorResponse, json } from "@/lib/api-utils";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) { const r = await getDb().select().from(technicalAnalyses).where(eq(technicalAnalyses.id, Number(id))).limit(1); return r[0] ? json(r[0]) : json({ error: "não encontrada" }, 404); }
    const rows = await getDb().select({ id: technicalAnalyses.id, createdAt: technicalAnalyses.createdAt, symbol: technicalAnalyses.symbol, session: technicalAnalyses.session, macroBias: technicalAnalyses.macroBias, status: technicalAnalyses.status, setupGradeFinal: technicalAnalyses.setupGradeFinal, entryModelFinal: technicalAnalyses.entryModelFinal, timeframes: technicalAnalyses.timeframes, htfBias: technicalAnalyses.htfBias, eventRisk: technicalAnalyses.eventRisk })
      .from(technicalAnalyses).orderBy(desc(technicalAnalyses.createdAt)).limit(50);
    return json(rows);
  } catch (e) { return errorResponse(e, "Falha ao listar análises técnicas"); }
}
