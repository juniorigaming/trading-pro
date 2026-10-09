/** Validação (Zod) dos payloads das rotas B3. */
import { z } from "zod";
import { ALL_CURRENCIES } from "@/lib/ai/types";
import { MARKET_SYMBOLS } from "@/lib/ai/schemas";
import { B3_SESSIONS } from "./types";

export const DiContractBody = z.object({ code: z.string().regex(/^DI1[FGHJKMNQUVXZ]\d{2}$/i, "código DI inválido (ex.: DI1F27)"), tenor: z.enum(["SHORT", "MID", "LONG"]), rate: z.number().min(0).max(60).nullable(), change_bp: z.number().min(-500).max(500).nullable() });
export const DiCurveBody = z.object({ contracts: z.array(DiContractBody).min(1).max(8), cause: z.enum(["INFLATION", "FISCAL_RISK", "BCB_HAWKISH", "BCB_DOVISH", "GLOBAL_YIELDS", "RISK_PREMIUM", "GROWTH", "UNKNOWN"]).nullable().optional(), note: z.string().max(500).nullable().optional(), source: z.enum(["manual", "screenshot_ai", "api"]).optional() });

export const MarketRowBody = z.object({
  symbol: z.union([z.enum(MARKET_SYMBOLS), z.string().regex(/^DI1[FGHJKMNQUVXZ]\d{2}$/i)]),
  contract_code: z.string().nullable().optional(), value: z.number().nullable(), change_pct: z.number().min(-100).max(100).nullable(), change_bp: z.number().min(-500).max(500).nullable(),
  as_of: z.string().nullable().optional(), source: z.enum(["manual", "screenshot_ai", "api"]).default("manual"), ocr_confidence: z.number().min(0).max(1).nullable().optional(), requires_manual_confirmation: z.boolean().optional(), label_seen: z.string().max(80).optional(),
});
export const MarketsBody = z.object({ rows: z.array(MarketRowBody).min(1).max(40) });

const EventBody = z.object({
  id: z.number().int().optional(), date: z.string().nullable(), time: z.string().nullable(), currency: z.enum(ALL_CURRENCIES), event: z.string().min(1).max(200),
  impact: z.enum(["high", "medium", "low", "holiday", "unknown"]), actual: z.string().nullable(), forecast: z.string().nullable(), previous: z.string().nullable(),
  source: z.enum(["screenshot_ai", "calendar_api", "manual"]), ocr_confidence: z.number().nullable().optional(), requires_manual_confirmation: z.boolean().optional(), user_edited: z.boolean().optional(),
});

export const B3AnalyzeBody = z.object({
  session: z.enum(B3_SESSIONS),
  events: z.array(EventBody).max(200).optional(),
  diCurve: DiCurveBody.nullable().optional(),
  markets: z.array(MarketRowBody).max(40).nullable().optional(),
  inputType: z.enum(["screenshot", "structured", "manual", "recompute"]).default("manual"),
  imagesCount: z.number().int().min(0).max(40).optional(),
  tzOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  userEdits: z.record(z.string(), z.unknown()).nullable().optional(),
  withBrief: z.boolean().optional(),
  persist: z.boolean().optional(),
});

export const SettingsBody = z.object({
  di_contracts: z.array(z.object({ code: z.string().regex(/^DI1[FGHJKMNQUVXZ]\d{2}$/i), tenor: z.enum(["SHORT", "MID", "LONG"]) })).min(1).max(8).optional(),
  weights: z.record(z.string(), z.unknown()).optional(),
});
