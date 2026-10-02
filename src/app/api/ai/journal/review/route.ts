/** POST { trade_id } → revisão de processo pela IA (independente do resultado). */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tradeJournal } from "@/db/schema";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { ensureAIAudit } from "@/lib/ai/audit";
import { generateStructured } from "@/lib/ai/service";
import { TRADE_REVIEW } from "@/lib/ai/prompts";
import { getJournalEntry } from "@/lib/journal/service";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    ensureAIAudit();
    const { trade_id } = (await request.json()) as { trade_id?: number };
    if (!trade_id) return json({ error: "trade_id obrigatório" }, 400);
    const entry = await getJournalEntry(trade_id);
    if (!entry) return json({ error: "Trade não encontrado" }, 404);
    const images = entry.screenshots.slice(0, 2).map((s) => { const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(s.data_url); return m ? { mime: m[1] as "image/png" | "image/jpeg" | "image/webp", base64: m[2], label: s.kind } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
    const { screenshots: _s, ...payload } = entry; void _s;
    const res = await generateStructured({ purpose: "trade_review", prompt: TRADE_REVIEW, schemaName: "trade_review", images, user: JSON.stringify(payload) });
    await getDb().update(tradeJournal).set({ aiReviewJson: { ...res.data, model: res.model, prompt_version: res.promptVersion, reviewed_at: new Date().toISOString() } }).where(eq(tradeJournal.tradeId, trade_id));
    return json({ review: res.data, meta: { model: res.model, prompt_version: res.promptVersion } });
  } catch (e) { return errorResponse(e, "Falha na revisão do trade"); }
}
