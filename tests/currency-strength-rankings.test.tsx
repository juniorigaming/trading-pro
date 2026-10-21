import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { G8, type Currency } from "@/lib/ai/types";
import type { ExchangeRatesMarketSnapshot, MarketStrengthEntry } from "@/lib/macro/market-analysis-types";
import CurrencyStrengthRankings from "@/components/ai/CurrencyStrengthRankings";

function snapshot(): ExchangeRatesMarketSnapshot {
  return {
    status: "unavailable",
    sourceUrl: "https://www.exchangerates.org.uk/performance-trends",
    retrievedAt: "2026-10-19T15:00:00.000Z",
    updatedAt: null,
    ageHours: null,
    currentRankingAvailable: false,
    rankingMessage: "Ranking 1D indisponível.",
    weeklyRankingAvailable: false,
    weeklyRankingMessage: "Ranking 1W indisponível.",
    primaryRanking: [],
    weeklyRanking: [],
    persistence: { fiveDay: [], monthToDate: [], yearToDate: [], notes: [] },
  };
}

function entries(values: Record<Currency, number>): MarketStrengthEntry[] {
  return G8.map((currency, index) => ({
    currency, score: values[currency], sourceRank: index + 1, g8Rank: index + 1,
    wins: 5, losses: 2, flat: 1, comparisons: 8,
  }));
}

function completeSnapshot(): ExchangeRatesMarketSnapshot {
  const market = snapshot();
  market.status = "available";
  market.currentRankingAvailable = true;
  market.weeklyRankingAvailable = true;
  market.primaryRanking = entries({ USD: -0.19, EUR: -0.08, GBP: 0.36, JPY: -0.08, CHF: -0.08, CAD: 0.19, AUD: 0.33, NZD: 0.08 });
  market.weeklyRanking = entries({ USD: -0.8, EUR: -0.58, GBP: 0.33, JPY: -0.82, CHF: 0.27, CAD: 0.56, AUD: -0.37, NZD: 0.58 });
  return market;
}

describe("Currency Strength G8 rankings", () => {
  it("always renders all eight G8 currencies for both periods when the source has no rows", () => {
    const html = renderToStaticMarkup(<CurrencyStrengthRankings market={snapshot()} />);
    expect(html).toContain("Diário — 1D / Today");
    expect(html).toContain("Semanal — 1W");
    expect(html).toContain("Pares candidatos por força de preço");
    for (const currency of G8) {
      expect(html.match(new RegExp(`>${currency}</td>`, "g")) ?? []).toHaveLength(2);
    }
    expect(html).toContain("não significa zero");
    expect(html).toContain("Nenhum valor ausente foi estimado");
  });

  it("shows aligned, price-only pair candidates with a direct SMC/ICT link", () => {
    const html = renderToStaticMarkup(<CurrencyStrengthRankings market={completeSnapshot()} />);
    expect(html).toContain("GBP/USD");
    expect(html).toContain("1D + 1W alinhados");
    expect(html).toContain("Analisar no SMC/ICT");
    expect(html).toContain("symbol=GBPUSD&amp;bias=LONG");
    expect(html).toContain("Comparações");
  });

  it("preserves the supplied source percentage and shows missing period values as empty", () => {
    const market = snapshot();
    market.status = "partial";
    market.primaryRanking = [{
      currency: "AUD", score: 0.53, sourceRank: 1, g8Rank: 1,
      wins: 7, losses: 2, flat: 0, comparisons: 9,
    }];
    const html = renderToStaticMarkup(<CurrencyStrengthRankings market={market} />);
    expect(html).toContain("+0,53%");
    expect(html).toContain("Score 1D (%)");
    expect(html).toContain("Score 1W (%)");
  });

  it("keeps the full currency tables collapsed in compact report mode", () => {
    const html = renderToStaticMarkup(<CurrencyStrengthRankings market={completeSnapshot()} compact />);
    expect(html).toContain("Pares candidatos por força de preço");
    expect(html).toContain("Ver ranking completo das oito moedas (1D e 1W)");
    expect(html).not.toContain("Força de preço original do Currency Strength Meter. É distinta");
  });
});
