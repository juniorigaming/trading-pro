/**
 * Checklist pré-trade + regras duras (independentes da IA).
 * "POI não é entrada. POI é onde começamos a procurar entrada."
 */
import type { TechnicalAnalysis } from "@/lib/ai/schemas";
import type { EventRiskLevel } from "@/lib/ai/types";

export interface ChecklistItem { key: string; label: string; ok: boolean | null; note?: string }
export interface ChecklistResult {
  items: ChecklistItem[];
  status: "READY" | "WAIT" | "INVALID";
  entry_model: "NONE" | "MODEL_A_AGGRESSIVE" | "MODEL_B_CONFIRMED";
  setup_grade: "A" | "B" | "C" | "NO_TRADE";
  risk_recommendation: "NONE" | "REDUCED" | "NORMAL";
  disqualifiers: string[];
  downgrades: string[]; // explicações de rebaixamento aplicado pelo backend
}

export interface ChecklistContext {
  macroBias?: "LONG" | "SHORT" | "NEUTRAL" | null;
  macroDivergence?: number | null;
  eventRisk?: EventRiskLevel | null;
  correlationOk?: boolean | null;
}

const MICRO_TF = new Set(["M1", "M3"]);

export function buildChecklist(a: TechnicalAnalysis, ctx: ChecklistContext = {}): ChecklistResult {
  const dir = a.suggested_direction;
  const macroAligned = !ctx.macroBias || ctx.macroBias === "NEUTRAL" || dir === "NONE" ? null : ctx.macroBias === dir;
  const htfAligned = a.htf_bias === "UNCLEAR" || a.htf_bias === "RANGING" || dir === "NONE" ? null : (a.htf_bias === "BULLISH") === (dir === "LONG");
  const pd = a.location.htf_premium_discount;
  const correctPD = dir === "NONE" || pd === "UNCLEAR" ? null : dir === "LONG" ? pd !== "PREMIUM" : pd !== "DISCOUNT";
  const mssSignificant = a.mss.present && a.mss.type === "EXTERNAL_MSS" && (!MICRO_TF.has(a.mss.timeframe ?? "") || a.mss.follow_through);
  const fvgCreated = a.displacement_detail.created_fvg || a.poi.some((p) => (p.type === "FVG" || p.type === "OB") && p.status !== "INVALIDATED");
  const eventOk = ctx.eventRisk ? ctx.eventRisk === "LOW" || ctx.eventRisk === "MEDIUM" : null;

  const items: ChecklistItem[] = [
    { key: "macro", label: "Macro aligned?", ok: macroAligned, note: ctx.macroBias ? `macro ${ctx.macroBias}${ctx.macroDivergence ? ` (div ${ctx.macroDivergence})` : ""}` : "sem viés macro informado" },
    { key: "htf_draw", label: "HTF draw defined?", ok: a.draw_on_liquidity.length > 0 && a.htf_bias !== "UNCLEAR", note: a.draw_on_liquidity[0]?.target },
    { key: "pd", label: "Correct premium/discount?", ok: correctPD, note: pd },
    { key: "poi", label: "POI reached?", ok: a.location.poi_reached, note: a.location.poi_description ?? undefined },
    { key: "sweep", label: "Liquidity swept?", ok: a.liquidity_sweep, note: a.liquidity_sweep_detail.description ?? undefined },
    { key: "displacement", label: "Displacement present?", ok: a.displacement, note: a.displacement_detail.description ?? undefined },
    { key: "mss", label: "Significant MSS?", ok: a.mss.present ? mssSignificant : false, note: a.mss.present ? `${a.mss.type} ${a.mss.timeframe ?? ""}${a.mss.follow_through ? " + follow-through" : ""}` : "sem MSS" },
    { key: "fvg", label: "FVG/OB created?", ok: fvgCreated },
    { key: "retest", label: "Retest occurred?", ok: a.retest.occurred, note: a.retest.description ?? undefined },
    { key: "event", label: "Event risk acceptable?", ok: eventOk, note: ctx.eventRisk ?? "não verificado" },
    { key: "correlation", label: "Correlation acceptable?", ok: ctx.correlationOk ?? null },
  ];

  const disq = new Set<string>(a.disqualifiers);
  const downgrades: string[] = [];
  if (!a.liquidity_sweep) disq.add("NO_SWEEP");
  if (!a.displacement) disq.add("NO_DISPLACEMENT");
  if (!a.liquidity_sweep && !a.displacement && a.location.poi_reached) disq.add("POI_TOUCH_ONLY");
  if (a.mss.present && a.mss.type === "INTERNAL_MSS") disq.add("INTERNAL_MSS_ONLY");
  if (a.mss.present && MICRO_TF.has(a.mss.timeframe ?? "") && !(a.mss.type === "EXTERNAL_MSS" && a.mss.follow_through)) disq.add("MSS_TOO_MICRO");
  if (macroAligned === false) disq.add("AGAINST_MACRO");
  if (htfAligned === false) disq.add("AGAINST_HTF");
  if (correctPD === false) disq.add(dir === "LONG" ? "LONG_IN_PREMIUM" : "SHORT_IN_DISCOUNT");
  if (a.location.is_extended) disq.add("EXTENDED_PRICE");
  if (ctx.eventRisk === "HIGH" || ctx.eventRisk === "EXTREME") disq.add("HIGH_EVENT_RISK");
  if (a.image_quality === "POOR") disq.add("POOR_IMAGE");

  // Modelo de entrada — regras duras
  let model: ChecklistResult["entry_model"] = a.entry_model;
  const baseOk = a.liquidity_sweep && a.displacement && a.location.poi_reached && macroAligned !== false;
  if (!baseOk) { if (model !== "NONE") downgrades.push("Sem sweep + displacement no POI (macro alinhada) não há modelo de entrada."); model = "NONE"; }
  else if (model === "MODEL_B_CONFIRMED" && !(mssSignificant && fvgCreated && a.retest.occurred)) { downgrades.push("MODEL_B requer MSS significativo + FVG/OB + retest; rebaixado para MODEL_A."); model = "MODEL_A_AGGRESSIVE"; }
  if (model === "NONE" && baseOk) model = "MODEL_A_AGGRESSIVE";
  if (disq.has("AGAINST_MACRO") || disq.has("HIGH_EVENT_RISK") && ctx.eventRisk === "EXTREME") { if (model !== "NONE") downgrades.push("Contra macro ou event risk EXTREME: sem entrada."); model = "NONE"; }

  // Grade — definida ANTES do resultado
  const hard = ["POI_TOUCH_ONLY", "NO_SWEEP", "NO_DISPLACEMENT", "AGAINST_MACRO", "POOR_IMAGE"].filter((d) => disq.has(d));
  const soft = ["INTERNAL_MSS_ONLY", "MSS_TOO_MICRO", "AGAINST_HTF", "LONG_IN_PREMIUM", "SHORT_IN_DISCOUNT", "EXTENDED_PRICE", "HIGH_EVENT_RISK", "CONFLICTING_TIMEFRAMES"].filter((d) => disq.has(d));
  let grade: ChecklistResult["setup_grade"];
  if (hard.length || model === "NONE") grade = hard.length ? "NO_TRADE" : "C";
  else if (model === "MODEL_B_CONFIRMED" && soft.length === 0 && (ctx.macroDivergence ?? 0) >= 1.5 && htfAligned !== false) grade = "A";
  else if (soft.length <= 1) grade = "B";
  else grade = "C";
  if (a.setup_grade !== grade) downgrades.push(`Grade da IA (${a.setup_grade}) ajustada para ${grade} pelas regras do sistema.`);

  const risk: ChecklistResult["risk_recommendation"] = model === "NONE" ? "NONE" : model === "MODEL_B_CONFIRMED" && grade !== "C" ? "NORMAL" : "REDUCED";
  const status: ChecklistResult["status"] = hard.length || (ctx.eventRisk === "EXTREME") || macroAligned === false ? "INVALID" : model !== "NONE" && grade !== "C" ? "READY" : "WAIT";
  return { items, status, entry_model: model, setup_grade: grade, risk_recommendation: risk, disqualifiers: [...disq], downgrades };
}
