import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeTrade, TradeInput } from "@/lib/trade-utils";
import { mapTradeValues } from "@/lib/trade-mapper";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await getDb().select().from(trades).where(eq(trades.id, Number(id))).limit(1);
  if (rows.length === 0) {
    return Response.json({ error: "Trade not found" }, { status: 404 });
  }
  return Response.json(serializeTrade(rows[0]));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as TradeInput;

    if (!body.date || !body.asset || !body.direction) {
      return Response.json({ error: "Campos obrigatórios ausentes (data, ativo, direção)." }, { status: 400 });
    }
    if (body.riskAmount != null && body.riskAmount < 0) {
      return Response.json({ error: "Risco não pode ser negativo." }, { status: 400 });
    }

    const { db: values } = mapTradeValues(body);

    const [updated] = await getDb()
      .update(trades)
      .set(values)
      .where(eq(trades.id, Number(id)))
      .returning();

    if (!updated) {
      return Response.json({ error: "Trade not found" }, { status: 404 });
    }

    return Response.json(serializeTrade(updated));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to update trade" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await getDb().delete(trades).where(eq(trades.id, Number(id)));
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to delete trade" }, { status: 500 });
  }
}
