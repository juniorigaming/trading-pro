import { db } from "@/db";
import { trades } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeTradeFields, serializeTrade, TradeInput } from "@/lib/trade-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(trades).where(eq(trades.id, Number(id))).limit(1);
  if (rows.length === 0) {
    return Response.json({ error: "Trade not found" }, { status: 404 });
  }
  return Response.json(serializeTrade(rows[0]));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as TradeInput;

    if (!body.date || !body.asset || !body.direction || !body.resultType) {
      return Response.json({ error: "Campos obrigatórios ausentes (data, ativo, direção, resultado)." }, { status: 400 });
    }
    if (body.riskAmount != null && body.riskAmount < 0) {
      return Response.json({ error: "Risco não pode ser negativo." }, { status: 400 });
    }

    const computed = computeTradeFields(body);

    const [updated] = await db
      .update(trades)
      .set({
        date: new Date(body.date),
        time: body.time || "00:00",
        asset: body.asset,
        direction: body.direction,
        session: body.session || "Outro",
        sessionTimeStart: body.sessionTimeStart,
        sessionTimeEnd: body.sessionTimeEnd,
        timeframeEntry: body.timeframeEntry,
        timeframeContext: body.timeframeContext,
        setup: body.setup,
        entryPrice: body.entryPrice != null ? String(body.entryPrice) : null,
        stopLoss: body.stopLoss != null ? String(body.stopLoss) : null,
        takeProfit: body.takeProfit != null ? String(body.takeProfit) : null,
        positionSize: body.positionSize != null ? String(body.positionSize) : null,
        accountBalanceAtTrade: body.accountBalanceAtTrade != null ? String(body.accountBalanceAtTrade) : null,
        riskPercent: body.riskPercent ?? null,
        riskAmount: computed.riskAmount != null ? String(computed.riskAmount) : null,
        plannedRR: computed.plannedRR,
        realizedRR: computed.realizedRR,
        resultAmount: String(body.resultAmount ?? 0),
        resultR: computed.resultR,
        resultPercent: computed.resultPercent,
        resultType: body.resultType,
        htfBias: body.htfBias,
        ltfBias: body.ltfBias,
        liquidityType: body.liquidityType,
        liquiditySwept: body.liquiditySwept,
        bos: body.bos ?? false,
        choch: body.choch ?? false,
        fvg: body.fvg ?? false,
        orderBlock: body.orderBlock ?? false,
        breaker: body.breaker ?? false,
        sweepLiquidity: body.sweepLiquidity ?? false,
        displacement: body.displacement ?? false,
        trendConfirmation: body.trendConfirmation ?? false,
        amd: body.amd ?? false,
        premiumDiscount: body.premiumDiscount,
        macroEvent: body.macroEvent,
        macroCurrency: body.macroCurrency,
        macroImpact: body.macroImpact,
        macroBias: body.macroBias,
        followedPlan: body.followedPlan ?? true,
        earlyEntry: body.earlyEntry ?? false,
        earlyExit: body.earlyExit ?? false,
        revengeTrade: body.revengeTrade ?? false,
        fomo: body.fomo ?? false,
        overtrading: body.overtrading ?? false,
        emotionalBefore: body.emotionalBefore,
        emotionalAfter: body.emotionalAfter,
        mistakes: body.mistakes,
        whatWentRight: body.whatWentRight,
        whatWentWrong: body.whatWentWrong,
        lesson: body.lesson,
        notes: body.notes,
        screenshotUrl: body.screenshotUrl,
      })
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
    await db.delete(trades).where(eq(trades.id, Number(id)));
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to delete trade" }, { status: 500 });
  }
}
