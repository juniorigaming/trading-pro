import { G8, type Currency } from "@/lib/ai/types";
import type {
  CentralBankPolicySnapshot,
  ExchangeRatesMarketSnapshot,
  MarketCurrencyNarrative,
  PairAsymmetry,
  PriceFundamentalDivergence,
} from "./market-analysis-types";

function sign(value: number): -1 | 0 | 1 { return value > 0 ? 1 : value < 0 ? -1 : 0; }
function fundamentalSign(value: MarketCurrencyNarrative["fundamentalBias"]): -1 | 0 | 1 | null {
  if (value === "BULLISH") return 1;
  if (value === "BEARISH") return -1;
  if (value === "NEUTRAL") return 0;
  return null;
}

export function buildPriceFundamentalDivergences(
  market: ExchangeRatesMarketSnapshot,
  views: MarketCurrencyNarrative[],
): PriceFundamentalDivergence[] {
  const byCurrency = new Map(views.map((view) => [view.currency, view]));
  const marketByCurrency = new Map(market.primaryRanking.map((row) => [row.currency, row]));
  return G8.map((currency) => {
    const view = byCurrency.get(currency);
    const score = market.currentRankingAvailable ? marketByCurrency.get(currency)?.score ?? null : null;
    const marketDirection: PriceFundamentalDivergence["marketDirection"] = score === null
      ? "UNAVAILABLE"
      : sign(score) > 0 ? "BULLISH" : sign(score) < 0 ? "BEARISH" : "NEUTRAL";
    const fundamentalBias = view?.fundamentalBias ?? "INSUFFICIENT_DATA";
    const fundamentalQuality = view?.fundamentalQuality ?? "INSUFFICIENT_DATA";
    const confidence = view?.confidence ?? "LOW";
    let status: PriceFundamentalDivergence["status"] = "UNAVAILABLE";
    let explanation = "Força de mercado atual e/ou leitura fundamental insuficientes para comparar.";
    const fSign = fundamentalSign(fundamentalBias);
    if (score !== null && fSign !== null) {
      if (fSign === 0 || marketDirection === "NEUTRAL") {
        status = "MIXED";
        explanation = "Ao menos uma das duas dimensões está neutra; não há alinhamento direcional forte.";
      } else if (sign(score) === fSign) {
        status = "ALIGNED";
        explanation = "A direção da força de preço 1D coincide com o viés fundamental; isso não é recomendação de operação.";
      } else {
        status = "DIVERGENT";
        explanation = "A força de preço 1D e o viés fundamental apontam em sentidos opostos; divergência observacional, não gatilho.";
      }
    }
    return { currency, marketScore: score, marketDirection, fundamentalBias, fundamentalQuality, confidence, status, explanation };
  });
}

function pairFundamentalAlignment(
  marketSpread: number,
  baseBias: MarketCurrencyNarrative["fundamentalBias"],
  quoteBias: MarketCurrencyNarrative["fundamentalBias"],
): PairAsymmetry["fundamentalAlignment"] {
  const base = fundamentalSign(baseBias);
  const quote = fundamentalSign(quoteBias);
  if (base === null || quote === null) return "UNAVAILABLE";
  const fundamentalSpread = base - quote;
  if (fundamentalSpread === 0 || marketSpread === 0) return "MIXED";
  return sign(marketSpread) === sign(fundamentalSpread) ? "ALIGNED" : "DIVERGENT";
}

export function buildPairAsymmetries(
  market: ExchangeRatesMarketSnapshot,
  views: MarketCurrencyNarrative[],
  policies: CentralBankPolicySnapshot[],
  limit = 12,
): PairAsymmetry[] {
  if (!market.currentRankingAvailable) return [];
  const scores = new Map(market.primaryRanking.map((row) => [row.currency, row.score]));
  const narratives = new Map(views.map((view) => [view.currency, view]));
  const rates = new Map(policies.map((policy) => [policy.currency, policy]));
  if (G8.some((currency) => scores.get(currency) === null || scores.get(currency) === undefined)) return [];

  const pairs: PairAsymmetry[] = [];
  for (let i = 0; i < G8.length; i++) {
    for (let j = i + 1; j < G8.length; j++) {
      const base = G8[i] as Currency;
      const quote = G8[j] as Currency;
      const baseScore = scores.get(base)!;
      const quoteScore = scores.get(quote)!;
      const marketSpread = baseScore - quoteScore;
      const baseView = narratives.get(base);
      const quoteView = narratives.get(quote);
      const basePolicy = rates.get(base);
      const quotePolicy = rates.get(quote);
      const bothRatesAvailable = basePolicy?.status === "available" && quotePolicy?.status === "available"
        && basePolicy.rateLow !== null && basePolicy.rateHigh !== null
        && quotePolicy.rateLow !== null && quotePolicy.rateHigh !== null;
      const policyRateSpreadLow = bothRatesAvailable ? basePolicy!.rateLow! - quotePolicy!.rateHigh! : null;
      const policyRateSpreadHigh = bothRatesAvailable ? basePolicy!.rateHigh! - quotePolicy!.rateLow! : null;
      pairs.push({
        pair: `${base}/${quote}`,
        base,
        quote,
        baseMarketScore: baseScore,
        quoteMarketScore: quoteScore,
        marketSpread,
        strongerByMarket: marketSpread > 0 ? base : marketSpread < 0 ? quote : "TIED",
        baseFundamentalBias: baseView?.fundamentalBias ?? "INSUFFICIENT_DATA",
        quoteFundamentalBias: quoteView?.fundamentalBias ?? "INSUFFICIENT_DATA",
        fundamentalAlignment: pairFundamentalAlignment(marketSpread, baseView?.fundamentalBias ?? "INSUFFICIENT_DATA", quoteView?.fundamentalBias ?? "INSUFFICIENT_DATA"),
        baseConfidence: baseView?.confidence ?? "LOW",
        quoteConfidence: quoteView?.confidence ?? "LOW",
        policyRateSpreadLow,
        policyRateSpreadHigh,
      });
    }
  }
  return pairs.sort((a, b) => Math.abs(b.marketSpread) - Math.abs(a.marketSpread)).slice(0, Math.max(0, limit));
}
