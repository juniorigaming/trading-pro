import { G8, type Currency } from "@/lib/ai/types";
import type { ExchangeRatesMarketSnapshot, HorizonMarketEntry, MarketSourceStatus, MarketStrengthEntry } from "./market-analysis-types";

export const EXCHANGE_RATES_UK_URL = "https://www.exchangerates.org.uk/performance-trends";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const G8_SET = new Set<string>(G8);
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

interface SourceStrengthRow {
  iso?: unknown;
  score?: unknown;
  rank?: unknown;
  wins?: unknown;
  losses?: unknown;
  flat?: unknown;
  comparisons?: unknown;
}
interface SourcePairRow {
  quote?: unknown;
  base?: unknown;
  updated_at?: unknown;
  periods?: Record<string, unknown>;
}
interface SourceModel {
  strength?: Record<string, unknown>;
  heatmap?: Record<string, unknown>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function nullablePositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function extractJsonObjectAfter(source: string, marker: RegExp): unknown {
  const match = marker.exec(source);
  if (!match) throw new Error("O objeto JSON do Currency Strength Meter não foi encontrado.");
  const start = source.indexOf("{", match.index + match[0].length);
  if (start < 0) throw new Error("O JSON embutido está incompleto.");

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(source.slice(start, i + 1)) as unknown;
  }
  throw new Error("O JSON embutido do Currency Strength Meter não fechou corretamente.");
}

function parseUpdatedAt(html: string): Date | null {
  const visibleText = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
  const match = /\bUpdated\s+(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(BST|GMT)\b/i.exec(visibleText);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const zoneOffsetMinutes = match[6].toUpperCase() === "BST" ? 60 : 0;
  if (month === undefined || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const local = new Date(Date.UTC(year, month, day, hour, minute));
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month || local.getUTCDate() !== day) return null;
  return new Date(local.getTime() - zoneOffsetMinutes * 60_000);
}

function sourceRows(model: SourceModel, period: string): SourceStrengthRow[] {
  const value = model.strength?.[period];
  return Array.isArray(value) ? value.filter((row): row is SourceStrengthRow => !!row && typeof row === "object") as SourceStrengthRow[] : [];
}

function rowsForG8(model: SourceModel, period: string): Map<Currency, SourceStrengthRow> {
  const result = new Map<Currency, SourceStrengthRow>();
  for (const row of sourceRows(model, period)) {
    const iso = typeof row.iso === "string" ? row.iso.toUpperCase() : "";
    if (!G8_SET.has(iso) || result.has(iso as Currency)) continue;
    result.set(iso as Currency, row);
  }
  return result;
}

function makeOfficialStrengthEntries(model: SourceModel, period: string): MarketStrengthEntry[] {
  const found = rowsForG8(model, period);
  const sorted = [...G8].map((currency) => {
    const row = found.get(currency);
    return {
      currency,
      score: isFiniteNumber(row?.score) ? row.score : null,
      sourceRank: nullablePositiveInt(row?.rank),
      g8Rank: null as number | null,
      wins: nullableInt(row?.wins),
      losses: nullableInt(row?.losses),
      flat: nullableInt(row?.flat),
      comparisons: nullableInt(row?.comparisons),
    } satisfies MarketStrengthEntry;
  });
  const present = sorted.filter((row) => row.score !== null).sort((a, b) => {
    if (a.sourceRank !== null && b.sourceRank !== null && a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
    if (a.sourceRank !== null && b.sourceRank === null) return -1;
    if (a.sourceRank === null && b.sourceRank !== null) return 1;
    return (b.score ?? 0) - (a.score ?? 0);
  });
  present.forEach((row, index) => { row.g8Rank = index + 1; });
  const rankByCurrency = new Map(present.map((row) => [row.currency, row.g8Rank]));
  return sorted
    .map((row) => ({ ...row, g8Rank: rankByCurrency.get(row.currency) ?? null }))
    .sort((a, b) => (a.g8Rank ?? Number.MAX_SAFE_INTEGER) - (b.g8Rank ?? Number.MAX_SAFE_INTEGER) || G8.indexOf(a.currency) - G8.indexOf(b.currency));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pairTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function heatmapMedian(model: SourceModel, period: "5d" | "mtd", now: Date): HorizonMarketEntry[] {
  const heatmap = model.heatmap && typeof model.heatmap === "object" ? model.heatmap : {};
  return G8.map((currency) => {
    const rows = Array.isArray(heatmap[currency])
      ? (heatmap[currency] as unknown[]).filter((row): row is SourcePairRow => !!row && typeof row === "object")
      : [];
    const seenQuotes = new Set<string>();
    const values: number[] = [];
    for (const row of rows) {
      const quote = typeof row.quote === "string" ? row.quote.toUpperCase() : "";
      const value = row.periods?.[period];
      const base = typeof row.base === "string" ? row.base.toUpperCase() : currency;
      const updatedAt = row.updated_at == null ? null : pairTimestamp(row.updated_at);
      const stalePair = row.updated_at != null && (!updatedAt || now.getTime() - updatedAt.getTime() > MAX_AGE_MS || updatedAt.getTime() - now.getTime() > 10 * 60_000);
      if (base !== currency || !G8_SET.has(quote) || quote === currency || seenQuotes.has(quote) || !isFiniteNumber(value) || stalePair) continue;
      seenQuotes.add(quote);
      values.push(value);
    }
    return {
      currency,
      value: median(values),
      observations: values.length,
      expectedObservations: G8.length - 1,
      method: "Mediana das variações percentuais dos pares G8 publicados na heatmap; quando updated_at individual existe, observações acima de 24h são descartadas. Cálculo derivado, não score do Currency Strength Meter.",
    };
  });
}

function emptySnapshot(now: Date, status: MarketSourceStatus, message: string, updatedAt: string | null = null, ageHours: number | null = null): ExchangeRatesMarketSnapshot {
  return {
    status,
    sourceUrl: EXCHANGE_RATES_UK_URL,
    retrievedAt: now.toISOString(),
    updatedAt,
    ageHours,
    currentRankingAvailable: false,
    rankingMessage: message,
    primaryRanking: [],
    persistence: { fiveDay: [], monthToDate: [], yearToDate: [], notes: [message] },
  };
}

/** Parser puro para testar estrutura, atualização e scores sem depender da rede. */
export function parseExchangeRatesUKHtml(html: string, now = new Date()): ExchangeRatesMarketSnapshot {
  const updated = parseUpdatedAt(html);
  let model: SourceModel;
  try {
    const parsed = extractJsonObjectAfter(html, /\b(?:const|let|var)\s+model\s*=\s*/i);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("O objeto do Currency Strength Meter tem formato inválido.");
    model = parsed as SourceModel;
  } catch (error) {
    return emptySnapshot(now, "unavailable", error instanceof Error ? error.message : "Não foi possível ler o JSON da fonte.");
  }

  if (!updated) return emptySnapshot(now, "unavailable", "A página não apresentou um horário de atualização reconhecível; o ranking não será tratado como atual.");
  const ageMs = now.getTime() - updated.getTime();
  const updatedAt = updated.toISOString();
  const ageHours = Math.round((ageMs / 3_600_000) * 10) / 10;
  if (ageMs < -10 * 60_000) return emptySnapshot(now, "unavailable", "O horário da fonte está no futuro em relação ao servidor; ranking atual não validado.", updatedAt, ageHours);

  const primary = makeOfficialStrengthEntries(model, "1d");
  const withScore = primary.filter((row) => row.score !== null).length;
  const withSourceRank = primary.filter((row) => row.sourceRank !== null).length;
  if (withScore === 0) return emptySnapshot(now, "unavailable", "A página respondeu, mas não continha scores 1D válidos para moedas G8.", updatedAt, ageHours);

  const fiveDay = heatmapMedian(model, "5d", now);
  const monthToDate = heatmapMedian(model, "mtd", now);
  const yearToDate = makeOfficialStrengthEntries(model, "ytd");
  const notes = [
    "A ordem G8 é recalculada apenas após filtrar NOK e SEK; os scores e sourceRank do 1D permanecem exatamente os publicados pela fonte.",
    "5D e MTD são medianas calculadas dos retornos percentuais da heatmap para os sete pares G8 de cada moeda; não são apresentados como scores originais do Currency Strength Meter.",
    "YTD usa o score original do Currency Strength Meter; o ranking da fonte pode incluir NOK/SEK, que são removidas apenas da lista G8 exibida.",
    "A fonte não publica MTD no array do Currency Strength Meter; por isso o MTD abaixo é derivado dos retornos publicados na heatmap.",
  ];

  const stale = ageMs > MAX_AGE_MS;
  const primaryComplete = withScore === G8.length && withSourceRank === G8.length;
  const persistenceComplete = fiveDay.every((row) => row.observations === row.expectedObservations)
    && monthToDate.every((row) => row.observations === row.expectedObservations)
    && yearToDate.every((row) => row.score !== null);
  let status: MarketSourceStatus = "available";
  if (stale) status = "stale";
  else if (!primaryComplete || !persistenceComplete) status = "partial";
  const currentRankingAvailable = !stale && primaryComplete;
  const rankingMessage = stale
    ? !primaryComplete
      ? `A fonte está desatualizada (${ageHours}h) e o snapshot é parcial (${withScore}/${G8.length} scores, ${withSourceRank}/${G8.length} posições de origem 1D); os valores são apenas referência, não ranking atual. Nenhum score foi estimado.`
      : `A fonte está desatualizada (${ageHours}h); o último snapshot é mostrado apenas como referência, não como ranking atual.`
    : !primaryComplete
      ? `Ranking G8 parcial: ${withScore}/${G8.length} scores e ${withSourceRank}/${G8.length} posições de origem 1D foram lidos. Moedas/campos ausentes ficam sem posição; nenhum score ou rank foi estimado.`
      : !persistenceComplete
        ? "Ranking 1D/Today completo; uma ou mais séries complementares estão incompletas e foram marcadas sem dado."
        : "Ranking 1D/Today completo e atualizado; scores originais preservados e NOK/SEK fora da lista G8.";

  return {
    status,
    sourceUrl: EXCHANGE_RATES_UK_URL,
    retrievedAt: now.toISOString(),
    updatedAt,
    ageHours,
    currentRankingAvailable,
    rankingMessage,
    primaryRanking: primary,
    persistence: { fiveDay, monthToDate, yearToDate, notes },
  };
}

export async function fetchExchangeRatesUKStrength(now = new Date()): Promise<ExchangeRatesMarketSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(EXCHANGE_RATES_UK_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; TradingProMacro/1.0; +https://www.exchangerates.org.uk/performance-trends)",
      },
    });
    if (!response.ok) return emptySnapshot(now, "unavailable", `Exchange Rates UK respondeu HTTP ${response.status}; o ranking atual não foi obtido.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("html")) return emptySnapshot(now, "unavailable", "A fonte não retornou HTML; o ranking atual não foi obtido.");
    const html = await response.text();
    return parseExchangeRatesUKHtml(html, now);
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Tempo limite ao consultar Exchange Rates UK; o ranking atual não foi obtido."
      : "Exchange Rates UK indisponível nesta execução; o ranking atual não foi obtido.";
    return emptySnapshot(now, "unavailable", message);
  } finally {
    clearTimeout(timer);
  }
}
