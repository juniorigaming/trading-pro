import { z } from "zod";
import { ERROR_TAGS } from "@/lib/ai/types";

export const JournalBody = z.object({
  date: z.string().optional(), time: z.string().optional(), session: z.string().optional(), symbol: z.string().min(3).max(16).optional(), direction: z.enum(["BUY", "SELL"]).optional(), status: z.string().optional(),
  entry: z.number().nullable().optional(), stop_loss: z.number().nullable().optional(), take_profit: z.number().nullable().optional(), position_size: z.number().nullable().optional(), pnl: z.number().nullable().optional(),
  result: z.enum(["WIN", "LOSS", "BREAK EVEN"]).nullable().optional(), notes: z.string().max(5000).nullable().optional(),
  strong_currency: z.string().length(3).nullable().optional(), weak_currency: z.string().length(3).nullable().optional(), macro_divergence: z.number().nullable().optional(), macro_scores: z.record(z.string(), z.number()).nullable().optional(),
  macro_analysis_id: z.number().int().nullable().optional(), technical_analysis_id: z.number().int().nullable().optional(),
  htf_bias: z.string().nullable().optional(), draw_on_liquidity: z.string().max(300).nullable().optional(), poi: z.string().max(300).nullable().optional(), liquidity_sweep: z.boolean().nullable().optional(),
  mss_timeframe: z.string().nullable().optional(), mss_type: z.enum(["INTERNAL_MSS", "EXTERNAL_MSS"]).nullable().optional(), displacement: z.boolean().nullable().optional(), fvg: z.boolean().nullable().optional(),
  entry_model: z.enum(["MODEL_A_AGGRESSIVE", "MODEL_B_CONFIRMED"]).nullable().optional(), setup_grade: z.enum(["A", "B", "C"]).nullable().optional(),
  planned_rr: z.number().nullable().optional(), risk_usd: z.number().nullable().optional(), risk_percent: z.number().nullable().optional(),
  error_tags: z.array(z.enum(ERROR_TAGS)).optional(), lesson: z.string().max(3000).nullable().optional(),
  realized_r: z.number().nullable().optional(), mae_r: z.number().nullable().optional(), mfe_r: z.number().nullable().optional(), mae_price: z.number().nullable().optional(), mfe_price: z.number().nullable().optional(), protected_structure: z.string().max(300).nullable().optional(),
  // B3 (WIN/DOL/WDO)
  market: z.enum(["FOREX", "B3", "OTHER"]).nullable().optional(), b3_analysis_id: z.number().int().nullable().optional(),
  win_macro_score: z.number().min(-2).max(2).nullable().optional(), dol_macro_score: z.number().min(-4).max(4).nullable().optional(), usd_score: z.number().min(-2).max(2).nullable().optional(), brl_score: z.number().min(-2).max(2).nullable().optional(),
  di_short: z.number().nullable().optional(), di_long: z.number().nullable().optional(), risk_regime: z.string().max(32).nullable().optional(),
  dxy_state: z.string().max(16).nullable().optional(), us10y_state: z.string().max(16).nullable().optional(), sp500_state: z.string().max(16).nullable().optional(), nasdaq_state: z.string().max(16).nullable().optional(), iron_ore_state: z.string().max(16).nullable().optional(), oil_state: z.string().max(16).nullable().optional(),
  event_risk_at_entry: z.string().max(16).nullable().optional(),
  screenshots: z.array(z.object({ kind: z.enum(["BEFORE", "AFTER", "OTHER"]), timeframe: z.string().nullable().optional(), data_url: z.string().max(800_000) })).max(6).optional(),
});

