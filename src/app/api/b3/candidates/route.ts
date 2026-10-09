import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { b3TradeCandidates } from "@/db/schema";
import { errorResponse, json } from "@/lib/api-utils";
import type { B3Candidate } from "@/lib/b3/types";
export const dynamic = "force-dynamic";
/** GET → candidatos B3 do último cálculo, no formato B3Candidate (snake_case). */
export async function GET() {
  try {
    const db = getDb();
    const last = await db.select({ computedAt: b3TradeCandidates.computedAt }).from(b3TradeCandidates).orderBy(desc(b3TradeCandidates.computedAt)).limit(1);
    if (!last[0]) return json([]);
    const rows = await db.select().from(b3TradeCandidates).where(eq(b3TradeCandidates.computedAt, last[0].computedAt)).orderBy(b3TradeCandidates.priority);
    const out: (B3Candidate & { id: number; computed_at: string; session: string })[] = rows.map((r) => ({
      id: r.id, computed_at: r.computedAt.toISOString(), session: r.session, instrument: r.instrument as B3Candidate["instrument"], bias: r.bias as "LONG" | "SHORT", score: Number(r.score), usd_score: r.usdScore, brl_score: r.brlScore,
      regime: (r.regime ?? "MIXED") as B3Candidate["regime"], confidence: r.confidence as B3Candidate["confidence"], priority: r.priority, event_risk: r.eventRisk as B3Candidate["event_risk"], event_risk_events: (r.eventRiskEvents as B3Candidate["event_risk_events"]) ?? [], reason: r.reason ?? "",
    }));
    return json(out);
  } catch (e) { return errorResponse(e, "Falha ao carregar candidatos B3"); }
}
