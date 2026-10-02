/** POST JSON: { session, events[] (validados pelo usuário), inputType, imagesCount, tzOffsetMinutes, userEdits } → análise macro completa. */
import { z } from "zod";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { ensureAIAudit } from "@/lib/ai/audit";
import { runMacroAnalysis } from "@/lib/macro/pipeline";
import { G8, SESSIONS } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const EventSchema = z.object({
  date: z.string().nullable(), time: z.string().nullable(), currency: z.enum(G8), event: z.string().min(1).max(200),
  impact: z.enum(["high", "medium", "low", "holiday", "unknown"]).default("unknown"),
  actual: z.string().max(40).nullable(), forecast: z.string().max(40).nullable(), previous: z.string().max(40).nullable(),
  source: z.enum(["screenshot_ai", "calendar_api", "manual"]).default("screenshot_ai"),
  ocr_confidence: z.number().min(0).max(1).nullable().optional(), requires_manual_confirmation: z.boolean().optional(), user_edited: z.boolean().optional(),
});
const BodySchema = z.object({
  session: z.enum(SESSIONS), events: z.array(EventSchema).max(300),
  inputType: z.enum(["screenshot", "structured", "manual"]).default("screenshot"), imagesCount: z.number().int().min(0).max(20).optional(),
  tzOffsetMinutes: z.number().int().min(-840).max(840).optional(), userEdits: z.record(z.string(), z.unknown()).nullable().optional(), withBrief: z.boolean().optional(),
});

export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    ensureAIAudit();
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Payload inválido", issues: parsed.error.issues.slice(0, 5) }, 400);
    const result = await runMacroAnalysis(parsed.data);
    return json(result);
  } catch (e) { return errorResponse(e, "Falha ao executar análise macro"); }
}
