import { z } from "zod";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { ensureAIAudit } from "@/lib/ai/audit";
import { interpretPendingEvents, loadScoringConfig, recomputeScores } from "@/lib/macro/pipeline";
import { SESSIONS } from "@/lib/ai/types";
export const dynamic = "force-dynamic";
/** POST { session, interpret?: boolean } → recalcula ranking com a config ativa (sem reprocessar imagens). */
export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    ensureAIAudit();
    const body = z.object({ session: z.enum(SESSIONS).default("LONDON"), interpret: z.boolean().default(true) }).parse(await request.json().catch(() => ({})));
    const cfg = await loadScoringConfig();
    const interp = body.interpret ? await interpretPendingEvents(cfg, null) : { interpreted: 0, warnings: [] as string[] };
    const result = await recomputeScores({ session: body.session, cfg });
    return json({ ...result, warnings: [...result.warnings, ...interp.warnings], interpreted: interp.interpreted });
  } catch (e) { return errorResponse(e, "Falha ao recalcular"); }
}
