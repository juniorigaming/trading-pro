/** POST JSON {session, events?, diCurve?, markets?, withBrief?} → B3AnalysisResult (WIN/DOL/USD/BRL, regime, event risk, candidatos, alertas). */
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { ensureAIAudit } from "@/lib/ai/audit";
import { B3AnalyzeBody } from "@/lib/b3/schema";
import { runB3Analysis } from "@/lib/b3/pipeline";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    ensureAIAudit();
    const parsed = B3AnalyzeBody.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Payload inválido", issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
    const b = parsed.data;
    const result = await runB3Analysis({ session: b.session, events: b.events, diCurve: b.diCurve ?? null, markets: b.markets ?? null, inputType: b.inputType, imagesCount: b.imagesCount, tzOffsetMinutes: b.tzOffsetMinutes, userEdits: b.userEdits ?? null, withBrief: b.withBrief, persist: b.persist });
    return json(result);
  } catch (e) { return errorResponse(e, "Falha na análise B3"); }
}
export async function GET() { return json({ ok: true, route: "ai/b3/analyze", method: "POST JSON" }); }
