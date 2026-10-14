/**
 * Tabela semântica de indicadores — a DIREÇÃO de cada divulgação é decidida por CÓDIGO, não pela IA.
 *
 *  - surpresa = ATUAL − FORECAST (ou ATUAL − PREVIOUS, com confiança rebaixada, quando não há forecast)
 *  - a regra diz se surpresa POSITIVA é BULLISH ou BEARISH para a moeda do evento
 *  - |surpresa| abaixo do limiar = ruído ⇒ NEUTRAL (efeito zero MENSURADO)
 *  - sem regra, sem ATUAL legível ou sem referência ⇒ UNKNOWN (não pontua)
 *  - falas de diretores/bancos centrais sem texto ⇒ UNKNOWN (regra explícita do produto)
 *
 * Zero = "medido, sem efeito".  UNKNOWN = "não medido". Nunca tratar um como o outro.
 */
import type { Category, Classification, Confidence, Importance } from "@/lib/ai/types";
import { parseNumeric } from "./scoring";

export type Direction = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";

export interface IndicatorRule {
  id: string;
  pattern: RegExp;
  category: Category;
  /** Direção da MOEDA quando o ATUAL fica ACIMA da referência. */
  above_is: "BULLISH" | "BEARISH";
  /** Limiar: absoluto (mesma unidade do valor, ex.: 0.1 = 0,1 p.p.) ou relativo (fração de |referência|). */
  threshold: number;
  threshold_kind: "absolute" | "relative";
  /** Confiança máxima quando a surpresa é calculada contra o FORECAST. */
  reliability: Confidence;
  /** speech = fala sem texto (nunca pontua) · ignore = sem relação direta com a moeda (leilões, estoques de petróleo, feriados). */
  kind?: "indicator" | "speech" | "ignore";
}

/**
 * Ordem importa: a primeira regra que casar vence.
 * Revisar esta tabela é a alavanca para aumentar a cobertura — indicador fora dela fica UNKNOWN (honesto).
 */
export const INDICATOR_RULES: IndicatorRule[] = [
  { id: "speech_no_text", kind: "speech", category: "CENTRAL_BANK", above_is: "BULLISH", threshold: 0, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\b(speaks?|speech|testifies|testify|testimony|press conference|conference|remarks|interview|minutes|statement|summary of opinions)\b/i },
  { id: "not_currency_relevant", kind: "ignore", category: "OTHER", above_is: "BULLISH", threshold: 0, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\b(bank holiday|holiday|auction|crude oil inventories|natural gas storage|gasoline|distillate|imf meetings?|g7 meetings?|g20 meetings?|opec|daylight saving|all day)\b/i },
  { id: "rate_decision", category: "CENTRAL_BANK", above_is: "BULLISH", threshold: 0.01, threshold_kind: "absolute", reliability: "MEDIUM",
    pattern: /\b(interest rate|rate decision|policy rate|cash rate|official bank rate|bank rate|official rate|overnight rate|monetary policy)\b/i },
  { id: "jobless_claims", category: "EMPLOYMENT", above_is: "BEARISH", threshold: 0.02, threshold_kind: "relative", reliability: "MEDIUM",
    pattern: /\b(jobless claims|unemployment claims|claimant count|continuing claims|initial claims)\b/i },
  { id: "unemployment_rate", category: "EMPLOYMENT", above_is: "BEARISH", threshold: 0.1, threshold_kind: "absolute", reliability: "HIGH",
    pattern: /\bunemployment\b|\bjobless rate\b/i },
  { id: "payrolls", category: "EMPLOYMENT", above_is: "BULLISH", threshold: 20000, threshold_kind: "absolute", reliability: "HIGH",
    pattern: /\b(non-?farm|nfp|payrolls?|employment change|adp)\b/i },
  { id: "wages", category: "EMPLOYMENT", above_is: "BULLISH", threshold: 0.1, threshold_kind: "absolute", reliability: "MEDIUM",
    pattern: /\b(average hourly earnings|average earnings|wage growth|wages?)\b/i },
  { id: "housing", category: "HOUSING", above_is: "BULLISH", threshold: 0.03, threshold_kind: "relative", reliability: "MEDIUM",
    pattern: /\b(building permits|building approvals|housing starts|home sales|house prices?|hpi|home price|mortgage approvals|construction (output|spending)|new home|existing home)\b/i },
  { id: "inflation_expectations", category: "INFLATION", above_is: "BULLISH", threshold: 0.1, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\binflation expectations?\b/i },
  { id: "commodity_prices", category: "TRADE", above_is: "BULLISH", threshold: 0.5, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\b(gdt price index|commodity prices|raw materials price index|rmpi|industrial product price|ippi)\b/i },
  { id: "inflation", category: "INFLATION", above_is: "BULLISH", threshold: 0.1, threshold_kind: "absolute", reliability: "HIGH",
    pattern: /^(?!.*(retail|import|export)).*\b(cpi|pce|hicp|ppi|wpi|rpi|inflation|trimmed mean|weighted median|deflator|price index|prices)\b/i },
  { id: "import_export_prices", category: "INFLATION", above_is: "BULLISH", threshold: 0.2, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\b(import prices?|export prices?)\b/i },
  { id: "gdp", category: "GROWTH", above_is: "BULLISH", threshold: 0.1, threshold_kind: "absolute", reliability: "HIGH",
    pattern: /\b(gdp|gross domestic product)\b/i },
  { id: "retail_sales", category: "CONSUMPTION", above_is: "BULLISH", threshold: 0.2, threshold_kind: "absolute", reliability: "HIGH",
    pattern: /\bretail sales\b/i },
  { id: "pmi_ism", category: "ACTIVITY", above_is: "BULLISH", threshold: 0.5, threshold_kind: "absolute", reliability: "MEDIUM",
    pattern: /\b(pmi|ism)\b/i },
  { id: "industrial_activity", category: "ACTIVITY", above_is: "BULLISH", threshold: 0.3, threshold_kind: "absolute", reliability: "MEDIUM",
    pattern: /\b(industrial production|manufacturing production|factory orders|durable goods|capital goods|fixed asset investment|machinery orders|machine tool orders|manufacturing sales|wholesale sales|services index|all industries activity|tertiary industry)\b/i },
  { id: "employment_other", category: "EMPLOYMENT", above_is: "BULLISH", threshold: 0.1, threshold_kind: "absolute", reliability: "MEDIUM",
    pattern: /\b(employment rate|participation rate|job openings|jolts|job vacancies|job advertisements|labou?r market|hiring)\b/i },
  { id: "layoffs", category: "EMPLOYMENT", above_is: "BEARISH", threshold: 0.05, threshold_kind: "relative", reliability: "LOW",
    pattern: /\b(job cuts|layoffs?|redundanc)/i },
  { id: "trade_balance", category: "TRADE", above_is: "BULLISH", threshold: 1e8, threshold_kind: "absolute", reliability: "MEDIUM",
    pattern: /\b(trade balance|merchandise trade|balance of trade|trade surplus|current account|goods trade)\b/i },
  { id: "exports_fdi", category: "TRADE", above_is: "BULLISH", threshold: 0.5, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\b(exports?|foreign direct investment|fdi|foreign investment)\b/i },
  { id: "fiscal_borrowing", category: "FISCAL", above_is: "BEARISH", threshold: 0.05, threshold_kind: "relative", reliability: "LOW",
    pattern: /\b(net borrowing|psnb|budget deficit|deficit)\b/i },
  { id: "fiscal_balance", category: "FISCAL", above_is: "BULLISH", threshold: 0.05, threshold_kind: "relative", reliability: "LOW",
    pattern: /\b(budget balance|federal budget|primary (balance|result)|government balance|fiscal balance)\b/i },
  { id: "leading_index", category: "ACTIVITY", above_is: "BULLISH", threshold: 0.1, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\b(leading index|leading indicators?|leading economic|coincident index|lagging index)\b/i },
  { id: "consumption", category: "CONSUMPTION", above_is: "BULLISH", threshold: 0.2, threshold_kind: "absolute", reliability: "MEDIUM",
    pattern: /\b(personal spending|consumer spending|household spending|personal income|vehicle sales|car registrations|card spending|electronic card)\b/i },
  { id: "productivity_costs", category: "ACTIVITY", above_is: "BULLISH", threshold: 0.2, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\b(productivity|unit labou?r costs?|labou?r cost index|employment cost index|capacity utilization)\b/i },
  { id: "inventories", category: "ACTIVITY", above_is: "BEARISH", threshold: 0.2, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\b(inventories|inventory)\b/i },
  { id: "credit", category: "ACTIVITY", above_is: "BULLISH", threshold: 0.1, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\b(bank lending|new loans|private loans?|loans?|consumer credit|credit growth|credit card|m[1-4]\b|money supply|net lending|total social financing)\b/i },
  { id: "sentiment_confidence", category: "SENTIMENT", above_is: "BULLISH", threshold: 1, threshold_kind: "absolute", reliability: "LOW",
    pattern: /\b(consumer (confidence|sentiment)|sentiment|confidence|michigan|zew|ifo|westpac|economy watchers|tankan|nab|business climate|business conditions|optimism|expectations index|current conditions|anz)\b/i },
];

/**
 * Regra GENÉRICA (fallback) para indicadores fora da tabela que têm ATUAL numérico e referência:
 * a grande maioria dos indicadores macro é "maior = melhor para a moeda" (atividade, consumo, emprego, preços).
 * Exceções conhecidas (desemprego, pedidos de auxílio, estoques, déficit, demissões) são tratadas pela lista inversa.
 * Entra sempre com confiança LOW e categoria OTHER (peso baixo) — é evidência fraca, mas é evidência; nunca "sem dado".
 */
const GENERIC_INVERSE = /\b(unemploy\w*|jobless|claims?|inventor\w*|deficits?|borrowing|bankrupt\w*|delinquen\w*|foreclosur\w*|layoffs?|job cuts|arrears|defaults?)\b/i;
export const GENERIC_RULE_ID = "generic_higher_is_better";
export function genericRule(eventName: string): IndicatorRule {
  const inverse = GENERIC_INVERSE.test(eventName);
  return { id: inverse ? "generic_higher_is_worse" : GENERIC_RULE_ID, category: "OTHER", above_is: inverse ? "BEARISH" : "BULLISH", threshold: 0.02, threshold_kind: "relative", reliability: "LOW", pattern: /./ };
}

export function matchRule(eventName: string): IndicatorRule | null {
  for (const r of INDICATOR_RULES) if (r.pattern.test(eventName)) return r;
  return null;
}

export const IMPACT_TO_IMPORTANCE: Record<string, Importance> = { high: "HIGH", medium: "MEDIUM", low: "LOW", holiday: "LOW", unknown: "LOW" };

export interface ReleaseClassification {
  rule_id: string | null;
  category: Category;
  direction: Direction;
  classification: Classification;
  actual: number | null;
  reference: number | null;
  reference_basis: "FORECAST" | "PREVIOUS" | "NONE";
  surprise: number | null;
  threshold: number | null;
  confidence: Confidence;
  explanation: string;
}

const CLASS_FOR: Record<Exclude<Direction, "UNKNOWN">, (strong: boolean) => Classification> = {
  BULLISH: (s) => (s ? "VERY_BULLISH" : "BULLISH"),
  BEARISH: (s) => (s ? "VERY_BEARISH" : "BEARISH"),
  NEUTRAL: () => "NEUTRAL",
};

const UNKNOWN_CLASS: Classification = "UNKNOWN";

function unknown(rule: IndicatorRule | null, explanation: string, extra: Partial<ReleaseClassification> = {}): ReleaseClassification {
  return {
    rule_id: rule?.id ?? null, category: rule?.category ?? "OTHER", direction: "UNKNOWN", classification: UNKNOWN_CLASS,
    actual: null, reference: null, reference_basis: "NONE", surprise: null, threshold: null, confidence: "LOW", explanation, ...extra,
  };
}

/** Classifica UMA divulgação de forma determinística. Não usa conhecimento externo nem a IA. */
export function classifyRelease(input: {
  event: string; impact: string; actual: string | null; forecast: string | null; previous: string | null; ocrConfidence?: number | null;
}): ReleaseClassification {
  const matched = matchRule(input.event);
  if (matched?.kind === "speech") {
    return unknown(matched, "Evento relevante, mas sem evidência textual suficiente para determinar direção.");
  }
  if (matched?.kind === "ignore") {
    return unknown(matched, "Evento sem relação direta com a força da moeda (feriado, leilão, estoque de commodity) — não pontua.");
  }
  const actual = parseNumeric(input.actual);
  if (actual === null) return unknown(matched, "Sem valor ATUAL legível — não há surpresa a medir.", matched ? { category: matched.category } : {});
  // Fora da tabela, MAS com ATUAL numérico: aplica a regra genérica (confiança baixa) em vez de descartar a moeda.
  const rule = matched ?? genericRule(input.event);
  const generic = !matched;

  const forecast = parseNumeric(input.forecast);
  const previous = parseNumeric(input.previous);
  let ref: number | null = null;
  let basis: ReleaseClassification["reference_basis"] = "NONE";
  if (forecast !== null) { ref = forecast; basis = "FORECAST"; }
  else if (previous !== null) { ref = previous; basis = "PREVIOUS"; }
  if (ref === null) return unknown(rule, "Sem FORECAST nem PREVIOUS — impossível medir surpresa.", { category: rule.category, actual });

  const surprise = actual - ref;
  const threshold = rule.threshold_kind === "relative" ? rule.threshold * Math.max(Math.abs(ref), 1) : rule.threshold;
  // Confiança: limitada pela regra, rebaixada se a leitura OCR é incerta ou se a referência é o PREVIOUS.
  let confidence: Confidence = basis === "FORECAST" ? rule.reliability : "LOW";
  if ((input.ocrConfidence ?? 1) < 0.8) confidence = "LOW";

  if (generic) confidence = "LOW";
  const base = { rule_id: rule.id, category: rule.category, actual, reference: ref, reference_basis: basis, surprise, threshold, confidence };
  const refLabel = basis === "FORECAST" ? "forecast" : "previous";
  const head = `${input.event}: atual ${input.actual} vs ${refLabel} ${input.forecast ?? input.previous}${generic ? " [regra genérica: indicador fora da tabela, direção presumida '" + (rule.above_is === "BULLISH" ? "maior = melhor" : "maior = pior") + "', confiança baixa]" : ""}`;

  // Tolerância de ponto flutuante: 1.0 − 0.8 = 0.19999… não pode ser lido como "abaixo de 0.2".
  if (Math.abs(surprise) + 1e-9 < threshold) {
    return { ...base, direction: "NEUTRAL", classification: CLASS_FOR.NEUTRAL(false),
      explanation: `${head} → surpresa ${surprise.toFixed(2)} dentro do limiar (${threshold.toFixed(2)}) — efeito zero mensurado.` };
  }
  const above = surprise > 0;
  const direction: Direction = above ? rule.above_is : rule.above_is === "BULLISH" ? "BEARISH" : "BULLISH";
  const strong = Math.abs(surprise) >= 2 * threshold;
  return { ...base, direction, classification: CLASS_FOR[direction as "BULLISH" | "BEARISH"](strong),
    explanation: `${head} → surpresa ${surprise > 0 ? "+" : ""}${surprise.toFixed(2)} (limiar ${threshold.toFixed(2)}); ${above ? "acima" : "abaixo"} do ${refLabel} ⇒ ${direction === "BULLISH" ? "moeda mais forte" : "moeda mais fraca"} (regra ${rule.id}${basis === "PREVIOUS" ? ", referência PREVIOUS, confiança rebaixada" : ""}).` };
}
