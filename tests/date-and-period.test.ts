import { describe, expect, it } from "vitest";
import type { Trade } from "@/lib/types";
import { dayOrdinal, formatTradeDate, localTodayKey, shiftDayKey, tradeDayKey, weekdayIndex } from "@/lib/date";
import { comparePeriods, describeDelta } from "@/lib/period-compare";

function trade(id: number, date: string, resultAmount: number, resultType: Trade["resultType"], resultR: number): Trade {
  return {
    id,
    createdAt: `${date}T12:00:00.000Z`,
    date: `${date}T00:00:00.000Z`,
    time: "10:00",
    asset: "EURUSD",
    direction: resultAmount >= 0 ? "BUY" : "SELL",
    session: "Londres",
    resultAmount,
    resultType,
    resultR,
  };
}

describe("diário: datas de trade são dias civis, não timestamps", () => {
  it("preserva o dia ISO e não o desloca para o dia anterior no fuso local", () => {
    expect(tradeDayKey("2026-10-16T00:00:00.000Z")).toBe("2026-10-16");
    expect(formatTradeDate("2026-10-16T00:00:00.000Z")).toBe("16/10/2026");
    expect(weekdayIndex("2026-10-16")).toBe(5);
  });

  it("faz aritmética de calendário civil sem erro de horário de verão", () => {
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayOrdinal("2026-10-16") - dayOrdinal("2026-10-09")).toBe(7);
    expect(localTodayKey(new Date(2026, 9, 16, 23, 59))).toBe("2026-10-16");
  });
});

describe("comparação entre períodos consecutivos", () => {
  it("compara últimos 30 dias com os 30 dias anteriores", () => {
    const now = new Date(2026, 9, 16, 12);
    const trades = [
      trade(1, "2026-10-01", 100, "WIN", 1),
      trade(2, "2026-09-01", -50, "LOSS", -1),
      trade(3, "2026-08-01", 999, "WIN", 2),
    ];
    const comparison = comparePeriods(trades, 1000, 30, now);
    expect(comparison.comparable).toBe(true);
    expect(comparison.current.trades).toBe(1);
    expect(comparison.current.pnl).toBe(100);
    expect(comparison.previous.trades).toBe(1);
    expect(comparison.previous.pnl).toBe(-50);
  });

  it("descreve deltas com direção favorável (drawdown menor é melhor)", () => {
    expect(describeDelta(60, 50, { kind: "points" }).tone).toBe("up");
    expect(describeDelta(4, 8, { kind: "points", higherIsBetter: false }).tone).toBe("up");
    expect(describeDelta(0, 0, { kind: "percent-change" }).text).toBe("0%");
  });
});
