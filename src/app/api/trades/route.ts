import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { serializeTrade, TradeInput } from "@/lib/trade-utils";
import { mapTradeValues } from "@/lib/trade-mapper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function resilientInsert(values: any) {
  let attemptValues = { ...values };
  const maxRetries = 10;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const [inserted] = await getDb().insert(trades).values(attemptValues).returning();
      return inserted;
    } catch (e: any) {
      const msg = e.message || "";
      const match = msg.match(/column "([^"]+)" of relation "trades" does not exist/);
      const match2 = msg.match(/column "([^"]+)" does not exist/);
      const colName = match?.[1] || match2?.[1];
      
      if (colName) {
        console.warn(`[resilientInsert] Coluna ${colName} não existe, removendo e tentando de novo (tentativa ${i+1})`);
        const camel = colName.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
        delete attemptValues[colName];
        delete attemptValues[camel];
        const keys = Object.keys(attemptValues);
        for (const k of keys) {
          if (k.toLowerCase() === colName || k.toLowerCase() === colName.replace(/_/g, "")) {
            delete attemptValues[k];
          }
        }
        continue;
      }
      throw e;
    }
  }
  throw new Error("Falha após múltiplas tentativas de inserir - verifique schema");
}

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let db;
    try {
      db = getDb();
    } catch (dbError: any) {
      return Response.json([], {
        headers: { "Cache-Control": "no-store", "X-DB-Error": dbError.message },
      });
    }

    let rows: any[] = [];
    
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
    } catch (e1: any) {
      console.warn(`[GET] Minimal query failed: ${e1.message}, fallback SELECT *`);
      try {
        const allRows = await db.select().from(trades).where(eq(trades.isDemo, false)).orderBy(desc(trades.date)).limit(limit).offset(offset);
        rows = allRows.map((r: any) => {
          const { screenshotUrl, preTradeScreenshotUrl, postEntryScreenshotUrl, postExitScreenshotUrl, dxyScreenshotUrl, ...rest } = r;
          return rest;
        });
      } catch (e2: any) {
        console.error(`[GET] All queries failed: ${e2.message}, returning empty`);
        rows = [];
      }
    }

    return Response.json(rows.map(serializeTrade), {
      headers: {
        "Cache-Control": "no-store",
        "X-Query-Time": `${Date.now() - start}ms`,
      },
    });
  } catch (error: any) {
    console.error(`[GET] FATAL:`, error.message);
    return Response.json([], {
      headers: { "Cache-Control": "no-store", "X-Error": error.message },
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
    
    let inserted;
    try {
      inserted = await resilientInsert(values);
    } catch (e: any) {
      console.error("[POST] resilientInsert falhou, tentando insert mínimo:", e.message);
      const minimal = {
        date: values.date,
        time: values.time,
        asset: values.asset,
        direction: values.direction,
        session: values.session,
        resultAmount: values.resultAmount,
        resultType: values.resultType,
      };
      const [minInserted] = await getDb().insert(trades).values(minimal as any).returning();
      inserted = minInserted;
    }

    return Response.json(serializeTrade(inserted), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("[POST] Error:", error.message, error.stack);
    return Response.json({ error: "Failed to create trade", details: error.message }, { status: 500 });
  }
}
