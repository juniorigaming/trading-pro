import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeTrade, TradeInput } from "@/lib/trade-utils";
import { mapTradeValues } from "@/lib/trade-mapper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
} as const;

async function resilientUpdate(id: number, values: any) {
  let attemptValues = { ...values };
  const maxRetries = 15;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const [updated] = await getDb()
        .update(trades)
        .set(attemptValues)
        .where(eq(trades.id, id))
        .returning();
      return updated;
    } catch (e: any) {
      const msg = e.message || "";
      const match = msg.match(/column "([^"]+)" of relation "trades" does not exist/);
      const match2 = msg.match(/column "([^"]+)" does not exist/);
      const colName = match?.[1] || match2?.[1];
      
      if (colName) {
        console.warn(`[resilientUpdate] Coluna ${colName} não existe, removendo (tentativa ${i+1})`);
        delete attemptValues[colName];
        const camel = colName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        delete attemptValues[camel];
        // Remove variações
        Object.keys(attemptValues).forEach(k => {
          if (k.toLowerCase() === colName.replace(/_/g, "")) delete attemptValues[k];
        });
        continue;
      }
      throw e;
    }
  }
  throw new Error("Falha após múltiplas tentativas de atualizar");
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numericId = Number(id);
    if (isNaN(numericId)) {
      return Response.json({ error: "ID inválido" }, { status: 400, headers: NO_STORE });
    }
    const rows = await getDb().select().from(trades).where(eq(trades.id, numericId)).limit(1);
    if (rows.length === 0) {
      return Response.json({ error: "Trade not found" }, { status: 404, headers: NO_STORE });
    }
    return Response.json(serializeTrade(rows[0]), { headers: NO_STORE });
  } catch (error: any) {
    console.error(`[GET :id] Error:`, error.message);
    return Response.json({ error: "Failed to load trade", details: error.message }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numericId = Number(id);
    if (isNaN(numericId)) {
      return Response.json({ error: "ID inválido" }, { status: 400, headers: NO_STORE });
    }

    const body = (await request.json()) as TradeInput;

    if (!body.date || !body.asset || !body.direction) {
      return Response.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    if (body.screenshotUrl && body.screenshotUrl.length > 1_200_000) {
      return Response.json({ error: "Screenshot muito grande (max 900KB)" }, { status: 413, headers: NO_STORE });
    }

    const { db: values } = mapTradeValues(body);

    console.log(`[PUT ${numericId}] Tentando atualizar:`, body.asset, body.resultType);

    let updated;
    try {
      updated = await resilientUpdate(numericId, values);
    } catch (e: any) {
      console.error(`[PUT ${numericId}] resilientUpdate falhou, tentando mínimo:`, e.message);
      const minimal = {
        date: values.date,
        time: values.time,
        asset: values.asset,
        direction: values.direction,
        session: values.session,
        resultAmount: values.resultAmount,
        resultType: values.resultType,
        resultR: values.resultR,
      };
      const [minUpdated] = await getDb().update(trades).set(minimal as any).where(eq(trades.id, numericId)).returning();
      updated = minUpdated;
    }

    if (!updated) {
      return Response.json({ error: "Trade not found" }, { status: 404, headers: NO_STORE });
    }

    console.log(`[PUT ${numericId}] OK`);
    return Response.json(serializeTrade(updated), { headers: NO_STORE });
  } catch (error: any) {
    console.error(`[PUT :id] Error:`, error.message, error.stack);
    return Response.json({ error: "Failed to update trade", details: error.message }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numericId = Number(id);
    
    if (isNaN(numericId)) {
      return Response.json({ error: `ID inválido: ${id}` }, { status: 400, headers: NO_STORE });
    }

    const existing = await getDb().select({ id: trades.id }).from(trades).where(eq(trades.id, numericId)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: `Operação ${numericId} não encontrada` }, { status: 404, headers: NO_STORE });
    }

    await getDb().delete(trades).where(eq(trades.id, numericId));
    
    return Response.json({ ok: true, deletedId: numericId }, { headers: NO_STORE });
  } catch (error: any) {
    console.error(`[DELETE] Error:`, error.message);
    return Response.json({ error: "Failed to delete trade", details: String(error) }, { status: 500, headers: NO_STORE });
  }
}
