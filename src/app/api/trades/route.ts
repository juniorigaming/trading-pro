import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { serializeTrade, TradeInput } from "@/lib/trade-utils";
import { mapTradeValues } from "@/lib/trade-mapper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    console.log(`[GET /api/trades] limit=${limit} offset=${offset}`);

    // Tenta query leve primeiro, se falhar (coluna não existe) tenta fallback com select *
    let rows;
    try {
      // Query otimizada - apenas colunas essenciais, sem screenshots gigantes
      rows = await getDb()
        .select({
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
        })
        .from(trades)
        .where(eq(trades.isDemo, false))
        .orderBy(desc(trades.date), desc(trades.time))
        .limit(limit)
        .offset(offset);
    } catch (e: any) {
      console.warn("[GET /api/trades] Optimized query failed, fallback to full select:", e.message);
      // Fallback: select * mas remove campos gigantes em JS
      const allRows = await getDb()
        .select()
        .from(trades)
        .where(eq(trades.isDemo, false))
        .orderBy(desc(trades.date), desc(trades.time))
        .limit(limit)
        .offset(offset);
      
      // Remove campos pesados que causam 1102
      rows = allRows.map((r: any) => {
        const { screenshotUrl, preTradeScreenshotUrl, postEntryScreenshotUrl, postExitScreenshotUrl, dxyScreenshotUrl, notes, mistakes, whatWentRight, whatWentWrong, lesson, ...light } = r;
        return light;
      });
    }

    console.log(`[GET /api/trades] Returning ${rows.length} trades`);

    return Response.json(rows.map(serializeTrade), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("[GET /api/trades] FATAL Error:", error, error.stack);
    return Response.json({ 
      error: "Failed to load trades", 
      details: error.message,
      hint: "Verifique se o banco tem a tabela trades e se DATABASE_URL/HYPERDRIVE está configurado no Cloudflare"
    }, { status: 500 });
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

    if (body.screenshotUrl && body.screenshotUrl.length > 1_200_000) {
      return Response.json(
        { error: "Screenshot muito grande (max 900KB). O sistema comprime automaticamente, mas essa imagem é grande demais. Tente uma menor." },
        { status: 413 }
      );
    }

    const { db: values } = mapTradeValues(body);

    console.log("[POST /api/trades] Inserting:", body.asset, body.direction, body.resultType);

    const [inserted] = await getDb().insert(trades).values(values).returning();

    console.log("[POST /api/trades] Inserted id:", inserted.id);

    // Limpa demos em background, sem travar
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const cf = getCloudflareContext();
      cf.ctx.waitUntil(
        getDb().delete(trades).where(eq(trades.isDemo, true)).catch((e) => console.error("[POST] Clean demos failed:", e))
      );
    } catch {
      // dev local - não faz nada bloqueante
    }

    return Response.json(serializeTrade(inserted), {
      status: 201,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error: any) {
    console.error("[POST /api/trades] Error:", error, error.stack);
    return Response.json({ error: "Failed to create trade", details: error.message }, { status: 500 });
  }
}
