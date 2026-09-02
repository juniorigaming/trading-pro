import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { serializeTrade, TradeInput } from "@/lib/trade-utils";
import { mapTradeValues } from "@/lib/trade-mapper";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// FIX 1102: Evita retornar screenshots base64 gigantes na listagem
// Isso causava 1102 porque cada trade tinha até 4MB de base64 e o Worker estourava memória
const LIST_COLUMNS = {
  id: trades.id,
  createdAt: trades.createdAt,
  date: trades.date,
  time: trades.time,
  asset: trades.asset,
  direction: trades.direction,
  session: trades.session,
  timeframeEntry: trades.timeframeEntry,
  timeframeContext: trades.timeframeContext,
  setup: trades.setup,
  entryPrice: trades.entryPrice,
  stopLoss: trades.stopLoss,
  takeProfit: trades.takeProfit,
  positionSize: trades.positionSize,
  riskAmount: trades.riskAmount,
  riskPercent: trades.riskPercent,
  resultAmount: trades.resultAmount,
  resultR: trades.resultR,
  resultType: trades.resultType,
  resultPercent: trades.resultPercent,
  plannedRR: trades.plannedRR,
  isDemo: trades.isDemo,
  followedPlan: trades.followedPlan,
  setupScore: trades.setupScore,
  executionScore: trades.executionScore,
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    // Paginação para evitar 1102 - limite máximo 200
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // FIX: Seleciona apenas colunas leves, sem screenshotUrl, notes, mistakes etc
    // Antes: .select().from(trades) retornava TUDO incluindo base64 de 4MB por trade
    const rows = await getDb()
      .select(LIST_COLUMNS)
      .from(trades)
      .where(eq(trades.isDemo, false))
      .orderBy(desc(trades.date), desc(trades.time))
      .limit(limit)
      .offset(offset);

    return Response.json(rows.map(serializeTrade), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/trades] Error:", error);
    return Response.json({ error: "Failed to load trades", details: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TradeInput;

    if (!body.date || !body.asset || !body.direction) {
      return Response.json({ error: "Campos obrigatórios ausentes (data, ativo, direção)." }, { status: 400 });
    }
    if (body.riskAmount != null && body.riskAmount < 0) {
      return Response.json({ error: "Risco não pode ser negativo." }, { status: 400 });
    }

    // FIX: Limita tamanho de screenshot para evitar 1102
    // Se vier base64 > 1MB, rejeita ou trunca
    if (body.screenshotUrl && body.screenshotUrl.length > 1_200_000) {
      // ~900KB em base64 = ~ 1.2M chars
      return Response.json(
        { error: "Screenshot muito grande (max 900KB). Use imagem menor ou comprima." },
        { status: 413 }
      );
    }

    const { db: values } = mapTradeValues(body);

    const [inserted] = await getDb().insert(trades).values(values).returning();

    // FIX 1102: Deleção de demos NÃO pode ser síncrona - trava o Worker
    // Antes fazia delete de TODOS os demos após cada insert, sem limite
    // Agora faz em background com waitUntil ou ignora
    if (!body.isDemo) {
      try {
        const cf = getCloudflareContext();
        // Deleta em background para não bloquear resposta
        cf.ctx.waitUntil(
          getDb().delete(trades).where(eq(trades.isDemo, true)).then(() => {
            console.log("[POST] Demo trades cleaned in background");
          }).catch((e) => console.error("[POST] Failed to clean demos:", e))
        );
      } catch {
        // Se não tem contexto Cloudflare (dev local), deleta com limite e sem travar
        // Não await para não bloquear, ou faz com limite
        getDb().delete(trades).where(eq(trades.isDemo, true)).catch(() => {});
      }
    }

    return Response.json(serializeTrade(inserted), {
      status: 201,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    console.error("[POST /api/trades] Error:", error);
    return Response.json({ error: "Failed to create trade", details: String(error) }, { status: 500 });
  }
}
