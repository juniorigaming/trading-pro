import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tradeCandidates } from "@/db/schema";
import { errorResponse, json } from "@/lib/api-utils";
export const dynamic = "force-dynamic";
/** GET → candidatos do último cálculo (mesmo computed_at) */
export async function GET() {
  try {
    const db = getDb();
    const last = await db.select({ computedAt: tradeCandidates.computedAt }).from(tradeCandidates).orderBy(desc(tradeCandidates.computedAt)).limit(1);
    if (!last[0]) return json([]);
    const rows = await db.select().from(tradeCandidates).where(eq(tradeCandidates.computedAt, last[0].computedAt)).orderBy(tradeCandidates.priority);
    return json(rows);
  } catch (e) { return errorResponse(e, "Falha ao carregar candidatos"); }
}
