import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { diCurveSnapshots } from "@/db/schema";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { DiCurveBody } from "@/lib/b3/schema";
import { loadB3Config, loadDiContracts, loadLatestDi, saveDiSnapshot } from "@/lib/b3/pipeline";
export const dynamic = "force-dynamic";
/** GET ?latest=1 → análise da última curva | lista de snapshots. POST {contracts[], cause?, note?} → salva + analisa. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const contracts = await loadDiContracts();
    if (url.searchParams.get("latest")) { const cfg = await loadB3Config(); const r = await loadLatestDi(new Date(), cfg); return json({ latest: r, contracts }); }
    const rows = await getDb().select().from(diCurveSnapshots).orderBy(desc(diCurveSnapshots.capturedAt)).limit(Math.min(Number(url.searchParams.get("limit") ?? 30), 100));
    return json({ rows: rows.map((r) => ({ id: r.id, captured_at: r.capturedAt, source: r.source, shape: r.shape, cause: r.cause, slope_bp: r.slopeBp, short_rate: r.shortRate, long_rate: r.longRate, contracts: r.contracts, interpretation: r.interpretation })), contracts });
  } catch (e) { return errorResponse(e, "Falha ao carregar curva DI"); }
}
export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const parsed = DiCurveBody.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Payload inválido", issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
    const cfg = await loadB3Config();
    const r = await saveDiSnapshot(parsed.data.contracts, { source: parsed.data.source ?? "manual", note: parsed.data.note ?? null, cause: parsed.data.cause ?? null, cfg });
    return json(r, 201);
  } catch (e) { return errorResponse(e, "Falha ao salvar curva DI"); }
}
