import { G8, type Currency } from "@/lib/ai/types";
import type { ExchangeRatesMarketSnapshot, MarketStrengthEntry } from "./market-analysis-types";

/** Ordem de cotação Forex usada pelo módulo de candidatos macro. */
const BASE_PRIORITY: readonly Currency[] = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

export interface PricePairCandidate {
  symbol: string;
  pair: string;
  base: Currency;
  quote: Currency;
  bias: "LONG" | "SHORT";
  stronger: Currency;
  weaker: Currency;
  oneDaySpread: number;
  oneWeekSpread: number;
}

export type PricePairCandidateStatus = "ready" | "stale" | "partial" | "unavailable" | "no-alignment";

export interface PricePairCandidateResult {
  status: PricePairCandidateStatus;
  candidates: PricePairCandidate[];
  message: string | null;
}

function scoreMap(entries: MarketStrengthEntry[]): Map<Currency, number | null> {
  return new Map(entries.map((entry) => [entry.currency, entry.score]));
}

function unavailableResult(status: PricePairCandidateStatus, message: string): PricePairCandidateResult {
  return { status, candidates: [], message };
}

/**
 * Gera até três pares candidatos somente quando o melhor lado em 1D também vence em 1W.
 * Usa os scores percentuais originais do Meter; não consulta nem combina scores macro.
 */
export function buildPricePairCandidates(
  market: ExchangeRatesMarketSnapshot,
  limit = 3,
): PricePairCandidateResult {
  if (market.status === "stale") {
    return unavailableResult("stale", "A captura do Currency Strength Meter está desatualizada. Nenhum par foi sugerido.");
  }
  if (!market.currentRankingAvailable || !market.weeklyRankingAvailable) {
    const missingPeriods = [
      !market.currentRankingAvailable ? `1D: ${market.rankingMessage}` : null,
      !market.weeklyRankingAvailable ? `1W: ${market.weeklyRankingMessage}` : null,
    ].filter((message): message is string => Boolean(message));
    return unavailableResult(
      market.status === "unavailable" ? "unavailable" : "partial",
      `É necessário ter rankings atuais e completos em 1D e 1W para montar a shortlist. ${missingPeriods.join(" ")} Nenhum valor foi estimado.`,
    );
  }

  const oneDay = scoreMap(market.primaryRanking);
  const oneWeek = scoreMap(market.weeklyRanking);
  const missingCurrencies = G8.filter((currency) =>
    !Number.isFinite(oneDay.get(currency)) || !Number.isFinite(oneWeek.get(currency)),
  );
  if (missingCurrencies.length) {
    return unavailableResult(
      "partial",
      `Não foi possível validar 1D e 1W para ${missingCurrencies.join(", ")}. Nenhum par foi estimado ou incluído na shortlist.`,
    );
  }

  const candidates: PricePairCandidate[] = [];
  for (let i = 0; i < G8.length; i++) {
    for (let j = i + 1; j < G8.length; j++) {
      const first = G8[i] as Currency;
      const second = G8[j] as Currency;
      const firstDay = oneDay.get(first)!;
      const secondDay = oneDay.get(second)!;
      if (firstDay === secondDay) continue;

      const stronger = firstDay > secondDay ? first : second;
      const weaker = stronger === first ? second : first;
      const oneDaySpread = Math.abs(firstDay - secondDay);
      const oneWeekSpread = oneWeek.get(stronger)! - oneWeek.get(weaker)!;

      // A shortlist exige direção concordante nos dois horizontes; contradições não viram trade.
      if (!(oneWeekSpread > 0)) continue;

      const strongerFirst = BASE_PRIORITY.indexOf(stronger) < BASE_PRIORITY.indexOf(weaker);
      const base = strongerFirst ? stronger : weaker;
      const quote = strongerFirst ? weaker : stronger;
      candidates.push({
        symbol: `${base}${quote}`,
        pair: `${base}/${quote}`,
        base,
        quote,
        bias: strongerFirst ? "LONG" : "SHORT",
        stronger,
        weaker,
        oneDaySpread,
        oneWeekSpread,
      });
    }
  }

  candidates.sort((a, b) =>
    b.oneDaySpread - a.oneDaySpread
    || b.oneWeekSpread - a.oneWeekSpread
    || a.symbol.localeCompare(b.symbol),
  );

  if (!candidates.length) {
    return unavailableResult(
      "no-alignment",
      "Nenhum par G8 tem a mesma moeda mais forte em 1D e 1W agora. A shortlist fica vazia para evitar forçar uma operação.",
    );
  }

  return { status: "ready", candidates: candidates.slice(0, Math.max(0, limit)), message: null };
}
