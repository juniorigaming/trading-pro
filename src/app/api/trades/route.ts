import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { serializeTrade, TradeInput } from "@/lib/trade-utils";
import { mapTradeValues } from "@/lib/trade-mapper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Query ultra-leve e rápida - sem fallback lento
    // Se der erro de coluna, o catch vai mostrar qual coluna falta
    const rows = await getDb()
      .select({
        id: trades.id,
        createdAt: trades.createdAt,
        date: trades.date,
        time: trades.time,
        asset: trades.asset,
        direction: trades.direction,
        session: trades.session,
        timeframeEntry: trades.timeframeEntry,
        setup: trades.setup,
        resultAmount: trades.resultAmount,
        resultR: trades.resultR,
        resultType: trades.resultType,
        isDemo: trades.isDemo,
      })
      .from(trades)
      .where(eq(trades.isDemo, false))
      .orderBy(desc(trades.date))
      .limit(limit)
      .offset(offset);

    const duration = Date.now() - start;
    console.log(`[GET /api/trades] OK ${rows.length} rows in ${duration}ms`);

    return Response.json(rows.map(serializeTrade), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Server-Timing": `db;dur=${duration}`,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - start;
    console.error(`[GET /api/trades] FAIL in ${duration}ms:`, error.message);
    return Response.json({ 
      error: "Failed to load trades", 
      details: error.message,
      duration
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TradeInput;

    if (!body.date || !body.asset || !body.direction) {
      return Response.json({ error: "Campos obrigatórios ausentes (data, ativo, direção)." }, { status: 400 });
    }

    if (body.screenshotUrl && body.screenshotUrl.length > 1_200_000) {
      return Response.json({ error: "Screenshot muito grande (max 900KB)" }, { status: 413 });
    }

    const { db: values } = mapTradeValues(body);
    const [inserted] = await getDb().insert(trades).values(values).returning();

    return Response.json(serializeTrade(inserted), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("[POST /api/trades] Error:", error.message);
    return Response.json({ error: "Failed to create trade", details: error.message }, { status: 500 });
  }
}
