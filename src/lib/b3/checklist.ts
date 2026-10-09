/**
 * Checklists WIN / DOL (spec itens 21-22).
 * Camada MACRO B3 por cima do checklist SMC/ICT existente (buildChecklist) — a lógica técnica
 * (POI não é entrada, Modelo A/B, grade, disqualifiers) NÃO é duplicada.
 */
import type { TechnicalAnalysis } from "@/lib/ai/schemas";
import { buildChecklist, type ChecklistContext, type ChecklistItem, type ChecklistResult } from "@/lib/smc/checklist";
import type { B3AnalysisResult, B3Instrument, Direction3 } from "./types";

export interface B3ChecklistContext extends ChecklistContext {
  instrument: B3Instrument;
  macro: B3AnalysisResult | null; // última análise B3 (pode ser null → itens ficam "não verificado")
}

export interface B3ChecklistResult extends ChecklistResult {
  instrument: B3Instrument;
  macro_items: ChecklistItem[];
  macro_summary: string;
}

const dirOf = (m: B3AnalysisResult | null, symbol: string): Direction3 => m?.intermarket.find((r) => r.symbol === symbol || r.label === symbol)?.direction ?? "UNKNOWN";
const aligned = (dir: "LONG" | "SHORT" | "NONE", d: Direction3, positiveWhen: "UP" | "DOWN"): boolean | null => {
  if (dir === "NONE" || d === "UNKNOWN" || d === "FLAT") return null;
  const favorable = d === positiveWhen; // movimento favorável a LONG
  return dir === "LONG" ? favorable : !favorable;
};

export function buildB3Checklist(a: TechnicalAnalysis, ctx: B3ChecklistContext): B3ChecklistResult {
  const m = ctx.macro;
  const dir = a.suggested_direction;
  const inst = ctx.instrument;
  const macroItems: ChecklistItem[] = [];
  let macroBias: "LONG" | "SHORT" | "NEUTRAL" | null = ctx.macroBias ?? null;
  let macroDivergence = ctx.macroDivergence ?? null;

  if (inst === "WIN") {
    const win = m?.win ?? null;
    if (win && !macroBias) macroBias = win.bias === "BULLISH" ? "LONG" : win.bias === "BEARISH" ? "SHORT" : "NEUTRAL";
    if (win && macroDivergence === null) macroDivergence = Math.abs(win.score);
    const regimeOk = !m ? null : dir === "NONE" ? null : m.regime === "HIGH_EVENT_RISK" ? false : m.regime === "RISK_ON" || m.regime === "DOMESTIC_BULLISH" ? dir === "LONG" : m.regime === "RISK_OFF" || m.regime === "DOMESTIC_BEARISH" ? dir === "SHORT" : null;
    macroItems.push({ key: "b3_regime", label: "Macro regime aligned?", ok: regimeOk, note: m ? `regime ${m.regime} · WIN ${win!.score > 0 ? "+" : ""}${win!.score} ${win!.bias}` : "sem análise B3" });
    const diLong = m?.di_curve?.long.state ?? "UNKNOWN";
    macroItems.push({ key: "b3_di", label: "DI aligned?", ok: aligned(dir, diLong, "DOWN"), note: m?.di_curve ? `DI longo ${diLong} (${m.di_curve.shape}, causa ${m.di_curve.cause})` : "curva DI não informada" });
    const brlDir: Direction3 = m ? (m.brl.bias === "BULLISH" ? "UP" : m.brl.bias === "BEARISH" ? "DOWN" : "FLAT") : "UNKNOWN";
    macroItems.push({ key: "b3_brl", label: "DOL/BRL aligned?", ok: aligned(dir, brlDir, "UP"), note: m ? `BRL ${m.brl.score > 0 ? "+" : ""}${m.brl.score} · DOL ${m.dol.bias} (div ${m.dol.divergence})` : "sem score BRL" });
    macroItems.push({ key: "b3_useq", label: "US equities aligned?", ok: aligned(dir, dirOf(m, "SPX"), "UP"), note: m ? `S&P ${dirOf(m, "SPX")} · NAS ${dirOf(m, "NAS100")}` : "sem dado" });
    const cmdDir = dirOf(m, "IRON_ORE") !== "UNKNOWN" ? dirOf(m, "IRON_ORE") : dirOf(m, "BRENT");
    macroItems.push({ key: "b3_cmd", label: "Commodities aligned?", ok: aligned(dir, cmdDir, "UP"), note: m ? `minério ${dirOf(m, "IRON_ORE")} · petróleo ${dirOf(m, "BRENT")}` : "sem dado" });
  } else {
    const dol = m?.dol ?? null;
    if (dol && !macroBias) macroBias = dol.bias;
    if (dol && macroDivergence === null) macroDivergence = Math.abs(dol.divergence);
    macroItems.push({ key: "b3_usd", label: "USD score?", ok: dol ? (dir === "LONG" ? dol.usd_score > 0 : dir === "SHORT" ? dol.usd_score < 0 : null) : null, note: dol ? `USD ${dol.usd_score > 0 ? "+" : ""}${dol.usd_score.toFixed(2)} (motor G8)` : "sem score USD" });
    macroItems.push({ key: "b3_brl", label: "BRL score?", ok: dol ? (dir === "LONG" ? dol.brl_score < 0 : dir === "SHORT" ? dol.brl_score > 0 : null) : null, note: dol ? `BRL ${dol.brl_score > 0 ? "+" : ""}${dol.brl_score.toFixed(2)}` : "sem score BRL" });
    macroItems.push({ key: "b3_div", label: "Macro divergence?", ok: dol ? (dir === "NONE" ? null : dol.bias === dir) : null, note: dol ? `USD − BRL = ${dol.divergence > 0 ? "+" : ""}${dol.divergence.toFixed(2)} → ${dol.bias}` : "sem divergência" });
    macroItems.push({ key: "b3_dxy", label: "DXY aligned?", ok: aligned(dir, dirOf(m, "DXY"), "UP"), note: m ? `DXY ${dirOf(m, "DXY")}` : "sem dado" });
    macroItems.push({ key: "b3_yields", label: "US yields aligned?", ok: aligned(dir, dirOf(m, "US10Y") !== "UNKNOWN" ? dirOf(m, "US10Y") : dirOf(m, "US02Y"), "UP"), note: m ? `US10Y ${dirOf(m, "US10Y")} · US02Y ${dirOf(m, "US02Y")}` : "sem dado" });
    const diShort = m?.di_curve?.short.state ?? "UNKNOWN";
    macroItems.push({ key: "b3_di", label: "DI/BCB aligned?", ok: aligned(dir, diShort, "DOWN"), note: m?.di_curve ? `DI curto ${diShort} (${m.di_curve.cause}) — curto caindo tira carry do BRL` : "curva DI não informada" });
  }

  const er = m?.event_risk.find((r) => r.instrument === (inst === "WIN" ? "WIN" : "DOL"));
  const eventRisk = ctx.eventRisk ?? er?.level ?? null;
  const base = buildChecklist(a, { macroBias, macroDivergence, eventRisk, correlationOk: ctx.correlationOk ?? null });

  // Itens técnicos vêm do checklist SMC; o item "macro" genérico é substituído pelos itens B3 acima.
  const technical = base.items.filter((it) => it.key !== "macro");
  const items = [...macroItems, ...technical];
  // Conflito macro forte (2+ itens macro contra) rebaixa: READY → WAIT; grade A → B
  const against = macroItems.filter((it) => it.ok === false).length;
  let status = base.status, grade = base.setup_grade;
  const downgrades = [...base.downgrades];
  if (against >= 2 && status === "READY") { status = "WAIT"; downgrades.push(`${against} itens macro B3 contra a direção — aguardar alinhamento ou reduzir risco.`); if (grade === "A") grade = "B"; }
  const summary = m ? `${inst}: ${inst === "WIN" ? `WIN ${m.win.score > 0 ? "+" : ""}${m.win.score} ${m.win.bias} · regime ${m.regime}` : `DOL div ${m.dol.divergence > 0 ? "+" : ""}${m.dol.divergence.toFixed(2)} → ${m.dol.bias}`} · event risk ${eventRisk ?? "n/d"}` : `${inst}: sem análise B3 recente — rode B3 Macro antes de operar.`;
  return { ...base, items, status, setup_grade: grade, downgrades, instrument: inst, macro_items: macroItems, macro_summary: summary };
}
