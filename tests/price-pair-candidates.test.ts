import { describe, expect, it } from "vitest";
import { G8, type Currency } from "@/lib/ai/types";
import type { ExchangeRatesMarketSnapshot, MarketStrengthEntry } from "@/lib/macro/market-analysis-types";
import { buildPricePairCandidates } from "@/lib/macro/price-pair-candidates";

function entries(values: Record<Currency, number>): MarketStrengthEntry[] {
  return G8.map((currency, index) => ({
    currency,
    score: values[currency],
    sourceRank: index + 1,
    g8Rank: index + 1,
    wins: 5,
    losses: 2,
    flat: 1,
    comparisons: 8,
  }));
}

function snapshot(): ExchangeRatesMarketSnapshot {
  const oneDay: Record<Currency, number> = {
    GBP: 0.36, AUD: 0.33, CAD: 0.19, NZD: 0.08,
    EUR: -0.08, JPY: -0.08, CHF: -0.08, USD: -0.19,
  };
  const oneWeek: Record<Currency, number> = {
    NZD: 0.58, CAD: 0.56, GBP: 0.33, CHF: 0.27,
    AUD: -0.37, EUR: -0.58, USD: -0.8, JPY: -0.82,
  };
  return {
    status: "available",
    sourceUrl: "https://www.exchangerates.org.uk/performance-trends",
    retrievedAt: "2026-10-20T18:00:00.000Z",
    updatedAt: "2026-10-20T17:55:00.000Z",
    ageHours: 0.1,
    currentRankingAvailable: true,
    rankingMessage: "1D completo",
    weeklyRankingAvailable: true,
    weeklyRankingMessage: "1W completo",
    primaryRanking: entries(oneDay),
    weeklyRanking: entries(oneWeek),
    persistence: { fiveDay: [], monthToDate: [], yearToDate: [], notes: [] },
  };
}

describe("price-based G8 pair candidates", () => {
  it("returns conventional pairs aligned in 1D and 1W, ranked by 1D spread", () => {
    const result = buildPricePairCandidates(snapshot());
    expect(result.status).toBe("ready");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]).toMatchObject({
      symbol: "GBPUSD",
      pair: "GBP/USD",
      bias: "LONG",
      stronger: "GBP",
      weaker: "USD",
      oneDaySpread: 0.55,
    });
    expect(result.candidates[0]?.oneWeekSpread).toBeCloseTo(1.13, 8);
  });

  it("marks a short when the quote currency is the stronger one", () => {
    const market = snapshot();
    const day = Object.fromEntries(G8.map((currency) => [currency, currency === "JPY" ? 1 : currency === "EUR" ? -1 : 0])) as Record<Currency, number>;
    const week = Object.fromEntries(G8.map((currency) => [currency, currency === "JPY" ? 0.5 : currency === "EUR" ? -0.5 : 0])) as Record<Currency, number>;
    market.primaryRanking = entries(day);
    market.weeklyRanking = entries(week);
    const result = buildPricePairCandidates(market, 28);
    expect(result.candidates.find((candidate) => candidate.symbol === "EURJPY")).toMatchObject({
      pair: "EUR/JPY",
      bias: "SHORT",
      stronger: "JPY",
      weaker: "EUR",
    });
  });

  it("does not suggest pairs when 1D and 1W rankings disagree", () => {
    const market = snapshot();
    const currencies = [...G8];
    const day = Object.fromEntries(currencies.map((currency, index) => [currency, index])) as Record<Currency, number>;
    const week = Object.fromEntries(currencies.map((currency, index) => [currency, currencies.length - index])) as Record<Currency, number>;
    market.primaryRanking = entries(day);
    market.weeklyRanking = entries(week);
    const result = buildPricePairCandidates(market);
    expect(result.status).toBe("no-alignment");
    expect(result.candidates).toEqual([]);
  });

  it("requires full, current data and never fills missing currencies", () => {
    const market = snapshot();
    market.weeklyRankingAvailable = false;
    expect(buildPricePairCandidates(market)).toMatchObject({ status: "partial", candidates: [] });

    const incomplete = snapshot();
    incomplete.primaryRanking = incomplete.primaryRanking.filter((row) => row.currency !== "CHF");
    expect(buildPricePairCandidates(incomplete)).toMatchObject({ status: "partial", candidates: [] });
    expect(buildPricePairCandidates(incomplete).message).toContain("CHF");
  });

  it("refuses to create a shortlist from an old source snapshot", () => {
    const market = snapshot();
    market.status = "stale";
    expect(buildPricePairCandidates(market)).toMatchObject({ status: "stale", candidates: [] });
  });
});
