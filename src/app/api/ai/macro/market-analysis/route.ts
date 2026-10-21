import { z } from "zod";
import { authorize, json } from "@/lib/api-utils";
import { G8, SESSIONS, type Session } from "@/lib/ai/types";
import { runMacroAnalysis } from "@/lib/macro/pipeline";
import { macroEventsForPersistence } from "@/lib/macro/market-analysis-persistence";
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
  session: z.enum(SESSIONS).optional(),
  tzOffsetMinutes: z.number().int().min(-840).max(840).default(-180),
});

function inferSession(now = new Date()): Session {
  const hour = now.getUTCHours();
  return hour >= 22 || hour < 7 ? "ASIA" : hour < 12 ? "LONDON" : "NEW_YORK";
}

export async function POST(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;
  try {
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Payload inválido", issues: parsed.error.issues.slice(0, 8) }, 400);

    const report = await runMarketMacroAnalysis({
      supplementalEvents: parsed.data.supplementalEvents,
      excludedUnconfirmedCount: parsed.data.excludedUnconfirmedCount,
    });
    const events = macroEventsForPersistence(report.evidence, parsed.data.tzOffsetMinutes);
    let macroRefresh: NonNullable<typeof report.macroRefresh>;

    if (events.length === 0) {
      macroRefresh = {
        status: "skipped", analysisId: null, eventCount: 0,
        message: "Nenhum evento econômico confirmado disponível para atualizar o score por eventos. O último resultado permanece identificado pela própria data; não foi criado score artificial.",
      };
    } else {
      try {
        const saved = await runMacroAnalysis({
          session: parsed.data.session ?? inferSession(),
          events,
          inputType: "structured",
          imagesCount: 0,
          tzOffsetMinutes: 0,
          withBrief: false,
        });
        const insufficient = saved.analysis_status === "ANALISE_INSUFICIENTE"
          ? " A evidência não passou os critérios para um ranking confiável; moedas sem dado continuam sem score."
          : "";
        macroRefresh = {
          status: "updated", analysisId: saved.analysis_id, date: saved.date, session: saved.session,
          eventCount: events.length,
          message: `Score macro por eventos, candidatos, risco e histórico atualizados na análise #${saved.analysis_id}.${insufficient} Força de preço D1/W1 continua separada.`,
        };
      } catch (error) {
        console.error("[api] Falha ao persistir a atualização macro após a análise de mercado", error);
        macroRefresh = {
          status: "failed", analysisId: null, eventCount: events.length,
          message: "A leitura de força de preço foi concluída, mas não foi possível salvar a atualização do score por eventos. O último resultado continua disponível com sua data.",
        };
      }
    }

    return json({
      ...report,
      macroRefresh,
      warnings: [...report.warnings, macroRefresh.message],
    });
  } catch (error) {
    console.error("[api] Falha ao executar a análise macro de mercado", error);
    return json({ error: "Não foi possível carregar o resumo agora. Tente novamente." }, 502);
  }
}

export async function GET() {
  return json({ ok: true, route: "ai/macro/market-analysis", method: "POST JSON" });
}
