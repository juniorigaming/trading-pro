import { db } from "@/db";
import { trades } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const demoTrades = [
  {
    date: "2026-07-01", time: "10:15", asset: "EURUSD", direction: "BUY", session: "Nova York",
    timeframeEntry: "15m", timeframeContext: "1H", setup: "FVG + OB",
    entryPrice: "1.08500", stopLoss: "1.08300", takeProfit: "1.08900", positionSize: "1.0",
    accountBalanceAtTrade: "10000", riskPercent: 2.5, riskAmount: "250", plannedRR: 2.0, realizedRR: 2.1,
    resultAmount: "420", resultR: 2.1, resultPercent: 4.2, resultType: "WIN",
    htfBias: "Bullish", ltfBias: "Bullish", liquidityType: "Fundo do dia anterior", liquiditySwept: "Sim",
    fvg: true, orderBlock: true, sweepLiquidity: true, displacement: true, trendConfirmation: true, amd: true,
    premiumDiscount: "Discount", macroEvent: "NFP", macroCurrency: "USD", macroImpact: "Alto", macroBias: "Bullish",
    followedPlan: true, emotionalBefore: "Confiante", emotionalAfter: "Satisfeito",
    whatWentRight: "Seguiu o plano perfeitamente.", notes: "Operação de alta qualidade.", isDemo: true,
  },
  {
    date: "2026-07-01", time: "11:30", asset: "GBPUSD", direction: "SELL", session: "Nova York",
    timeframeEntry: "15m", timeframeContext: "1H", setup: "OB",
    entryPrice: "1.26500", stopLoss: "1.26750", takeProfit: "1.26000", positionSize: "1.0",
    accountBalanceAtTrade: "10420", riskPercent: 2.5, riskAmount: "260", plannedRR: 2.0, realizedRR: -1.0,
    resultAmount: "-210", resultR: -1.0, resultPercent: -2.1, resultType: "LOSS",
    htfBias: "Bearish", ltfBias: "Bearish", liquidityType: "Topo de Londres", liquiditySwept: "Não",
    choch: true, orderBlock: true, breaker: true, premiumDiscount: "Premium",
    macroEvent: "CPI", macroCurrency: "USD", macroImpact: "Alto", macroBias: "Bearish",
    followedPlan: false, earlyEntry: true, emotionalBefore: "Ansioso", emotionalAfter: "Frustrado",
    whatWentWrong: "Não respeitou o stop.", notes: "Erro de disciplina.", isDemo: true,
  },
  {
    date: "2026-07-02", time: "09:45", asset: "XAUUSD", direction: "BUY", session: "Londres",
    timeframeEntry: "15m", timeframeContext: "4H", setup: "FVG + OB",
    entryPrice: "2330.50", stopLoss: "2325.00", takeProfit: "2345.00", positionSize: "0.5",
    accountBalanceAtTrade: "10210", riskPercent: 2.5, riskAmount: "255", plannedRR: 3.0, realizedRR: 3.2,
    resultAmount: "680", resultR: 3.2, resultPercent: 5.3, resultType: "WIN",
    htfBias: "Bullish", ltfBias: "Bullish", liquidityType: "Fundo da Ásia", liquiditySwept: "Sim",
    bos: true, fvg: true, orderBlock: true, sweepLiquidity: true, displacement: true, trendConfirmation: true, amd: true,
    premiumDiscount: "Discount", macroEvent: "GDP", macroCurrency: "USD", macroImpact: "Médio", macroBias: "Bullish",
    followedPlan: true, emotionalBefore: "Confiante", emotionalAfter: "Satisfeito",
    whatWentRight: "Liquidez confirmada.", notes: "Excelente operação.", isDemo: true,
  },
  {
    date: "2026-07-03", time: "10:00", asset: "EURUSD", direction: "BUY", session: "Nova York",
    timeframeEntry: "15m", timeframeContext: "1H", setup: "FVG + OB",
    entryPrice: "1.08600", stopLoss: "1.08400", takeProfit: "1.09000", positionSize: "1.0",
    accountBalanceAtTrade: "10850", riskPercent: 2.5, riskAmount: "271", plannedRR: 3.0, realizedRR: 0,
    resultAmount: "0", resultR: 0, resultPercent: 0, resultType: "BREAK EVEN",
    htfBias: "Bullish", ltfBias: "Bullish", liquidityType: "Fundo de Londres", liquiditySwept: "Sim",
    fvg: true, orderBlock: true, trendConfirmation: true, amd: true, premiumDiscount: "Premium",
    macroImpact: "Baixo", macroBias: "Neutro", followedPlan: true,
    emotionalBefore: "Neutro", emotionalAfter: "Neutro", notes: "Break even.", isDemo: true,
  },
  {
    date: "2026-07-05", time: "14:00", asset: "BTCUSD", direction: "SELL", session: "Nova York",
    timeframeEntry: "5m", timeframeContext: "15m", setup: "FVG",
    entryPrice: "67200", stopLoss: "67900", takeProfit: "65500", positionSize: "0.02",
    accountBalanceAtTrade: "10980", riskPercent: 2.5, riskAmount: "275", plannedRR: 2.8, realizedRR: -1.5,
    resultAmount: "-150", resultR: -0.75, resultPercent: -1.5, resultType: "LOSS",
    htfBias: "Bearish", ltfBias: "Neutro", liquidityType: "Topo do dia anterior", liquiditySwept: "Parcial",
    choch: true, overtrading: true, premiumDiscount: "Premium",
    macroEvent: "Interest Rate", macroCurrency: "USD", macroImpact: "Alto", macroBias: "Bearish",
    followedPlan: false, earlyExit: true, fomo: true, emotionalBefore: "Eufórico", emotionalAfter: "Ansioso",
    whatWentWrong: "Não respeitou o stop.", lesson: "Evitar euforia antes de operar.", notes: "Operação emocional.", isDemo: true,
  },
] as const;

export async function POST() {
  try {
    const values = demoTrades.map((t) => ({
      ...t,
      date: new Date(t.date),
    }));
    await db.insert(trades).values(values as never);
    return Response.json({ ok: true, inserted: values.length });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to seed demo trades" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await db.delete(trades).where(eq(trades.isDemo, true));
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to remove demo trades" }, { status: 500 });
  }
}
