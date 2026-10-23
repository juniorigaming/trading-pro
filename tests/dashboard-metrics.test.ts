import { describe, expect, it } from "vitest";
import { buildCalendarData, calculateMetrics, disciplineStats, groupByAsset, rDistribution } from "@/lib/calculations";
import type { Trade } from "@/lib/types";
import { getMarketSymbolDescriptor, marketSymbolLabel } from "@/components/MarketSymbol";

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    createdAt: "2026-10-22T12:00:00.000Z",
    date: "2026-10-22T00:00:00.000Z",
    time: "09:00",
    asset: "EURUSD",
    direction: "BUY",
    session: "LONDON",
    resultType: "WIN",
    resultAmount: 100,
    ...overrides,
  };
}

describe("dashboard metrics and market symbols", () => {
  it("keeps R unavailable when no trade has defined risk", () => {
    const sample = [trade()];
    expect(calculateMetrics(sample, 1_000)).toMatchObject({ avgR: null, avgWinR: null, avgLossR: null, rTrades: 0 });
    expect(rDistribution(sample)).toMatchObject({ avg: null, median: null, min: null, max: null, total: null, count: 0 });
    expect(groupByAsset(sample)[0]).toMatchObject({ avgR: null, rTrades: 0 });
    expect(buildCalendarData(sample).get("2026-10-22")).toMatchObject({ resultR: null, rTrades: 0 });
  });

  it("computes drawdown and current streak chronologically even when the list is newest-first", () => {
    const newestFirst = [
      trade({ id: 2, date: "2026-10-23T00:00:00.000Z", resultType: "LOSS", resultAmount: -200 }),
      trade({ id: 1, date: "2026-10-22T00:00:00.000Z", resultType: "WIN", resultAmount: 100 }),
    ];
    const metrics = calculateMetrics(newestFirst, 1_000);
    expect(metrics.maxDrawdown).toBeCloseTo((200 / 1_100) * 100);
    expect(metrics.currentDrawdown).toBeCloseTo((200 / 1_100) * 100);
    expect(metrics.currentLossSequence).toBe(1);
    expect(metrics.currentWinSequence).toBe(0);
  });

  it("counts only explicit plan evaluations in adherence percentages", () => {
    const stats = disciplineStats([
      trade({ followedPlan: true }),
      trade({ id: 2, followedPlan: false }),
      trade({ id: 3, followedPlan: null }),
      trade({ id: 4, followedPlan: undefined }),
    ]);
    expect(stats).toMatchObject({ total: 4, evaluated: 2, unassessed: 2, followedPlan: 1, notFollowedPlan: 1, followedPercent: 50, notFollowedPercent: 50 });
  });

  it("returns local, image-free symbols for FX, metals and crypto", () => {
    expect(getMarketSymbolDescriptor("EURUSD")).toMatchObject({ kind: "pair", base: "EUR", quote: "USD" });
    expect(getMarketSymbolDescriptor("XAUUSD")).toMatchObject({ kind: "mark", glyph: "Au", label: "Ouro" });
    expect(getMarketSymbolDescriptor("BTCUSDT")).toMatchObject({ kind: "mark", glyph: "₿", label: "BTC" });
    expect(marketSymbolLabel("EURUSD")).toContain("EURUSD");
  });
});
