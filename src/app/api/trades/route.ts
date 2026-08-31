import { db } from "@/db";
import { trades } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { serializeTrade, TradeInput } from "@/lib/trade-utils";
import { mapTradeValues } from "@/lib/trade-mapper";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(trades).orderBy(desc(trades.date), desc(trades.time));
    return Response.json(rows.map(serializeTrade));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to load trades" }, { status: 500 });
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

    const { db: values } = mapTradeValues(body);

    const [inserted] = await db.insert(trades).values(values).returning();

    // Quando o usuário registra uma operação real (não demo), remove os dados
    // de demonstração para que eles não continuem aparecendo no jornal junto
    // com as operações reais.
    if (!body.isDemo) {
      await db.delete(trades).where(eq(trades.isDemo, true));
    }

    return Response.json(serializeTrade(inserted), { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to create trade" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const demoOnly = searchParams.get("demo") === "true";
    if (demoOnly) {
      await db.delete(trades).where(eq(trades.isDemo, true));
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Missing filter" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to delete trades" }, { status: 500 });
  }
}
