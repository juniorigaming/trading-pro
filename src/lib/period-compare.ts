/**
 * Comparação "período atual vs período anterior" para os cards do Dashboard.
 * Ex.: últimos 30 dias vs os 30 dias imediatamente anteriores.
 */
import type { Trade } from "./types";
import { calculateMetrics } from "./calculations";
import { dayOrdinal, localTodayKey, tradeDayKey } from "./date";

export interface PeriodSnapshot {
  trades: number;
  pnl: number;
  expectancy: number;
  winRate: number;
  maxDrawdown: number;
}

export interface PeriodComparison {
  days: number;
  current: PeriodSnapshot;
  previous: PeriodSnapshot;
  /** false quando o período anterior não tem operações (não há com o que comparar) */
  comparable: boolean;
}

function snapshot(trades: Trade[], initialCapital: number): PeriodSnapshot {
  const m = calculateMetrics(trades, initialCapital);
  return { trades: m.totalTrades, pnl: m.netResult, expectancy: m.expectancy, winRate: m.winRate, maxDrawdown: m.maxDrawdown };
}

export function comparePeriods(trades: Trade[], initialCapital: number, days = 30, now: Date = new Date()): PeriodComparison {
  const today = localTodayKey(now);
  const end = dayOrdinal(today);
  const start = end - Math.max(1, days) + 1;
  const prevStart = start - Math.max(1, days);
  const cur: Trade[] = [];
  const prev: Trade[] = [];
  for (const t of trades) {
    const ordinal = dayOrdinal(tradeDayKey(t.date));
    if (!Number.isFinite(ordinal)) continue;
    if (ordinal >= start && ordinal <= end) cur.push(t);
    else if (ordinal >= prevStart && ordinal < start) prev.push(t);
  }
  return { days, current: snapshot(cur, initialCapital), previous: snapshot(prev, initialCapital), comparable: prev.length > 0 };
}

export type DeltaTone = "up" | "down" | "flat";

export interface DeltaInfo { text: string; tone: DeltaTone }

/**
 * Texto curto do delta ("+12,5%", "+R$ 120", "−3 pts").
 * `higherIsBetter=false` para drawdown (cair é bom).
 */
export function describeDelta(current: number, previous: number, opts: { kind: "percent-change" | "points" | "absolute"; unit?: string; higherIsBetter?: boolean; decimals?: number } ): DeltaInfo {
  const higherIsBetter = opts.higherIsBetter ?? true;
  const decimals = opts.decimals ?? 1;
  const diff = current - previous;
  const eps = 1e-9;
  let text: string;
  if (opts.kind === "percent-change") {
    if (Math.abs(previous) < eps) text = Math.abs(diff) < eps ? "0%" : "novo";
    else {
      const pct = (diff / Math.abs(previous)) * 100;
      text = `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(decimals)}%`;
    }
  } else if (opts.kind === "points") {
    text = `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(decimals)} pts`;
  } else {
    text = `${diff >= 0 ? "+" : "−"}${opts.unit ?? ""}${Math.abs(diff).toLocaleString("pt-BR", { maximumFractionDigits: decimals })}`;
  }
  const tone: DeltaTone = Math.abs(diff) < eps ? "flat" : (diff > 0) === higherIsBetter ? "up" : "down";
  return { text, tone };
}
