import { db } from "@/db";
import { macroCards, dailyBias } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cards = await db.select().from(macroCards);
    const biases = await db.select().from(dailyBias).orderBy(dailyBias.date);
    return Response.json({ cards, biases });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to load macro data" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (body.type === "card") {
      const c = body.data;
      const existing = await db.select().from(macroCards).where(eq(macroCards.currency, c.currency)).limit(1);
      if (existing.length === 0) {
        await db.insert(macroCards).values({ ...c, updatedAt: new Date() });
      } else {
        await db.update(macroCards).set({ ...c, updatedAt: new Date() }).where(eq(macroCards.currency, c.currency));
      }
      return Response.json({ ok: true });
    }
    if (body.type === "daily") {
      const d = body.data;
      await db.insert(dailyBias).values({ ...d });
      return Response.json({ ok: true }, { status: 201 });
    }
    return Response.json({ error: "Unknown type" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to save macro data" }, { status: 500 });
  }
}
