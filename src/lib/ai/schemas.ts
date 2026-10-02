/**
 * Structured Output schemas (Zod → JSON Schema).
 * Todas as respostas da IA são validadas aqui antes de alimentar o dashboard.
 */
import { z } from "zod";
import { CATEGORIES, CLASSIFICATIONS, CONFIDENCE, DISQUALIFIERS, ERROR_TAGS, IMPORTANCE, TIMEFRAMES } from "./types";

const nullableStr = z.string().nullable();
const currencyOcr = z.enum(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY", "OTHER"]);

// ---------------------------------------------------------------------------
// 1) OCR do calendário econômico
// ---------------------------------------------------------------------------
export const CalendarExtractionSchema = z.object({
  source_type: z.enum(["forexfactory", "investing", "tradingview", "other"]),
  detected_timezone: nullableStr.describe("Fuso aparente do screenshot, ex. 'GMT-3'; null se não visível"),
  rows: z.array(
    z.object({
      date: nullableStr.describe("YYYY-MM-DD como exibido; null se ilegível"),
      time: nullableStr.describe("HH:MM 24h no fuso do screenshot; 'all_day' ou 'tentative' quando aplicável"),
      currency: currencyOcr,
      event: z.string(),
      impact: z.enum(["high", "medium", "low", "holiday", "unknown"]),
      actual: nullableStr.describe("Texto exato. null se vazio/ilegível/não divulgado. NUNCA copiar forecast."),
      forecast: nullableStr,
      previous: nullableStr,
      status: z.enum(["released", "pending"]).describe("released somente se actual legível"),
      ocr_confidence: z.number().min(0).max(1),
      requires_manual_confirmation: z.boolean(),
      ocr_issues: z.array(z.enum(["blurry", "cut_off", "ambiguous_sign", "ambiguous_decimal", "overlapping_text", "color_only_impact", "revision_suspected", "none"])),
    }),
  ),
  overall_ocr_confidence: z.number().min(0).max(1),
  notes: z.array(z.string()),
});
export type CalendarExtraction = z.infer<typeof CalendarExtractionSchema>;

// ---------------------------------------------------------------------------
// 2) Interpretação macro por evento
// ---------------------------------------------------------------------------
export const EventInterpretationSchema = z.object({
  interpretations: z.array(
    z.object({
      event_id: z.number().int(),
      category: z.enum(CATEGORIES),
      subcategory: z.string().describe("snake_case: core_cpi_mom, nfp, unemployment_rate, rate_decision, pmi_services_flash, ..."),
      importance: z.enum(IMPORTANCE),
      surprise_vs_forecast: z.enum(["BEAT", "INLINE", "MISS", "NA"]),
      change_vs_previous: z.enum(["HIGHER", "SAME", "LOWER", "NA"]),
      classification: z.enum(CLASSIFICATIONS).describe("Para a MOEDA do evento"),
      growth_implication: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "NA"]),
      inflation_implication: z.enum(["HOTTER", "NEUTRAL", "COOLER", "NA"]),
      central_bank: z.enum(["FED", "ECB", "BOE", "BOJ", "SNB", "BOC", "RBA", "RBNZ"]),
      central_bank_implication: z.enum(["MORE_HAWKISH", "SLIGHTLY_HAWKISH", "UNCHANGED", "SLIGHTLY_DOVISH", "MORE_DOVISH", "NA"]),
      priced_in: z.enum(["FULLY_PRICED", "MOSTLY_PRICED", "PARTIALLY_PRICED", "SURPRISE", "UNKNOWN"]),
      currency_implication: z.enum(["STRONG_POSITIVE", "POSITIVE", "NEUTRAL", "NEGATIVE", "STRONG_NEGATIVE"]),
      confidence: z.enum(CONFIDENCE),
      reasoning_summary: z.string().describe("2-4 frases pt-BR: dado → crescimento/inflação → política monetária → juros → moeda"),
    }),
  ),
});
export type EventInterpretation = z.infer<typeof EventInterpretationSchema>;

// ---------------------------------------------------------------------------
// 3) Brief de sessão (narrativa sobre números já calculados)
// ---------------------------------------------------------------------------
export const SessionBriefSchema = z.object({
  headline: z.string(),
  narrative: z.string(),
  candidate_reasons: z.array(z.object({ symbol: z.string(), reason: z.string(), what_to_look_for: z.string(), invalidation: z.string() })),
  pairs_to_avoid: z.array(z.object({ symbol: z.string(), reason: z.string() })),
  warnings: z.array(z.string()),
});
export type SessionBrief = z.infer<typeof SessionBriefSchema>;

// ---------------------------------------------------------------------------
// 4) Análise técnica SMC/ICT
// ---------------------------------------------------------------------------
const tfEnum = z.enum(TIMEFRAMES);
export const TechnicalAnalysisSchema = z.object({
  symbol: z.string(),
  image_quality: z.enum(["GOOD", "ACCEPTABLE", "POOR"]),
  macro_bias: z.enum(["LONG", "SHORT", "NEUTRAL", "UNKNOWN"]),
  htf_bias: z.enum(["BULLISH", "BEARISH", "RANGING", "UNCLEAR"]),
  draw_on_liquidity: z.array(z.object({
    target: z.string(), direction: z.enum(["UP", "DOWN"]), timeframe: tfEnum, confidence: z.enum(CONFIDENCE),
  })),
  timeframes: z.array(z.object({
    timeframe: tfEnum,
    structure: z.enum(["BULLISH", "BEARISH", "RANGING", "UNCLEAR"]),
    premium_discount: z.enum(["PREMIUM", "DISCOUNT", "EQUILIBRIUM", "UNCLEAR"]),
    liquidity_pools: z.array(z.object({
      type: z.enum(["BSL", "SSL", "EQH", "EQL", "PDH", "PDL", "SESSION_HIGH", "SESSION_LOW"]),
      location: z.string(), status: z.enum(["UNTOUCHED", "SWEPT", "PARTIALLY_SWEPT"]),
    })),
    protected_high: nullableStr, protected_low: nullableStr,
    observations: z.string(),
  })),
  poi: z.array(z.object({
    type: z.enum(["OB", "BREAKER", "FVG", "IFVG", "CRT", "MITIGATION_BLOCK", "OTHER"]),
    direction: z.enum(["BULLISH", "BEARISH"]), timeframe: tfEnum, location: z.string(),
    status: z.enum(["UNTESTED", "BEING_TESTED", "MITIGATED", "INVALIDATED"]), quality_note: z.string(),
  })),
  location: z.object({
    htf_premium_discount: z.enum(["PREMIUM", "DISCOUNT", "EQUILIBRIUM", "UNCLEAR"]),
    poi_reached: z.boolean(), poi_description: nullableStr, is_extended: z.boolean(),
  }),
  liquidity_sweep: z.boolean(),
  liquidity_sweep_detail: z.object({ timeframe: tfEnum.nullable(), description: nullableStr }),
  rejection: z.boolean(),
  displacement: z.boolean(),
  displacement_detail: z.object({ timeframe: tfEnum.nullable(), created_fvg: z.boolean(), description: nullableStr }),
  mss: z.object({
    present: z.boolean(),
    type: z.enum(["INTERNAL_MSS", "EXTERNAL_MSS", "NONE"]),
    timeframe: tfEnum.nullable(),
    follow_through: z.boolean(),
    broke_what: nullableStr,
  }),
  retest: z.object({ occurred: z.boolean(), poi_type: z.enum(["FVG", "OB", "BREAKER", "IFVG", "NONE"]), description: nullableStr }),
  entry_model: z.enum(["NONE", "MODEL_A_AGGRESSIVE", "MODEL_B_CONFIRMED"]),
  setup_grade: z.enum(["A", "B", "C", "NO_TRADE"]),
  status: z.enum(["READY", "WAIT", "INVALID"]),
  disqualifiers: z.array(z.enum(DISQUALIFIERS)),
  suggested_direction: z.enum(["LONG", "SHORT", "NONE"]),
  wait_for: z.array(z.string()).describe("Condições faltantes na ordem do workflow"),
  invalidation: z.string().describe("Estrutura cuja violação invalida a ideia (base do stop)"),
  targets: z.array(z.string()).describe("Próximas liquidez/draws, não R:R arbitrário"),
  risk_recommendation: z.enum(["NONE", "REDUCED", "NORMAL"]),
  management_notes: z.string(),
  intermarket_note: nullableStr,
  warnings: z.array(z.string()),
  confidence: z.enum(CONFIDENCE),
});
export type TechnicalAnalysis = z.infer<typeof TechnicalAnalysisSchema>;

// ---------------------------------------------------------------------------
// 5) Revisão de trade (coach de processo)
// ---------------------------------------------------------------------------
export const TradeReviewSchema = z.object({
  process_grade: z.enum(["A", "B", "C"]),
  process_grade_reasoning: z.string(),
  execution_vs_plan: z.enum(["FOLLOWED", "PARTIALLY_FOLLOWED", "DEVIATED"]),
  error_tags: z.array(z.enum(ERROR_TAGS)),
  what_went_right: z.array(z.string()),
  what_went_wrong: z.array(z.string()),
  stop_placement: z.enum(["APPROPRIATE", "TOO_TIGHT", "TOO_WIDE", "WRONG_STRUCTURE", "UNKNOWN"]),
  mae_mfe_comment: z.string(),
  management_assessment: z.string(),
  lesson: z.string(),
  confidence: z.enum(CONFIDENCE),
});
export type TradeReview = z.infer<typeof TradeReviewSchema>;

// ---------------------------------------------------------------------------
// JSON Schema (OpenAI strict / Gemini responseSchema)
// ---------------------------------------------------------------------------
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: "draft-7", io: "output", unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  return strictify(js);
}

/** OpenAI strict mode: todo objeto precisa de additionalProperties:false e todas as chaves em required. */
function strictify(node: unknown): Record<string, unknown> {
  if (!node || typeof node !== "object") return node as Record<string, unknown>;
  const n = node as Record<string, unknown>;
  if (n.type === "object" && n.properties && typeof n.properties === "object") {
    const props = n.properties as Record<string, unknown>;
    for (const k of Object.keys(props)) props[k] = strictify(props[k]);
    n.additionalProperties = false;
    n.required = Object.keys(props);
  }
  if (n.items) n.items = strictify(n.items);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(n[key])) n[key] = (n[key] as unknown[]).map(strictify);
  }
  return n;
}

export const SCHEMAS = {
  calendar_extraction: CalendarExtractionSchema,
  event_interpretation: EventInterpretationSchema,
  session_brief: SessionBriefSchema,
  technical_analysis: TechnicalAnalysisSchema,
  trade_review: TradeReviewSchema,
} as const;
export type SchemaName = keyof typeof SCHEMAS;
