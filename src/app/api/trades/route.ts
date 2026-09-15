import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { serializeTrade, TradeInput } from "@/lib/trade-utils";
import { mapTradeValues } from "@/lib/trade-mapper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    console.log(`[GET /api/trades] Starting - limit=${limit}`);

    let db;
    try {
      db = getDb();
    } catch (dbError: any) {
      console.error("[GET /api/trades] getDb() failed:", dbError.message);
      return Response.json([], {
        headers: { "Cache-Control": "no-store", "X-DB-Error": dbError.message },
      });
    }

    let rows: any[] = [];
    
    // TENTATIVA 1: Query mínima garantida (só colunas que sempre existem)
    try {
      rows = await db
        .select({
          id: trades.id,
          date: trades.date,
          time: trades.time,
          asset: trades.asset,
          direction: trades.direction,
          resultType: trades.resultType,
          resultAmount: trades.resultAmount,
          resultR: trades.resultR,
          isDemo: trades.isDemo,
        })
        .from(trades)
        .where(eq(trades.isDemo, false))
        .orderBy(desc(trades.date))
        .limit(limit)
        .offset(offset);
      
      console.log(`[GET /api/trades] Minimal query OK - ${rows.length} rows in ${Date.now() - start}ms`);
    } catch (e1: any) {
      console.warn(`[GET /api/trades] Minimal query failed: ${e1.message}, trying SELECT *`);
      
      // TENTATIVA 2: SELECT * completo (fallback)
      try {
        const allRows = await db
          .select()
          .from(trades)
          .where(eq(trades.isDemo, false))
          .orderBy(desc(trades.date))
          .limit(limit)
          .offset(offset);
        
        // Remove campos gigantes antes de retornar
        rows = allRows.map((r: any) => {
          const { screenshotUrl, preTradeScreenshotUrl, postEntryScreenshotUrl, postExitScreenshotUrl, dxyScreenshotUrl, ...rest } = r;
          return rest;
        });
        console.log(`[GET /api/trades] Fallback SELECT * OK - ${rows.length} rows`);
      } catch (e2: any) {
        console.error(`[GET /api/trades] Both queries failed. E1: ${e1.message} | E2: ${e2.message}`);
        
        // TENTATIVA 3: Query sem filtro isDemo (caso coluna is_demo não exista)
        try {
          const allRows = await db
            .select()
            .from(trades)
            .orderBy(desc(trades.date))
            .limit(limit);
          
          rows = allRows.map((r: any) => {
            const { screenshotUrl, ...rest } = r;
            return rest;
          });
          console.log(`[GET /api/trades] No-filter fallback OK - ${rows.length} rows`);
        } catch (e3: any) {
          console.error(`[GET /api/trades] All 3 attempts failed. Returning empty array. Last error: ${e3.message}`);
          // NUNCA retorna 500 - retorna array vazio pra não quebrar frontend
          rows = [];
        }
      }
    }

    return Response.json(rows.map(serializeTrade), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Query-Time": `${Date.now() - start}ms`,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - start;
    console.error(`[GET /api/trades] FATAL - Returning empty array to avoid 500. Error in ${duration}ms:`, error.message, error.stack);
    // CRÍTICO: Nunca retorna 500, sempre 200 com array vazio + header de erro
    // Isso evita "Erro 500 - Tentar novamente" no frontend
    return Response.json([], {
      headers: {
        "Cache-Control": "no-store",
        "X-Error": error.message,
        "X-Duration": `${duration}ms`,
      },
    });
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
    console.error("[POST /api/trades] Error:", error.message, error.stack);
    return Response.json({ error: "Failed to create trade", details: error.message }, { status: 500 });
  }
}
