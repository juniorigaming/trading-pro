import { Trade } from "./types";

export interface SetupScoreDetail {
  score: number;
  grade: string;
  breakdown: { label: string; points: number; max: number; ok: boolean }[];
}

export function setupScore(trade: Trade | null | undefined, riskThreshold = 2): SetupScoreDetail | null {
  if (!trade) return null;
  const breakdown: { label: string; points: number; max: number; ok: boolean }[] = [];

  const add = (label: string, ok: boolean, max: number) =>
    breakdown.push({ label, points: ok ? max : 0, max, ok });

  // MACRO (20)
  add("Macro alinhado", !!trade.macroBias && trade.macroBias !== "Neutro", 10);
  add("DXY/Yields confirmam", !!trade.dxyConfirmation && trade.dxyConfirmation !== "NO" || !!trade.dxyBias, 5);
  add("Macro contexto registrado", !!trade.macroEvent || !!trade.macroBias, 5);

  // CONTEXTO HTF (25)
  add("Bias HTF definido", !!trade.htfBias, 10);
  add("Premium/Discount correto", !!trade.premiumDiscount, 5);
  add("Draw on Liquidity definido", !!trade.drawOnLiquidity, 5);
  add("POI válido", !!trade.poi || !!trade.entryZone, 5);

  // LIQUIDEZ (20)
  add("Liquidez identificada", !!trade.liquidityType, 5);
  add("Sweep confirmado", !!trade.sweepLiquidity || trade.liquiditySwept === "Sim" || trade.liquiditySwept === "Parcial", 10);
  add("Sessão capturou liquidez relevante", !!trade.liquiditySwept && trade.liquiditySwept !== "Não", 5);

  // EXECUÇÃO (25)
  add("Displacement", !!trade.displacement, 7);
  add("CHoCH / MSS", !!trade.choch, 8);
  add("FVG / OB do displacement", !!trade.fvg || !!trade.orderBlock, 5);
  add("Confirmação de tendência", !!trade.trendConfirmation, 5);

  // RISCO (10)
  const rrOk = (trade.plannedRR || 0) >= riskThreshold;
  add("R:R mínimo atingido", rrOk, 5);
  add("Risco dentro do plano", !(trade.riskPercent && trade.riskPercent > 5), 5);

  const score = Math.min(100, breakdown.reduce((s, b) => s + b.points, 0));
  const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : "NÃO RECOMENDADO";
  return { score, grade, breakdown };
}

export interface ExecutionScoreDetail {
  score: number;
  classification: "Excelente" | "Boa" | "Regular" | "Ruim";
  breakdown: { label: string; points: number; max: number }[];
}

export function executionScore(trade: Trade | null | undefined): ExecutionScoreDetail | null {
  if (!trade) return null;
  const items: { label: string; points: number; max: number }[] = [];

  const add = (label: string, ok: boolean, max: number) => items.push({ label, points: ok ? max : 0, max });

  add("Seguiu o plano", trade.followedPlan !== false, 14);
  add("Risco correto", !trade.increasedRisk, 12);
  add("Esperou confirmação", !trade.earlyEntry, 12);
  add("Não antecipou entrada", !trade.earlyEntry, 11);
  add("Não moveu SL indevidamente", !trade.movedStopWithoutRule, 11);
  add("Não fez revenge", !trade.revengeTrade, 10);
  add("Não fez FOMO", !trade.fomo, 10);
  add("Não fez overtrade", !trade.overtrading, 10);
  add("Gestão coerente", !trade.earlyExit, 5);
  add("Saída coerente", !!trade.exitReason || !trade.earlyExit, 5);

  const score = Math.min(100, items.reduce((s, b) => s + b.points, 0));
  const classification = score >= 85 ? "Excelente" : score >= 70 ? "Boa" : score >= 55 ? "Regular" : "Ruim";
  return { score, classification, breakdown: items };
}

export function captureEfficiency(trade: Trade): number | null {
  const rr = trade.resultR ?? 0;
  const mfeR = trade.mfeAmount != null && trade.riskAmount ? trade.mfeAmount / trade.riskAmount : null;
  if (mfeR == null || mfeR === 0) return null;
  return (rr / mfeR) * 100;
}
