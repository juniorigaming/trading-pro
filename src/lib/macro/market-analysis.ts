import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { economicEvents, macroInterpretations } from "@/db/schema";
import { G8, type Currency } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/service";
import { MACRO_MARKET_ANALYSIS } from "@/lib/ai/prompts";
import { MARKET_REPORT_SECTION_IDS, type MacroMarketAnalysis } from "@/lib/ai/schemas";
import { fetchCentralBankPolicySnapshots } from "./central-bank-sources";
import { fetchExchangeRatesUKStrength } from "./exchange-rates-uk";
import { buildPairAsymmetries, buildPriceFundamentalDivergences } from "./market-analysis-derivations";
import {
  MARKET_REPORT_SECTION_TITLES,
  type CentralBankPolicySnapshot,
  type ExchangeRatesMarketSnapshot,
  type MacroEvidenceEvent,
  type MacroEvidenceSnapshot,
  type MarketCurrencyNarrative,
  type MarketKeyRisk,
  type MarketMacroAnalysisResponse,
  type MarketNarrativeSection,
} from "./market-analysis-types";

const MAX_RELEASED_EVENTS = 100;
const MAX_UPCOMING_EVENTS = 50;
const MODEL_RELEASED_EVENTS = 80;
const MODEL_UPCOMING_EVENTS = 40;
const EVIDENCE_WINDOW_DAYS = 120;
const UPCOMING_WINDOW_DAYS = 14;

export interface SupplementalMarketEvent {
  date: string | null;
  time: string | null;
  currency: Currency;
  event: string;
  impact: "high" | "medium" | "low" | "holiday" | "unknown";
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: "screenshot_ai" | "calendar_api" | "manual";
  ocrConfidence: number | null;
  userConfirmed: true;
}

function normalizedEventName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function eventKey(event: Pick<MacroEvidenceEvent, "currency" | "date" | "event">): string {
  return `${event.currency}|${event.date ?? "undated"}|${normalizedEventName(event.event)}`;
}

function mapStoredReleased(row: {
  id: number; currency: string; event: string; impact: string; scheduledAt: Date; actual: string | null;
  forecast: string | null; previous: string | null; source: string; category: string | null; importance: string | null;
  classification: string | null; surpriseVsForecast: string | null; centralBankImplication: string | null;
  currencyImplication: string | null; confidence: string | null; reasoningSummary: string | null;
}): MacroEvidenceEvent | null {
  if (!row.actual?.trim() || !(G8 as readonly string[]).includes(row.currency)) return null;
  const interpretation = row.reasoningSummary ? {
    category: row.category ?? "OTHER",
    importance: row.importance ?? "UNKNOWN",
    classification: row.classification ?? "UNKNOWN",
    surpriseVsForecast: row.surpriseVsForecast,
    centralBankImplication: row.centralBankImplication ?? "NA",
    currencyImplication: row.currencyImplication ?? "NEUTRAL",
    confidence: row.confidence ?? "LOW",
    reasoningSummary: row.reasoningSummary,
  } : null;
  return {
    id: String(row.id),
    currency: row.currency as Currency,
    event: row.event,
    date: row.scheduledAt.toISOString().slice(0, 10),
    scheduledAt: row.scheduledAt.toISOString(),
    impact: row.impact,
    actual: row.actual,
    forecast: row.forecast,
    previous: row.previous,
    source: row.source,
    kind: "released",
    origin: "saved_database",
    interpretation,
  };
}

function mapStoredUpcoming(row: { id: number; currency: string; event: string; impact: string; scheduledAt: Date; forecast: string | null; previous: string | null; source: string }): MacroEvidenceEvent | null {
  if (!(G8 as readonly string[]).includes(row.currency)) return null;
  return {
    id: String(row.id), currency: row.currency as Currency, event: row.event,
    date: row.scheduledAt.toISOString().slice(0, 10), scheduledAt: row.scheduledAt.toISOString(),
    impact: row.impact, actual: null, forecast: row.forecast, previous: row.previous, source: row.source,
    kind: "upcoming", origin: "saved_database", interpretation: null,
  };
}

function mapSupplementalEvent(row: SupplementalMarketEvent, index: number, today: string): MacroEvidenceEvent | null {
  const actual = row.actual?.trim() || null;
  const date = row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null;
  const kind = actual ? "released" : "upcoming";
  if (!actual && (!date || date < today)) return null;
  return {
    id: `input:${index + 1}`,
    currency: row.currency,
    event: row.event.trim(),
    date,
    scheduledAt: date ? `${date}${row.time ? ` ${row.time}` : ""}` : null,
    impact: row.impact,
    actual,
    forecast: row.forecast?.trim() || null,
    previous: row.previous?.trim() || null,
    source: row.source,
    kind,
    origin: "user_confirmed",
    interpretation: null,
  };
}

function mergePreferSupplemental(database: MacroEvidenceEvent[], supplemental: MacroEvidenceEvent[]): MacroEvidenceEvent[] {
  const map = new Map(database.map((row) => [eventKey(row), row]));
  for (const row of supplemental) {
    const key = eventKey(row);
    const existing = map.get(key);
    const sameNumbers = existing?.actual === row.actual && existing?.forecast === row.forecast && existing?.previous === row.previous;
    map.set(key, sameNumbers && existing?.interpretation ? { ...row, interpretation: existing.interpretation } : row);
  }
  return [...map.values()];
}

function emptyEvidence(now: Date, released: MacroEvidenceEvent[], upcoming: MacroEvidenceEvent[], supplementsCount: number, excludedCount: number, message: string): MacroEvidenceSnapshot {
  return {
    status: "unavailable", retrievedAt: now.toISOString(), released: released.slice(0, MAX_RELEASED_EVENTS),
    upcoming: upcoming.slice(0, MAX_UPCOMING_EVENTS), supplementalCount: supplementsCount,
    excludedUnconfirmedCount: excludedCount, message,
  };
}

/** Somente SELECT em economic_events e macro_interpretations. Não recalcula nem grava scores/interpretações. */
async function loadMacroEvidence(now: Date, supplements: SupplementalMarketEvent[], excludedUnconfirmedCount: number): Promise<MacroEvidenceSnapshot> {
  const today = now.toISOString().slice(0, 10);
  const recentFrom = new Date(now.getTime() - EVIDENCE_WINDOW_DAYS * 86_400_000);
  const upcomingTo = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86_400_000);
  const supplemental = supplements.map((row, index) => mapSupplementalEvent(row, index, today)).filter((row): row is MacroEvidenceEvent => row !== null);
  try {
    const db = getDb();
    const [releasedRows, upcomingRows] = await Promise.all([
      db.select({
        id: economicEvents.id, currency: economicEvents.currency, event: economicEvents.event, impact: economicEvents.impact,
        scheduledAt: economicEvents.scheduledAt, actual: economicEvents.actual, forecast: economicEvents.forecast,
        previous: economicEvents.previous, source: economicEvents.source,
        category: macroInterpretations.category, importance: macroInterpretations.importance, classification: macroInterpretations.classification,
        surpriseVsForecast: macroInterpretations.surpriseVsForecast, centralBankImplication: macroInterpretations.centralBankImplication,
        currencyImplication: macroInterpretations.currencyImplication, confidence: macroInterpretations.confidence,
        reasoningSummary: macroInterpretations.reasoningSummary,
      }).from(economicEvents)
        .leftJoin(macroInterpretations, and(eq(macroInterpretations.eventId, economicEvents.id), eq(macroInterpretations.isCurrent, true)))
        .where(and(
          eq(economicEvents.status, "released"), inArray(economicEvents.currency, [...G8]),
          gte(economicEvents.scheduledAt, recentFrom), isNull(economicEvents.supersededBy),
          eq(economicEvents.requiresManualConfirmation, false),
        ))
        .orderBy(desc(economicEvents.scheduledAt)).limit(MAX_RELEASED_EVENTS),
      db.select({
        id: economicEvents.id, currency: economicEvents.currency, event: economicEvents.event, impact: economicEvents.impact,
        scheduledAt: economicEvents.scheduledAt, forecast: economicEvents.forecast, previous: economicEvents.previous, source: economicEvents.source,
      }).from(economicEvents)
        .where(and(
          eq(economicEvents.status, "pending"), inArray(economicEvents.currency, [...G8]),
          gte(economicEvents.scheduledAt, now), lte(economicEvents.scheduledAt, upcomingTo),
          isNull(economicEvents.supersededBy), eq(economicEvents.requiresManualConfirmation, false),
        ))
        .orderBy(economicEvents.scheduledAt).limit(MAX_UPCOMING_EVENTS),
    ]);
    const releasedDb = releasedRows.map(mapStoredReleased).filter((row): row is MacroEvidenceEvent => row !== null);
    const upcomingDb = upcomingRows.map(mapStoredUpcoming).filter((row): row is MacroEvidenceEvent => row !== null);
    const releasedSupplemental = supplemental.filter((row) => row.kind === "released");
    const upcomingSupplemental = supplemental.filter((row) => row.kind === "upcoming");
    const released = mergePreferSupplemental(releasedDb, releasedSupplemental).sort((a, b) => (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? ""));
    const upcoming = mergePreferSupplemental(upcomingDb, upcomingSupplemental).sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
    return {
      status: "available", retrievedAt: now.toISOString(), released: released.slice(0, MAX_RELEASED_EVENTS),
      upcoming: upcoming.slice(0, MAX_UPCOMING_EVENTS), supplementalCount: supplemental.length,
      excludedUnconfirmedCount, message: null,
    };
  } catch {
    return emptyEvidence(
      now, supplemental.filter((row) => row.kind === "released"), supplemental.filter((row) => row.kind === "upcoming"),
      supplemental.length, excludedUnconfirmedCount,
      "Eventos salvos/leituras correntes do banco indisponíveis nesta execução; somente eventos confirmados enviados agora podem ser usados.",
    );
  }
}

function clampRefs(refs: string[] | undefined, allowed: Set<string>): string[] {
  if (!Array.isArray(refs)) return [];
  return [...new Set(refs.filter((ref) => allowed.has(ref)))].slice(0, 12);
}

function fallbackCurrencyView(currency: Currency): MarketCurrencyNarrative {
  return {
    currency,
    fundamentalBias: "INSUFFICIENT_DATA",
    fundamentalQuality: "INSUFFICIENT_DATA",
    policyStance: "UNAVAILABLE",
    confidence: "LOW",
    summary: "Não foi possível gerar uma avaliação fundamental validada para esta moeda nesta execução.",
    drivers: [], risks: [], evidenceRefs: [],
  };
}

function policyHasNarrativeEvidence(policy: CentralBankPolicySnapshot | undefined): boolean {
  if (policy?.status !== "available" || !policy.excerpt?.trim()) return false;
  if (policy.currency === "EUR" && policy.excerpt.startsWith("Taxas oficiais BCE:")) return false;
  return /\b(decision|decided|maintain(?:ed)?|increase(?:d)?|raise|raised|reduce(?:d)?|unchanged|outlook|guidance|inflation|committee|board)\b/i.test(policy.excerpt);
}

function normalizeNarrative(
  raw: MacroMarketAnalysis,
  allowedRefs: Set<string>,
  evidence: MacroEvidenceSnapshot,
  policies: CentralBankPolicySnapshot[],
) {
  const eventsById = new Map([...evidence.released, ...evidence.upcoming].map((event) => [event.id, event]));
  const policiesByCurrency = new Map(policies.map((policy) => [policy.currency, policy]));
  const currencyEvidenceRefs = (currency: Currency, refs: string[] | undefined) => clampRefs(refs, allowedRefs).filter((ref) => {
    if (ref.startsWith("event:")) return eventsById.get(ref.slice("event:".length))?.currency === currency;
    return ref === `policy:${currency}`;
  });
  const rawSections = new Map<string, MacroMarketAnalysis["sections"][number]>();
  for (const section of raw.sections) if (!rawSections.has(section.id)) rawSections.set(section.id, section);
  const sections: MarketNarrativeSection[] = MARKET_REPORT_SECTION_IDS.map((id) => {
    const item = rawSections.get(id);
    return {
      id,
      title: MARKET_REPORT_SECTION_TITLES[id],
      summary: item?.summary?.trim() || "A IA não retornou uma síntese para este bloco.",
      observations: (item?.observations ?? []).filter(Boolean).slice(0, 6),
      evidenceRefs: clampRefs(item?.evidenceRefs, allowedRefs),
    };
  });
  const byCurrency = new Map<Currency, MacroMarketAnalysis["currencyViews"][number]>();
  for (const item of raw.currencyViews) if ((G8 as readonly string[]).includes(item.currency) && !byCurrency.has(item.currency)) byCurrency.set(item.currency, item);
  const currencyViews: MarketCurrencyNarrative[] = G8.map((currency) => {
    const item = byCurrency.get(currency);
    if (!item) return fallbackCurrencyView(currency);
    const evidenceRefs = currencyEvidenceRefs(currency, item.evidenceRefs);
    const currencyEvents = evidenceRefs.map((ref) => eventsById.get(ref.slice("event:".length)))
      .filter((event): event is MacroEvidenceEvent => !!event && event.kind === "released" && !!event.actual);
    const policy = policiesByCurrency.get(currency);
    const policyNarrative = policyHasNarrativeEvidence(policy) && evidenceRefs.includes(`policy:${currency}`);
    const hasFundamentalEvidence = currencyEvents.length > 0 || policyNarrative;
    return {
      currency,
      fundamentalBias: hasFundamentalEvidence ? item.fundamentalBias : "INSUFFICIENT_DATA",
      fundamentalQuality: hasFundamentalEvidence ? item.fundamentalQuality : "INSUFFICIENT_DATA",
      policyStance: policy?.status !== "available" ? "UNAVAILABLE" : policyNarrative ? item.policyStance : "UNCLEAR",
      confidence: hasFundamentalEvidence ? item.confidence : "LOW",
      summary: hasFundamentalEvidence ? item.summary.trim() : "Sem evidência macro realizada ou orientação oficial verificável suficiente para atribuir um viés fundamental nesta execução.",
      drivers: hasFundamentalEvidence ? item.drivers.filter(Boolean).slice(0, 6) : [],
      risks: evidenceRefs.length ? item.risks.filter(Boolean).slice(0, 6) : [],
      evidenceRefs,
    };
  });
  const externalFactors = raw.externalFactors.slice(0, 12).map((item) => {
    const evidenceRefs = clampRefs(item.evidenceRefs, allowedRefs);
    const evidenced = item.status === "EVIDENCED" && evidenceRefs.length > 0;
    return {
      name: item.name,
      status: evidenced ? "EVIDENCED" as const : "UNAVAILABLE" as const,
      impact: evidenced ? item.impact : "UNKNOWN" as const,
      currencies: item.currencies.filter((currency) => (G8 as readonly string[]).includes(currency)).slice(0, G8.length),
      detail: evidenced ? item.detail : item.status === "EVIDENCED" ? "A IA não vinculou referência verificável; este fator foi mantido como indisponível." : item.detail,
      evidenceRefs,
    };
  });
  const keyRisks: MarketKeyRisk[] = raw.keyRisks.slice(0, 12).map((item) => {
    const evidenceRefs = clampRefs(item.evidenceRefs, allowedRefs);
    return {
      risk: item.risk,
      trigger: item.trigger,
      currencies: item.currencies.filter((currency) => (G8 as readonly string[]).includes(currency)).slice(0, G8.length),
      confidence: evidenceRefs.length ? item.confidence : "LOW",
      evidenceRefs,
    };
  }).filter((item) => item.evidenceRefs.length > 0);
  return {
    headline: raw.headline.trim() || "Análise macro G8 — consulte os dados estruturados e avisos.",
    executiveSummary: raw.executiveSummary.trim() || "Resumo não fornecido pela IA.",
    sections,
    currencyViews,
    externalFactors: externalFactors.length ? externalFactors : [{
      name: "Geopolítica, commodities e risco global",
      status: "UNAVAILABLE" as const,
      impact: "UNKNOWN" as const,
      currencies: [],
      detail: "Nenhuma evidência validada específica foi fornecida para estes fatores nesta execução.",
      evidenceRefs: [],
    }],
    keyRisks,
  };
}

function emptyNarrative(message: string) {
  return {
    headline: "Análise qualitativa indisponível nesta execução.",
    executiveSummary: message,
    sections: MARKET_REPORT_SECTION_IDS.map((id) => ({
      id, title: MARKET_REPORT_SECTION_TITLES[id], summary: message,
      observations: ["Nenhuma conclusão fundamental foi inventada."], evidenceRefs: [],
    })),
    currencyViews: G8.map(fallbackCurrencyView),
    externalFactors: [{ name: "Fatores externos", status: "UNAVAILABLE" as const, impact: "UNKNOWN" as const, currencies: [], detail: message, evidenceRefs: [] }],
    keyRisks: [],
  };
}

function buildAllowedRefs(evidence: MacroEvidenceSnapshot, market: ExchangeRatesMarketSnapshot, policies: CentralBankPolicySnapshot[]): Set<string> {
  const refs = new Set<string>();
  if (market.currentRankingAvailable) refs.add("strength:1d");
  if (market.weeklyRankingAvailable) refs.add("strength:1w");
  if (market.currentRankingAvailable && market.persistence.fiveDay.some((row) => row.value !== null)) refs.add("heatmap:5d");
  if (market.currentRankingAvailable && market.persistence.monthToDate.some((row) => row.value !== null)) refs.add("heatmap:mtd");
  for (const policy of policies) if (policy.status === "available") refs.add(`policy:${policy.currency}`);
  for (const event of [...evidence.released.slice(0, MODEL_RELEASED_EVENTS), ...evidence.upcoming.slice(0, MODEL_UPCOMING_EVENTS)]) refs.add(`event:${event.id}`);
  return refs;
}

function rawPairAsymmetry(market: ExchangeRatesMarketSnapshot) {
  if (!market.currentRankingAvailable) return [];
  const scores = new Map(market.primaryRanking.map((row) => [row.currency, row.score]));
  const rows: { pair: string; base: Currency; quote: Currency; scoreDifference: number; strongerByPrice: Currency | "TIED" }[] = [];
  for (let i = 0; i < G8.length; i++) for (let j = i + 1; j < G8.length; j++) {
    const base = G8[i] as Currency, quote = G8[j] as Currency;
    const baseScore = scores.get(base), quoteScore = scores.get(quote);
    if (baseScore == null || quoteScore == null) continue;
    const difference = baseScore - quoteScore;
    rows.push({ pair: `${base}/${quote}`, base, quote, scoreDifference: difference, strongerByPrice: difference > 0 ? base : difference < 0 ? quote : "TIED" });
  }
  return rows.sort((a, b) => Math.abs(b.scoreDifference) - Math.abs(a.scoreDifference)).slice(0, 12);
}

function modelInput(market: ExchangeRatesMarketSnapshot, policies: CentralBankPolicySnapshot[], evidence: MacroEvidenceSnapshot, refs: Set<string>, now: Date) {
  const currentRanking = market.currentRankingAvailable ? market.primaryRanking : [];
  const weeklyRanking = market.weeklyRankingAvailable ? market.weeklyRanking : [];
  const recentEvents = evidence.released.slice(0, MODEL_RELEASED_EVENTS);
  const upcomingEvents = evidence.upcoming.slice(0, MODEL_UPCOMING_EVENTS);
  return {
    analysisAsOf: now.toISOString(),
    primarySource: {
      name: "Exchange Rates UK — Currency Strength Meter",
      url: market.sourceUrl,
      updatedAt: market.updatedAt,
      ageHours: market.ageHours,
      status: market.status,
      currentRankingAvailable: market.currentRankingAvailable,
      rankingMessage: market.rankingMessage,
      weeklyRankingAvailable: market.weeklyRankingAvailable,
      weeklyRankingMessage: market.weeklyRankingMessage,
      requiredPeriods: ["1D / Today", "1W"],
      g8Ranking1D: currentRanking,
      g8Ranking1W: weeklyRanking,
      persistence: {
        oneDayOfficial: currentRanking.map((row) => ({ currency: row.currency, score: row.score, g8Rank: row.g8Rank, sourceRank: row.sourceRank })),
        oneWeekOfficial: weeklyRanking.map((row) => ({ currency: row.currency, score: row.score, g8Rank: row.g8Rank, sourceRank: row.sourceRank })),
        fiveDayDerivedHeatmapMedian: market.persistence.fiveDay,
        monthToDateDerivedHeatmapMedian: market.persistence.monthToDate,
        yearToDateOfficialMeter: market.persistence.yearToDate,
        methodNotes: market.persistence.notes,
      },
    },
    officialCentralBanks: policies.map((policy) => ({
      currency: policy.currency,
      bank: policy.bank,
      status: policy.status,
      rateText: policy.rateText,
      rateLow: policy.rateLow,
      rateHigh: policy.rateHigh,
      asOf: policy.asOf,
      asOfMeaning: policy.asOfMeaning,
      latestDecisionAt: policy.latestDecisionAt,
      nextDecision: policy.nextDecision,
      sourceUrl: policy.sourceUrl,
      decisionUrl: policy.decisionUrl,
      excerpt: policy.excerpt?.slice(0, 1_200) ?? null,
      detail: policy.detail,
    })),
    savedAndUserConfirmedEvidence: {
      databaseStatus: evidence.status,
      databaseMessage: evidence.message,
      releasedEvents: recentEvents,
      upcomingEvents,
      excludedUnconfirmedCount: evidence.excludedUnconfirmedCount,
    },
    marketAsymmetriesForContextOnly: rawPairAsymmetry(market),
    evidenceRefsAvailableToCite: [...refs],
    notCollected: [
      "Não foi consultado feed validado de notícias/geopolítica em tempo real.",
      "Não foi consultado feed independente de preços de commodities, DXY, yields ou probabilidade de mercado para cortes/altas.",
      "Nenhum dado ausente deve ser preenchido por conhecimento paramétrico.",
    ],
  };
}

export async function runMarketMacroAnalysis(input: {
  supplementalEvents?: SupplementalMarketEvent[];
  excludedUnconfirmedCount?: number;
  now?: Date;
} = {}): Promise<MarketMacroAnalysisResponse> {
  const now = input.now ?? new Date();
  const [marketStrength, policyRates, evidence] = await Promise.all([
    fetchExchangeRatesUKStrength(now),
    fetchCentralBankPolicySnapshots(now),
    loadMacroEvidence(now, input.supplementalEvents ?? [], input.excludedUnconfirmedCount ?? 0),
  ]);
  const allowedRefs = buildAllowedRefs(evidence, marketStrength, policyRates);
  const warnings: string[] = [];
  if (!marketStrength.currentRankingAvailable) warnings.push(marketStrength.rankingMessage);
  else if (marketStrength.status === "partial") warnings.push(marketStrength.rankingMessage);
  const unavailablePolicies = policyRates.filter((policy) => policy.status !== "available").map((policy) => policy.currency);
  if (unavailablePolicies.length) warnings.push(`Taxa/fonte oficial indisponível nesta execução para: ${unavailablePolicies.join(", ")}. Esses campos ficam sem dado; não foram estimados.`);
  if (evidence.status === "unavailable") warnings.push(evidence.message ?? "Eventos econômicos salvos indisponíveis nesta execução.");
  if (evidence.excludedUnconfirmedCount > 0) warnings.push(`${evidence.excludedUnconfirmedCount} evento(s) não confirmado(s) nos screenshots foram excluídos da análise direta.`);
  if (!evidence.released.length) warnings.push("Nenhum evento recente com Actual confirmado foi encontrado nas evidências enviadas ou salvas.");
  warnings.push("Força de preço D1/W1 e score macro por eventos permanecem em dimensões separadas.");

  let analysisStatus: MarketMacroAnalysisResponse["analysisStatus"] = "unavailable";
  let ai: MarketMacroAnalysisResponse["ai"] = { provider: "unavailable", model: "—", promptVersion: MACRO_MARKET_ANALYSIS.version, latencyMs: null };
  let narrative: MarketMacroAnalysisResponse["narrative"] = emptyNarrative("A camada qualitativa de IA não respondeu. Os dados-fonte, se disponíveis, continuam separados abaixo.");
  try {
    const generated = await generateStructured({
      purpose: "macro_market_analysis",
      logCall: false,
      prompt: MACRO_MARKET_ANALYSIS,
      schemaName: "macro_market_analysis",
      temperature: 0.15,
      maxOutputTokens: 8_000,
      timeoutMs: 90_000,
      user: JSON.stringify(modelInput(marketStrength, policyRates, evidence, allowedRefs, now)),
    });
    analysisStatus = generated.provider === "mock" ? "mock" : "available";
    ai = { provider: generated.provider, model: generated.model, promptVersion: generated.promptVersion, latencyMs: generated.latencyMs };
    narrative = normalizeNarrative(generated.data, allowedRefs, evidence, policyRates);
    if (analysisStatus === "mock") warnings.push("Provider MOCK: a camada qualitativa é simulada e NÃO deve ser usada como análise real. Fonte/ranking estruturados permanecem identificados separadamente.");
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 220) : "erro desconhecido";
    warnings.push(`Análise qualitativa de IA indisponível: ${message}. Nenhuma conclusão qualitativa foi fabricada.`);
  }

  const divergences = buildPriceFundamentalDivergences(marketStrength, narrative.currencyViews);
  const pairAsymmetries = buildPairAsymmetries(marketStrength, narrative.currencyViews, policyRates, 12);
  if (!marketStrength.currentRankingAvailable) warnings.push("Divergências preço-fundamentos e combinações de força não foram calculadas porque não há ranking 1D atual validado.");
  warnings.push("Assimetria de força e diferenciais de taxa são contexto descritivo; não geram recomendação automática de compra ou venda.");

  return {
    generatedAt: now.toISOString(),
    analysisStatus,
    ai,
    marketStrength,
    policyRates,
    evidence,
    narrative,
    divergences,
    pairAsymmetries,
    warnings: [...new Set(warnings)],
  };
}
