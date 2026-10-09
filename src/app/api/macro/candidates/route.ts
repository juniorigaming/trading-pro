import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tradeCandidates } from "@/db/schema";
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

/** GET → candidatos do último cálculo (mesmo computed_at), já no formato TradeCandidateView */
export async function GET() {
  try {
    const db = getDb();
    const last = await db.select({ computedAt: tradeCandidates.computedAt }).from(tradeCandidates).orderBy(desc(tradeCandidates.computedAt)).limit(1);
    if (!last[0]) return json([]);
    const rows = await db.select().from(tradeCandidates).where(eq(tradeCandidates.computedAt, last[0].computedAt)).orderBy(tradeCandidates.priority);
    return json(rows.map(toView));
  } catch (e) { return errorResponse(e, "Falha ao carregar candidatos"); }
}
