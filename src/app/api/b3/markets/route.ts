import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { marketSnapshots } from "@/db/schema";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { MarketsBody } from "@/lib/b3/schema";
import { loadB3Config, loadLatestMarkets, saveMarketSnapshots } from "@/lib/b3/pipeline";
export const dynamic = "force-dynamic";
/** GET ?latest=1 → última leitura por símbolo | lista. POST {rows[]} → salva leituras validadas. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("latest")) { const cfg = await loadB3Config(); return json(await loadLatestMarkets(new Date(), cfg)); }
    const rows = await getDb().select().from(marketSnapshots).orderBy(desc(marketSnapshots.capturedAt)).limit(Math.min(Number(url.searchParams.get("limit") ?? 60), 300));
    return json(rows.map((r) => ({ id: r.id, symbol: r.symbol, value: r.value, change_pct: r.changePct, change_bp: r.changeBp, captured_at: r.capturedAt, source: r.source, requires_manual_confirmation: r.requiresManualConfirmation })));
  } catch (e) { return errorResponse(e, "Falha ao carregar leituras de mercado"); }
}
export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const parsed = MarketsBody.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Payload inválido", issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
    const cfg = await loadB3Config();
    const saved = await saveMarketSnapshots(parsed.data.rows, null, cfg);
    return json({ saved }, 201);
  } catch (e) { return errorResponse(e, "Falha ao salvar leituras"); }
}
