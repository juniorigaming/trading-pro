import type { Currency } from "@/lib/ai/types";

export type MarketSourceStatus = "available" | "partial" | "stale" | "unavailable";
export type MarketNarrativeStatus = "available" | "mock" | "unavailable";

export interface MarketStrengthEntry {
  currency: Currency;
  /** Desempenho mediano (%) original publicado no período pela Currency Strength Meter; não reescalado. */
  score: number | null;
  /** Posição original na fonte, que inclui NOK/SEK. */
  sourceRank: number | null;
  /** Posição recalculada apenas entre as moedas G8 que têm score. */
  g8Rank: number | null;
  wins: number | null;
  losses: number | null;
  flat: number | null;
  comparisons: number | null;
}

export interface HorizonMarketEntry {
  currency: Currency;
  /** Variação percentual mediana derivada dos pares G8 exibidos na heatmap. */
  value: number | null;
  observations: number;
  expectedObservations: number;
  method: string;
}

export interface ExchangeRatesMarketSnapshot {
  status: MarketSourceStatus;
  sourceUrl: string;
  retrievedAt: string;
  updatedAt: string | null;
  ageHours: number | null;
  currentRankingAvailable: boolean;
  rankingMessage: string;
  weeklyRankingAvailable: boolean;
  weeklyRankingMessage: string;
  /** Valores 1D originais do Currency Strength Meter; ranking de exibição filtra NOK/SEK. */
  primaryRanking: MarketStrengthEntry[];
  /** Valores 1W originais do Currency Strength Meter; ranking de exibição filtra NOK/SEK. */
  weeklyRanking: MarketStrengthEntry[];
  /** 5D e MTD vêm da mediana das variações percentuais dos 7 pares G8; YTD é o score original do meter. */
  persistence: {
    fiveDay: HorizonMarketEntry[];
    monthToDate: HorizonMarketEntry[];
    yearToDate: MarketStrengthEntry[];
    notes: string[];
  };
}

export interface CentralBankPolicySnapshot {
  currency: Currency;
  bank: string;
  status: "available" | "unavailable";
  /** Texto da taxa publicado pela fonte oficial, preservando faixa/definição quando aplicável. */
  rateText: string | null;
  /** Limites para cálculo informativo do diferencial de taxas; null quando não obtidos. */
  rateLow: number | null;
  rateHigh: number | null;
  asOf: string | null;
  asOfMeaning: string;
  latestDecisionAt: string | null;
  nextDecision: string | null;
  excerpt: string | null;
  sourceUrl: string;
  decisionUrl: string | null;
  retrievedAt: string;
  detail: string | null;
}

export interface StoredInterpretationEvidence {
  category: string;
  importance: string;
  classification: string;
  surpriseVsForecast: string | null;
  centralBankImplication: string;
  currencyImplication: string;
  confidence: string;
  reasoningSummary: string;
}

export interface MacroEvidenceEvent {
  id: string;
  currency: Currency;
  event: string;
  date: string | null;
  scheduledAt: string | null;
  impact: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: string;
  kind: "released" | "upcoming";
  origin: "saved_database" | "user_confirmed";
  interpretation: StoredInterpretationEvidence | null;
}

export interface MacroEvidenceSnapshot {
  status: "available" | "unavailable";
  retrievedAt: string;
  released: MacroEvidenceEvent[];
  upcoming: MacroEvidenceEvent[];
  supplementalCount: number;
  excludedUnconfirmedCount: number;
  message: string | null;
}

export const MARKET_REPORT_SECTION_IDS = [
  "executive_summary",
  "source_reliability",
  "market_strength_1d",
  "fundamental_background",
  "monetary_policy_g8",
  "external_factors",
  "horizon_persistence",
  "actual_vs_forecast",
  "price_fundamental_divergences",
  "pair_asymmetries",
  "currency_by_currency",
  "macro_catalysts",
  "risk_scenarios",
  "confidence_and_limitations",
  "methodology_and_disclaimer",
] as const;
export type MarketReportSectionId = (typeof MARKET_REPORT_SECTION_IDS)[number];

export const MARKET_REPORT_SECTION_TITLES: Record<MarketReportSectionId, string> = {
  executive_summary: "1. Resumo executivo",
  source_reliability: "2. Fonte primária e atualização",
  market_strength_1d: "3. Força de preço — Currency Strength Meter 1D e 1W",
  fundamental_background: "4. Qualidade e pano de fundo dos fundamentos",
  monetary_policy_g8: "5. Bancos centrais, taxas e orientação oficial",
  external_factors: "6. Fatores externos: risco, commodities e geopolítica",
  horizon_persistence: "7. Persistência: 1D, 1W, 5D, MTD e YTD",
  actual_vs_forecast: "8. Divulgações: Actual × Forecast × Previous",
  price_fundamental_divergences: "9. Divergências entre preço e fundamentos",
  pair_asymmetries: "10. Combinações com assimetria de força",
  currency_by_currency: "11. Análise individual das oito moedas",
  macro_catalysts: "12. Próximos catalisadores observados",
  risk_scenarios: "13. Riscos e cenários de invalidação",
  confidence_and_limitations: "14. Confiança e qualidade dos dados",
  methodology_and_disclaimer: "15. Método, fontes e limites — não é recomendação",
};

export interface MarketCurrencyNarrative {
  currency: Currency;
  fundamentalBias: "BULLISH" | "NEUTRAL" | "BEARISH" | "INSUFFICIENT_DATA";
  fundamentalQuality: "STRONG" | "MIXED" | "WEAK" | "INSUFFICIENT_DATA";
  policyStance: "HAWKISH" | "NEUTRAL" | "DOVISH" | "MIXED" | "UNCLEAR" | "UNAVAILABLE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
  drivers: string[];
  risks: string[];
  evidenceRefs: string[];
}

export interface MarketNarrativeSection {
  id: MarketReportSectionId;
  title: string;
  summary: string;
  observations: string[];
  evidenceRefs: string[];
}

export interface ExternalFactorNarrative {
  name: string;
  status: "EVIDENCED" | "UNAVAILABLE";
  impact: "SUPPORTIVE" | "NEUTRAL" | "ADVERSE" | "MIXED" | "UNKNOWN";
  currencies: Currency[];
  detail: string;
  evidenceRefs: string[];
}

export interface MarketKeyRisk {
  risk: string;
  trigger: string;
  currencies: Currency[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidenceRefs: string[];
}

export interface PriceFundamentalDivergence {
  currency: Currency;
  marketScore: number | null;
  marketDirection: "BULLISH" | "NEUTRAL" | "BEARISH" | "UNAVAILABLE";
  fundamentalBias: MarketCurrencyNarrative["fundamentalBias"];
  fundamentalQuality: MarketCurrencyNarrative["fundamentalQuality"];
  confidence: MarketCurrencyNarrative["confidence"];
  status: "ALIGNED" | "DIVERGENT" | "MIXED" | "UNAVAILABLE";
  explanation: string;
}

export interface PairAsymmetry {
  pair: string;
  base: Currency;
  quote: Currency;
  baseMarketScore: number;
  quoteMarketScore: number;
  marketSpread: number;
  strongerByMarket: Currency | "TIED";
  baseFundamentalBias: MarketCurrencyNarrative["fundamentalBias"];
  quoteFundamentalBias: MarketCurrencyNarrative["fundamentalBias"];
  fundamentalAlignment: "ALIGNED" | "DIVERGENT" | "MIXED" | "UNAVAILABLE";
  baseConfidence: MarketCurrencyNarrative["confidence"];
  quoteConfidence: MarketCurrencyNarrative["confidence"];
  policyRateSpreadLow: number | null;
  policyRateSpreadHigh: number | null;
}

export interface MarketMacroAnalysisResponse {
  generatedAt: string;
  analysisStatus: MarketNarrativeStatus;
  ai: { provider: string; model: string; promptVersion: string | null; latencyMs: number | null };
  marketStrength: ExchangeRatesMarketSnapshot;
  policyRates: CentralBankPolicySnapshot[];
  evidence: MacroEvidenceSnapshot;
  narrative: {
    headline: string;
    executiveSummary: string;
    sections: MarketNarrativeSection[];
    currencyViews: MarketCurrencyNarrative[];
    externalFactors: ExternalFactorNarrative[];
    keyRisks: MarketKeyRisk[];
  };
  divergences: PriceFundamentalDivergence[];
  pairAsymmetries: PairAsymmetry[];
  warnings: string[];
}
