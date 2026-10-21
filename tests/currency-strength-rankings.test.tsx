import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { G8 } from "@/lib/ai/types";
import type { ExchangeRatesMarketSnapshot } from "@/lib/macro/market-analysis-types";
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

describe("Currency Strength G8 rankings", () => {
  it("always renders all eight G8 currencies for both periods when the source has no rows", () => {
    const html = renderToStaticMarkup(<CurrencyStrengthRankings market={snapshot()} />);
    expect(html).toContain("Diário — 1D / Today");
    expect(html).toContain("Semanal — 1W");
    for (const currency of G8) {
      expect(html.match(new RegExp(`>${currency}</td>`, "g")) ?? []).toHaveLength(2);
    }
    expect(html).toContain("não significa zero");
    expect(html).toContain("Nenhum valor ausente foi estimado");
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
});
