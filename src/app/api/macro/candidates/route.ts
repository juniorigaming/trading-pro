import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { macroAnalyses, tradeCandidates } from "@/db/schema";
import { errorResponse, json } from "@/lib/api-utils";
import type { Confidence, Currency, EventRiskLevel, PendingEventView, TradeCandidateView } from "@/lib/ai/types";
export const dynamic = "force-dynamic";

type Row = typeof tradeCandidates.$inferSelect;

/** Converte a linha do banco (camelCase) para o contrato da UI (snake_case TradeCandidateView). */
function toView(r: Row): TradeCandidateView & { id: number; analysis_id: number | null; session: string; computed_at: string } {
  return {
    id: r.id,
    analysis_id: r.analysisId ?? null,
    session: r.session,
    computed_at: r.computedAt instanceof Date ? r.computedAt.toISOString() : String(r.computedAt),
    symbol: r.symbol,
    bias: r.bias as "LONG" | "SHORT",
    strong_currency: r.strongCurrency as Currency,
    weak_currency: r.weakCurrency as Currency,
    strong_score: Number(r.strongScore ?? 0),
    weak_score: Number(r.weakScore ?? 0),
    macro_divergence: Number(r.macroDivergence ?? 0),
    confidence: r.confidence as Confidence,
    priority: Number(r.priority ?? 0),
    event_risk: (r.eventRisk as EventRiskLevel) || "LOW",
    event_risk_events: (Array.isArray(r.eventRiskEvents) ? r.eventRiskEvents : []) as PendingEventView[],
    reason: r.reason ?? "",
  };
}

/**
 * GET[?session=] → candidatos SOMENTE da análise mais recente (mesmo critério de /api/macro/analyses?latest=1).
 * Nunca reaproveita candidatos de análises anteriores: se a análise atual não gerou nenhum, a lista é vazia.
 */
export async function GET(request: Request) {
  try {
    const db = getDb();
    const session = new URL(request.url).searchParams.get("session");
    const latest = await db.select({ id: macroAnalyses.id }).from(macroAnalyses)
      .where(session && session !== "ALL" ? eq(macroAnalyses.session, session as never) : undefined)
      .orderBy(desc(macroAnalyses.createdAt)).limit(1);
    if (!latest[0]) return json([]);
    const rows = await db.select().from(tradeCandidates)
      .where(and(eq(tradeCandidates.analysisId, latest[0].id)))
      .orderBy(desc(tradeCandidates.computedAt), tradeCandidates.priority);
    const unique = new Map<string, Row>();
    for (const row of rows) if (!unique.has(row.symbol)) unique.set(row.symbol, row);
    return json([...unique.values()].sort((a, b) => a.priority - b.priority).map(toView));
  } catch (e) { return errorResponse(e, "Falha ao carregar candidatos"); }
}
