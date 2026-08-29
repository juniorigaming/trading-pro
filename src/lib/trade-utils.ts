// Helpers to compute derived trade fields and serialize DB rows for the API.

export interface TradeInput {
  date: string;
  time: string;
  asset: string;
  direction: "BUY" | "SELL";
  session: string;
  sessionTimeStart?: string;
  sessionTimeEnd?: string;
  timeframeEntry?: string;
  timeframeContext?: string;
  setup?: string;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  positionSize?: number | null;
  accountBalanceAtTrade?: number | null;
  riskPercent?: number | null;
  riskAmount?: number | null;
  resultAmount: number;
  resultType: "WIN" | "LOSS" | "BREAK EVEN";
  htfBias?: string;
  ltfBias?: string;
  liquidityType?: string;
  liquiditySwept?: string;
  bos?: boolean;
  choch?: boolean;
  fvg?: boolean;
  orderBlock?: boolean;
  breaker?: boolean;
  sweepLiquidity?: boolean;
  displacement?: boolean;
  trendConfirmation?: boolean;
  amd?: boolean;
  premiumDiscount?: string;
  macroEvent?: string;
  macroCurrency?: string;
  macroImpact?: string;
  macroBias?: string;
  followedPlan?: boolean;
  earlyEntry?: boolean;
  earlyExit?: boolean;
  revengeTrade?: boolean;
  fomo?: boolean;
  overtrading?: boolean;
  emotionalBefore?: string;
  emotionalAfter?: string;
  mistakes?: string;
  whatWentRight?: string;
  whatWentWrong?: string;
  lesson?: string;
  notes?: string;
  screenshotUrl?: string;
  isDemo?: boolean;
}

export interface ComputedTradeFields {
  riskAmount: number | null;
  plannedRR: number | null;
  realizedRR: number | null;
  resultR: number | null;
  resultPercent: number | null;
}

export function computeTradeFields(input: TradeInput): ComputedTradeFields {
  const { entryPrice, stopLoss, takeProfit, accountBalanceAtTrade, riskPercent, resultAmount } = input;

  let riskAmount = input.riskAmount ?? null;
  if ((riskAmount === null || riskAmount === undefined) && accountBalanceAtTrade && riskPercent) {
    riskAmount = (riskPercent / 100) * accountBalanceAtTrade;
  }

  let plannedRR: number | null = null;
  if (entryPrice != null && stopLoss != null && takeProfit != null) {
    const stopDistance = Math.abs(entryPrice - stopLoss);
    const tpDistance = Math.abs(takeProfit - entryPrice);
    if (stopDistance > 0) {
      plannedRR = tpDistance / stopDistance;
    }
  }

  let resultR: number | null = null;
  if (riskAmount && riskAmount > 0) {
    resultR = resultAmount / riskAmount;
  }

  const realizedRR = resultR;

  let resultPercent: number | null = null;
  if (accountBalanceAtTrade && accountBalanceAtTrade > 0) {
    resultPercent = (resultAmount / accountBalanceAtTrade) * 100;
  }

  return { riskAmount, plannedRR, realizedRR, resultR, resultPercent };
}

// Convert a DB row (decimals come back as strings from pg) into plain numbers for JSON.
export function serializeTrade(row: Record<string, unknown>) {
  const numericFields = [
    "entryPrice",
    "stopLoss",
    "takeProfit",
    "positionSize",
    "accountBalanceAtTrade",
    "riskAmount",
    "resultAmount",
  ];
  const out: Record<string, unknown> = { ...row };
  for (const field of numericFields) {
    if (out[field] !== null && out[field] !== undefined) {
      out[field] = Number(out[field]);
    }
  }
  if (out.date instanceof Date) {
    out.date = out.date.toISOString();
  }
  if (out.createdAt instanceof Date) {
    out.createdAt = out.createdAt.toISOString();
  }
  return out;
}
