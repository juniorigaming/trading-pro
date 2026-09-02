import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeTrade, TradeInput } from "@/lib/trade-utils";
import { mapTradeValues } from "@/lib/trade-mapper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
} as const;

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
  } catch (error) {
    console.error(`[GET /api/trades/:id] Error:`, error);
    return Response.json({ error: "Failed to load trade" }, { status: 500, headers: NO_STORE });
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
      return Response.json({ error: "Campos obrigatórios ausentes (data, ativo, direção)." }, { status: 400 });
    }
    if (body.riskAmount != null && body.riskAmount < 0) {
      return Response.json({ error: "Risco não pode ser negativo." }, { status: 400 });
    }

    if (body.screenshotUrl && body.screenshotUrl.length > 1_200_000) {
      return Response.json(
        { error: "Screenshot muito grande (max 900KB). Use imagem menor." },
        { status: 413, headers: NO_STORE }
      );
    }

    const { db: values } = mapTradeValues(body);

    const [updated] = await getDb()
      .update(trades)
      .set(values)
      .where(eq(trades.id, numericId))
      .returning();

    if (!updated) {
      return Response.json({ error: "Trade not found" }, { status: 404, headers: NO_STORE });
    }

    return Response.json(serializeTrade(updated), { headers: NO_STORE });
  } catch (error) {
    console.error(`[PUT /api/trades/:id] Error:`, error);
    return Response.json({ error: "Failed to update trade" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numericId = Number(id);
    
    console.log(`[DELETE] Tentando excluir id: ${id} -> ${numericId}`);
    
    if (isNaN(numericId)) {
      return Response.json({ error: `ID inválido: ${id}` }, { status: 400, headers: NO_STORE });
    }

    // Verifica se existe antes
    const existing = await getDb().select({ id: trades.id }).from(trades).where(eq(trades.id, numericId)).limit(1);
    if (existing.length === 0) {
      console.warn(`[DELETE] Trade ${numericId} não encontrado`);
      return Response.json({ error: `Operação ${numericId} não encontrada` }, { status: 404, headers: NO_STORE });
    }

    await getDb().delete(trades).where(eq(trades.id, numericId));
    
    console.log(`[DELETE] Trade ${numericId} excluído com sucesso`);
    
    return Response.json({ ok: true, deletedId: numericId }, { headers: NO_STORE });
  } catch (error) {
    console.error(`[DELETE /api/trades/:id] Error:`, error);
    return Response.json({ error: "Failed to delete trade", details: String(error) }, { status: 500, headers: NO_STORE });
  }
}
