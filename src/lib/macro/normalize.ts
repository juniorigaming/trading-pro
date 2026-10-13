/**
 * Normalização defensiva dos enums devolvidos pela IA antes de gravar no banco.
 *
 * O zod já valida a resposta, mas o banco (Neon) tem CHECK constraints próprias
 * (ex.: macro_interpretations_classification_check). Para nunca derrubar uma análise
 * inteira por um valor fora do padrão (casing, espaços, sinônimos), convertemos aqui
 * para o enum canônico e registramos um aviso quando houve correção.
 */
import { CATEGORIES, CLASSIFICATIONS, CONFIDENCE, IMPORTANCE, type Category, type Classification, type Confidence, type Importance } from "@/lib/ai/types";

function canon(v: unknown): string {
  return String(v ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_").replace(/[^A-Z_]/g, "");
}

const CLASSIFICATION_ALIASES: Record<string, Classification> = {
  STRONGLY_BULLISH: "VERY_BULLISH", STRONG_BULLISH: "VERY_BULLISH", VERY_POSITIVE: "VERY_BULLISH", STRONG_POSITIVE: "VERY_BULLISH", VERY_STRONG: "VERY_BULLISH", VERY_HAWKISH: "VERY_BULLISH",
  POSITIVE: "BULLISH", HAWKISH: "BULLISH", STRONG: "BULLISH", MODERATELY_BULLISH: "BULLISH", SLIGHTLY_BULLISH: "BULLISH", MODERATELY_STRONG: "BULLISH", MILDLY_BULLISH: "BULLISH",
  MIXED: "NEUTRAL", NONE: "NEUTRAL", UNCHANGED: "NEUTRAL", IN_LINE: "NEUTRAL", INLINE: "NEUTRAL", UNKNOWN: "NEUTRAL",
  NEGATIVE: "BEARISH", DOVISH: "BEARISH", WEAK: "BEARISH", MODERATELY_BEARISH: "BEARISH", SLIGHTLY_BEARISH: "BEARISH", MODERATELY_WEAK: "BEARISH", MILDLY_BEARISH: "BEARISH",
  STRONGLY_BEARISH: "VERY_BEARISH", STRONG_BEARISH: "VERY_BEARISH", VERY_NEGATIVE: "VERY_BEARISH", STRONG_NEGATIVE: "VERY_BEARISH", VERY_WEAK: "VERY_BEARISH", VERY_DOVISH: "VERY_BEARISH",
};

const IMPORTANCE_ALIASES: Record<string, Importance> = {
  VERY_HIGH: "HIGH", CRITICAL: "HIGH", MAJOR: "HIGH", MEDIUMHIGH: "MEDIUM_HIGH", MEDIUM_HIGH_: "MEDIUM_HIGH", MODERATE: "MEDIUM", MID: "MEDIUM", MINOR: "LOW", VERY_LOW: "LOW",
};

const CONFIDENCE_ALIASES: Record<string, Confidence> = { VERY_HIGH: "HIGH", MODERATE: "MEDIUM", MID: "MEDIUM", VERY_LOW: "LOW" };

const CATEGORY_ALIASES: Record<string, Category> = {
  PRICES: "INFLATION", CPI: "INFLATION", LABOR: "EMPLOYMENT", LABOUR: "EMPLOYMENT", JOBS: "EMPLOYMENT", GDP: "GROWTH", PRODUCTION: "ACTIVITY", MANUFACTURING: "ACTIVITY",
  MONETARY_POLICY: "CENTRAL_BANK", RATES: "CENTRAL_BANK", INTEREST_RATE: "CENTRAL_BANK", CENTRALBANK: "CENTRAL_BANK", REAL_ESTATE: "HOUSING", RETAIL: "CONSUMPTION", CONSUMER: "CONSUMPTION",
  CONFIDENCE: "SENTIMENT", SURVEY: "SENTIMENT", EXTERNAL: "TRADE", CURRENT_ACCOUNT: "TRADE", DEBT: "FISCAL", BUDGET: "FISCAL", GOVERNMENT: "FISCAL", MISC: "OTHER", OTHERS: "OTHER",
};

export interface Normalized<T> { value: T; changed: boolean; original: unknown }

function pick<T extends string>(raw: unknown, allowed: readonly T[], aliases: Record<string, T>, fallback: T): Normalized<T> {
  const c = canon(raw);
  if ((allowed as readonly string[]).includes(c)) return { value: c as T, changed: c !== raw, original: raw };
  if (aliases[c]) return { value: aliases[c], changed: true, original: raw };
  // tentativa por prefixo/contém (ex.: "BULLISH_FOR_USD" → BULLISH; "VERY_BULLISH_USD" → VERY_BULLISH)
  const hit = [...allowed].sort((a, b) => b.length - a.length).find((a) => c.includes(a));
  if (hit) return { value: hit, changed: true, original: raw };
  return { value: fallback, changed: true, original: raw };
}

export const normalizeClassification = (raw: unknown) => pick<Classification>(raw, CLASSIFICATIONS, CLASSIFICATION_ALIASES, "NEUTRAL");
export const normalizeImportance = (raw: unknown) => pick<Importance>(raw, IMPORTANCE, IMPORTANCE_ALIASES, "MEDIUM");
export const normalizeConfidence = (raw: unknown) => pick<Confidence>(raw, CONFIDENCE, CONFIDENCE_ALIASES, "LOW");
export const normalizeCategory = (raw: unknown) => pick<Category>(raw, CATEGORIES, CATEGORY_ALIASES, "OTHER");

export interface InterpretationEnums { category: Category; importance: Importance; classification: Classification; confidence: Confidence }

/** Normaliza os 4 enums de uma interpretação; devolve também a lista de correções feitas (para warnings/logs). */
export function normalizeInterpretationEnums(it: { category: unknown; importance: unknown; classification: unknown; confidence: unknown }): { enums: InterpretationEnums; fixes: string[] } {
  const cat = normalizeCategory(it.category), imp = normalizeImportance(it.importance), cls = normalizeClassification(it.classification), conf = normalizeConfidence(it.confidence);
  const fixes: string[] = [];
  if (cat.changed) fixes.push(`category "${String(cat.original)}" → ${cat.value}`);
  if (imp.changed) fixes.push(`importance "${String(imp.original)}" → ${imp.value}`);
  if (cls.changed) fixes.push(`classification "${String(cls.original)}" → ${cls.value}`);
  if (conf.changed) fixes.push(`confidence "${String(conf.original)}" → ${conf.value}`);
  return { enums: { category: cat.value, importance: imp.value, classification: cls.value, confidence: conf.value }, fixes };
}

/** Extrai a mensagem útil de um erro do driver pg/drizzle (inclui `.cause`, constraint e detail). */
export function dbErrorMessage(e: unknown): string {
  const err = e as { message?: string; cause?: { message?: string; constraint?: string; detail?: string; code?: string } };
  const cause = err?.cause;
  const parts = [cause?.message || err?.message || String(e)];
  if (cause?.constraint) parts.push(`constraint=${cause.constraint}`);
  if (cause?.detail) parts.push(cause.detail);
  if (cause?.code) parts.push(`code=${cause.code}`);
  return parts.join(" | ");
}
