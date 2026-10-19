/** POST JSON com eventos confirmados opcionais → leitura atual do ranking Exchange Rates UK, taxas oficiais e evidências macro somente leitura. */
import { z } from "zod";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { G8 } from "@/lib/ai/types";
import { runMarketMacroAnalysis } from "@/lib/macro/market-analysis";

export const dynamic = "force-dynamic";

const SupplementalEventSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  time: z.string().max(20).nullable(),
  currency: z.enum(G8),
  event: z.string().trim().min(1).max(200),
  impact: z.enum(["high", "medium", "low", "holiday", "unknown"]),
  actual: z.string().max(80).nullable(),
  forecast: z.string().max(80).nullable(),
  previous: z.string().max(80).nullable(),
  source: z.enum(["screenshot_ai", "calendar_api", "manual"]),
  ocrConfidence: z.number().min(0).max(1).nullable(),
  userConfirmed: z.literal(true),
});

const BodySchema = z.object({
  supplementalEvents: z.array(SupplementalEventSchema).max(100).default([]),
  excludedUnconfirmedCount: z.number().int().min(0).max(300).default(0),
});

export async function POST(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return json({ error: "Payload inválido", issues: parsed.error.issues.slice(0, 8) }, 400);
    const report = await runMarketMacroAnalysis({
      supplementalEvents: parsed.data.supplementalEvents,
      excludedUnconfirmedCount: parsed.data.excludedUnconfirmedCount,
    });
    return json(report);
  } catch (error) {
    return errorResponse(error, "Falha ao executar a análise macro de mercado");
  }
}

export async function GET() {
  return json({ ok: true, route: "ai/macro/market-analysis", method: "POST JSON" });
}
