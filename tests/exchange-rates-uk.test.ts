import { describe, expect, it } from "vitest";
import { G8 } from "@/lib/ai/types";
import { parseExchangeRatesUKHtml } from "@/lib/macro/exchange-rates-uk";

const currencyMeta = [
  ["AUD", 0.56, 1], ["CAD", 0.36, 2], ["NZD", 0.28, 3], ["NOK", 0.14, 4], ["SEK", 0.05, 5],
  ["USD", -0.05, 6], ["GBP", -0.14, 7], ["EUR", -0.25, 8], ["CHF", -0.27, 9], ["JPY", -0.32, 10],
] as const;

function page(updated = "19 Oct 2026, 16:01 BST", missingCurrency?: string, pairUpdatedAt = "2026-10-19 15:00:00") {
  const strengthRow = (currency: string, score: number, rank: number) => ({ iso: currency, score, rank, wins: 9 - rank, losses: rank - 1, flat: 0, comparisons: 9 });
  const strength = Object.fromEntries([
    ["1d", currencyMeta.filter(([currency]) => currency !== missingCurrency).map(([currency, score, rank]) => strengthRow(currency, score, rank))],
    ["ytd", G8.map((currency, index) => strengthRow(currency, index * 0.25 - 0.5, index + 1))],
  ]);
  const heatmap = Object.fromEntries(G8.map((currency) => [currency, G8.filter((quote) => quote !== currency).map((quote, index) => ({
    quote,
    pair: `${currency}/${quote}`,
    base: currency,
    updated_at: pairUpdatedAt,
    periods: {
      "5d": currency === "AUD" ? [-0.4, -0.3, -0.2, 0.1, 0.5, 0.7, 1.3][index] : index / 10,
      mtd: currency === "AUD" ? [-1.1, -0.5, -0.2, 0.2, 0.4, 0.6, 1.5][index] : -index / 10,
    },
  }))]));
  const model = { strength, heatmap };
  return `<html><body><p>Updated ${updated}</p><script>const model = ${JSON.stringify(model)};</script></body></html>`;
}

describe("Exchange Rates UK Currency Strength Meter parser", () => {
  it("preserves source 1D scores, filters NOK/SEK, and assigns a separate G8 rank", () => {
    const result = parseExchangeRatesUKHtml(page(), new Date("2026-10-19T15:02:00.000Z"));
    expect(result.status).toBe("available");
    expect(result.currentRankingAvailable).toBe(true);
    expect(result.primaryRanking).toHaveLength(8);
    expect(result.primaryRanking.map((row) => row.currency)).not.toContain("NOK");
    expect(result.primaryRanking.map((row) => row.currency)).not.toContain("SEK");
    expect(result.primaryRanking[0]).toMatchObject({ currency: "AUD", score: 0.56, sourceRank: 1, g8Rank: 1 });
    expect(result.primaryRanking.find((row) => row.currency === "USD")).toMatchObject({ score: -0.05, sourceRank: 6, g8Rank: 4 });
    expect(result.persistence.yearToDate.find((row) => row.currency === "AUD")?.score).toBe(1);
  });

  it("uses exact 5D and MTD heatmap observations as labeled G8 medians, not meter scores", () => {
    const result = parseExchangeRatesUKHtml(page(), new Date("2026-10-19T15:02:00.000Z"));
    expect(result.persistence.fiveDay.find((row) => row.currency === "AUD")).toMatchObject({ value: 0.1, observations: 7, expectedObservations: 7 });
    expect(result.persistence.monthToDate.find((row) => row.currency === "AUD")).toMatchObject({ value: 0.2, observations: 7, expectedObservations: 7 });
    expect(result.persistence.fiveDay[0].method).toContain("não score do Currency Strength Meter");
  });

  it("excludes stale per-pair heatmap observations without suppressing a fresh official 1D ranking", () => {
    const result = parseExchangeRatesUKHtml(page("19 Oct 2026, 16:01 BST", undefined, "2026-10-18 14:00:00"), new Date("2026-10-19T15:02:00.000Z"));
    expect(result.currentRankingAvailable).toBe(true);
    expect(result.status).toBe("partial");
    expect(result.persistence.fiveDay.find((row) => row.currency === "AUD")).toMatchObject({ value: null, observations: 0, expectedObservations: 7 });
  });

  it("does not call a stale snapshot current", () => {
    const result = parseExchangeRatesUKHtml(page("15 Oct 2026, 16:01 BST"), new Date("2026-10-19T15:02:00.000Z"));
    expect(result.status).toBe("stale");
    expect(result.currentRankingAvailable).toBe(false);
    expect(result.primaryRanking).toHaveLength(8);
    expect(result.rankingMessage).toContain("não como ranking atual");
  });

  it("does not invent a missing currency score or silently label an incomplete ranking complete", () => {
    const result = parseExchangeRatesUKHtml(page("19 Oct 2026, 16:01 BST", "JPY"), new Date("2026-10-19T15:02:00.000Z"));
    expect(result.status).toBe("partial");
    expect(result.currentRankingAvailable).toBe(false);
    expect(result.primaryRanking.find((row) => row.currency === "JPY")).toMatchObject({ score: null, sourceRank: null, g8Rank: null });
  });

  it("rejects a page without a verifiable update timestamp instead of treating it as live", () => {
    const result = parseExchangeRatesUKHtml(page("unknown"), new Date("2026-10-19T15:02:00.000Z"));
    expect(result.status).toBe("unavailable");
    expect(result.currentRankingAvailable).toBe(false);
    expect(result.primaryRanking).toHaveLength(0);
    expect(result.rankingMessage).toContain("horário de atualização");
  });
});
