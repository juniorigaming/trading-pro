import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { G8, type Currency } from "@/lib/ai/types";
import type { ExchangeRatesMarketSnapshot, MarketStrengthEntry } from "@/lib/macro/market-analysis-types";
import CurrencyStrengthRankings, { rankG8StrengthEntries } from "@/components/ai/CurrencyStrengthRankings";
import PricePairCandidates from "@/components/ai/PricePairCandidates";
import MacroMarketAnalysisView from "@/components/ai/MacroMarketAnalysisView";
import type { MarketMacroAnalysisResponse } from "@/lib/macro/market-analysis-types";

function snapshot(): ExchangeRatesMarketSnapshot {
  return {
    status: "unavailable",
    sourceUrl: "https://example.test/strength",
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

describe("G8 strength list", () => {
  it("shows all eight currencies, D1/W1 selectors, and no source labels when data is unavailable", () => {
    const html = renderToStaticMarkup(<CurrencyStrengthRankings market={snapshot()} />);
    expect(html).toContain(">D1</button>");
    expect(html).toContain(">W1</button>");
    expect(html).toContain("Indisponível");
    for (const currency of G8) expect(html).toContain(`>${currency}</span>`);
    expect(html).not.toContain("Exchange Rates UK");
    expect(html).not.toContain("Currency Strength Meter");
  });

  it("keeps the macro analysis result to the compact ranking, not the detailed narrative", () => {
    const report = {
      analysisStatus: "available",
      marketStrength: completeSnapshot(),
      narrative: { headline: "NARRATIVA-TESTE-NÃO-EXIBIR", executiveSummary: "RELATÓRIO-EXTENSO-TESTE" },
    } as unknown as MarketMacroAnalysisResponse;
    const html = renderToStaticMarkup(<MacroMarketAnalysisView report={report} onBack={() => {}} />);
    expect(html).toContain("Força das moedas G8");
    expect(html).not.toContain("NARRATIVA-TESTE-NÃO-EXIBIR");
    expect(html).not.toContain("RELATÓRIO-EXTENSO-TESTE");
    expect(html).not.toContain("example.test");
  });

  it("orders D1 from strongest to weakest and displays the original percentage scores", () => {
    const html = renderToStaticMarkup(<CurrencyStrengthRankings market={completeSnapshot()} />);
    expect(html.indexOf(">GBP</span>")).toBeLessThan(html.indexOf(">AUD</span>"));
    expect(html.indexOf(">AUD</span>")).toBeLessThan(html.indexOf(">CAD</span>"));
    expect(html.indexOf(">CAD</span>")).toBeLessThan(html.indexOf(">USD</span>"));
    expect(html).toContain("+0,36%");
    expect(html).toContain("-0,19%");
  });

  it("leaves missing and non-finite scores without an invented rank", () => {
    const rows = rankG8StrengthEntries([{
      currency: "AUD", score: Number.NaN, sourceRank: 1, g8Rank: 1,
      wins: 5, losses: 2, flat: 1, comparisons: 8,
    }]);
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.score === null && row.g8Rank === null)).toBe(true);
  });

  it("orders W1 independently from strongest to weakest", () => {
    const rows = rankG8StrengthEntries(completeSnapshot().weeklyRanking);
    expect(rows.slice(0, 4).map((row) => row.currency)).toEqual(["NZD", "CAD", "GBP", "CHF"]);
    expect(rows.slice(4).map((row) => row.currency)).toEqual(["AUD", "EUR", "USD", "JPY"]);
  });

  it("hides old scores when the data snapshot is stale but keeps all G8 rows visible", () => {
    const market = completeSnapshot();
    market.status = "stale";
    const html = renderToStaticMarkup(<CurrencyStrengthRankings market={market} />);
    expect(html).toContain("Desatualizado");
    expect(html).not.toContain("+0,36%");
    for (const currency of G8) expect(html).toContain(`>${currency}</span>`);
  });

  it("shows only the top three aligned price-differential pairs in Ranking G8", () => {
    const html = renderToStaticMarkup(<PricePairCandidates market={completeSnapshot()} />);
    expect(html).toContain("Top 3 pares · maior diferencial de força");
    expect(html).toContain("GBP/USD");
    expect(html).toContain("D1 + W1 alinhados");
    expect(html).toContain("Analisar no SMC/ICT");
    expect(html).not.toContain("Exchange Rates UK");
    expect(html).not.toContain("Currency Strength Meter");
  });
});
