/**
 * Curva DI — análise determinística de nível, variação, inclinação e forma.
 * A CAUSA do movimento vem de evidência (interpretações de eventos / brief IA / input do usuário);
 * sem evidência fica UNKNOWN e a implicação para WIN é MIXED — DI isolado nunca define direção.
 */
import { DEFAULT_B3_CONFIG, type B3Config } from "./config";
import type { DiCause, DiContractInput, DiCurveAnalysis, DiShape, DiTenor, Direction3 } from "./types";

function stateOf(bp: number | null, cfg: B3Config): Direction3 {
  if (bp === null || !Number.isFinite(bp)) return "UNKNOWN";
  if (bp >= cfg.rate_move_bp.small) return "UP";
  if (bp <= -cfg.rate_move_bp.small) return "DOWN";
  return "FLAT";
}

function pick(contracts: DiContractInput[], tenor: DiTenor) {
  const c = contracts.find((x) => x.tenor === tenor);
  return { code: c?.code ?? null, rate: c?.rate ?? null, change_bp: c?.change_bp ?? null };
}

export function classifyShape(shortBp: number | null, longBp: number | null, cfg: B3Config = DEFAULT_B3_CONFIG): DiShape {
  if (shortBp === null && longBp === null) return "UNKNOWN";
  const s = shortBp ?? 0, l = longBp ?? 0, small = cfg.rate_move_bp.small;
  const slopeChg = l - s;
  if (Math.abs(s) < small && Math.abs(l) < small) return "STABLE";
  if (slopeChg >= small) return l > 0 ? "BEAR_STEEPENING" : "BULL_STEEPENING"; // longo sobe mais / curto cai mais
  if (slopeChg <= -small) return l < 0 ? "BULL_FLATTENING" : "BEAR_FLATTENING"; // longo cai mais / curto sobe mais
  return l > 0 ? "PARALLEL_UP" : "PARALLEL_DOWN";
}

export interface DiCauseEvidence { inflation_hot?: boolean; inflation_cool?: boolean; fiscal_negative?: boolean; fiscal_positive?: boolean; bcb_hawkish?: boolean; bcb_dovish?: boolean; us_yields_up?: boolean; us_yields_down?: boolean; growth_strong?: boolean; risk_off?: boolean; user_cause?: DiCause | null }

/** Infere a causa provável do movimento da curva a partir de evidências (nunca adivinha sem evidência). */
export function inferCause(shape: DiShape, ev: DiCauseEvidence = {}): DiCause {
  if (ev.user_cause && ev.user_cause !== "UNKNOWN") return ev.user_cause;
  const up = shape === "BEAR_STEEPENING" || shape === "BEAR_FLATTENING" || shape === "PARALLEL_UP";
  const down = shape === "BULL_STEEPENING" || shape === "BULL_FLATTENING" || shape === "PARALLEL_DOWN";
  if (up) {
    if (shape === "BEAR_STEEPENING" && (ev.fiscal_negative || ev.risk_off)) return ev.fiscal_negative ? "FISCAL_RISK" : "RISK_PREMIUM";
    if (ev.bcb_hawkish && shape === "BEAR_FLATTENING") return "BCB_HAWKISH";
    if (ev.inflation_hot) return "INFLATION";
    if (ev.us_yields_up) return "GLOBAL_YIELDS";
    if (ev.growth_strong) return "GROWTH";
    if (ev.fiscal_negative) return "FISCAL_RISK";
    if (ev.bcb_hawkish) return "BCB_HAWKISH";
  }
  if (down) {
    if (ev.bcb_dovish) return "BCB_DOVISH";
    if (ev.inflation_cool) return "INFLATION";
    if (ev.fiscal_positive) return "FISCAL_RISK";
    if (ev.us_yields_down) return "GLOBAL_YIELDS";
  }
  return "UNKNOWN";
}

export function analyzeDiCurve(contracts: DiContractInput[], opts: { cfg?: B3Config; evidence?: DiCauseEvidence } = {}): DiCurveAnalysis {
  const cfg = opts.cfg ?? DEFAULT_B3_CONFIG;
  const s = pick(contracts, "SHORT"), m = pick(contracts, "MID"), l = pick(contracts, "LONG");
  const slope_bp = s.rate !== null && l.rate !== null ? Number(((l.rate - s.rate) * 100).toFixed(1)) : null;
  const slope_change_bp = s.change_bp !== null && l.change_bp !== null ? Number((l.change_bp - s.change_bp).toFixed(1)) : null;
  const shape = classifyShape(s.change_bp, l.change_bp, cfg);
  const cause = inferCause(shape, opts.evidence);
  const requires_manual_confirmation = contracts.length === 0 || contracts.every((c) => c.rate === null && c.change_bp === null);

  // Implicações — dependem da causa. DI caindo por desinflação/BCB dovish = suporte a bolsa; DI subindo por fiscal = pressão em bolsa E BRL.
  let equity: DiCurveAnalysis["equity_implication"] = "UNKNOWN";
  let brl: DiCurveAnalysis["brl_implication"] = "UNKNOWN";
  const up = shape === "BEAR_STEEPENING" || shape === "BEAR_FLATTENING" || shape === "PARALLEL_UP";
  const down = shape === "BULL_STEEPENING" || shape === "BULL_FLATTENING" || shape === "PARALLEL_DOWN";
  if (shape === "STABLE") { equity = "MIXED"; brl = "MIXED"; }
  else if (down) {
    equity = "SUPPORTIVE";
    brl = cause === "BCB_DOVISH" ? "MIXED" : cause === "FISCAL_RISK" || cause === "INFLATION" ? "SUPPORTIVE" : "MIXED"; // cortes por desinflação ≠ cortes por risco
  } else if (up) {
    if (cause === "FISCAL_RISK" || cause === "RISK_PREMIUM") { equity = "PRESSURE"; brl = "PRESSURE"; }
    else if (cause === "BCB_HAWKISH" || cause === "INFLATION") { equity = "PRESSURE"; brl = "MIXED"; } // carry ajuda, inflação atrapalha
    else if (cause === "GROWTH") { equity = "MIXED"; brl = "SUPPORTIVE"; }
    else if (cause === "GLOBAL_YIELDS") { equity = "PRESSURE"; brl = "PRESSURE"; }
    else { equity = "PRESSURE"; brl = "MIXED"; }
  }

  const fmt = (x: { code: string | null; rate: number | null; change_bp: number | null }) => x.code ? `${x.code} ${x.rate !== null ? x.rate.toFixed(2) + "%" : "n/d"} (${x.change_bp !== null ? (x.change_bp > 0 ? "+" : "") + x.change_bp + "bp" : "Δ n/d"})` : "n/d";
  const causeTxt: Record<DiCause, string> = { INFLATION: "inflação", FISCAL_RISK: "risco fiscal", BCB_HAWKISH: "BCB mais duro", BCB_DOVISH: "BCB mais brando", GLOBAL_YIELDS: "yields globais", RISK_PREMIUM: "prêmio de risco", GROWTH: "atividade", UNKNOWN: "causa não evidenciada" };
  const interpretation = requires_manual_confirmation
    ? "Curva DI sem dados confirmados — informe/valide os contratos antes de usar no score."
    : `${shape.replace(/_/g, " ").toLowerCase()} · curto ${fmt(s)} · médio ${fmt(m)} · longo ${fmt(l)}${slope_bp !== null ? ` · inclinação ${slope_bp}bp` : ""}. Causa provável: ${causeTxt[cause]}. ${equity === "SUPPORTIVE" ? "Normalmente favorável a ações sensíveis a juros" : equity === "PRESSURE" ? "Normalmente pressão sobre ações sensíveis a juros" : "Leitura mista para bolsa"} — DI isolado não define direção de WIN.`;

  return {
    contracts,
    short: { ...s, state: stateOf(s.change_bp, cfg) }, mid: { ...m, state: stateOf(m.change_bp, cfg) }, long: { ...l, state: stateOf(l.change_bp, cfg) },
    slope_bp, slope_change_bp, shape, cause, interpretation, equity_implication: equity, brl_implication: brl, requires_manual_confirmation,
  };
}

/** Contribuição da curva DI para o WIN (−2..+2) ou null sem dado. */
export function diScoreForWin(di: DiCurveAnalysis | null, cfg: B3Config = DEFAULT_B3_CONFIG): { score: number | null; reason: string } {
  if (!di || di.requires_manual_confirmation) return { score: null, reason: "Curva DI não informada" };
  const l = di.long.change_bp, s = di.short.change_bp;
  const ref = l ?? s; if (ref === null) return { score: null, reason: "Sem variação da curva" };
  const mag = Math.abs(ref) >= cfg.rate_move_bp.large ? 2 : Math.abs(ref) >= cfg.rate_move_bp.small ? 1 : 0;
  if (mag === 0) return { score: 0, reason: "Curva DI estável" };
  let score = ref < 0 ? mag : -mag; // DI cai → + ; sobe → −
  // causa modula: alta por atividade é menos negativa; queda por risco (sem desinflação) menos positiva
  if (ref > 0 && di.cause === "GROWTH") score = -mag / 2;
  if (ref < 0 && (di.cause === "RISK_PREMIUM" || di.cause === "UNKNOWN")) score = mag / 2;
  return { score, reason: `${di.shape} (${di.long.code ?? "longo"} ${ref > 0 ? "+" : ""}${ref}bp, causa ${di.cause})` };
}

/** Contribuição da curva DI para o BRL (−2..+2) ou null. */
export function diScoreForBrl(di: DiCurveAnalysis | null, cfg: B3Config = DEFAULT_B3_CONFIG): { score: number | null; reason: string } {
  if (!di || di.requires_manual_confirmation) return { score: null, reason: "Curva DI não informada" };
  const l = di.long.change_bp, s = di.short.change_bp;
  if (l === null && s === null) return { score: null, reason: "Sem variação da curva" };
  const big = cfg.rate_move_bp.large, small = cfg.rate_move_bp.small;
  const mag = (x: number | null) => (x === null ? 0 : Math.abs(x) >= big ? 2 : Math.abs(x) >= small ? 1 : 0);
  if (di.brl_implication === "PRESSURE") return { score: -Math.max(mag(l), mag(s), 1), reason: `Curva ${di.shape} por ${di.cause}: prêmio de risco pesa no BRL` };
  if (di.brl_implication === "SUPPORTIVE") return { score: Math.max(mag(l), mag(s), 1) * (di.cause === "GROWTH" ? 0.5 : 1), reason: `Curva ${di.shape} por ${di.cause}: favorável ao BRL` };
  // MIXED: curto subindo por BCB hawkish → carry (+), mas desconta
  if (s !== null && s >= small && di.cause === "BCB_HAWKISH") return { score: 0.5, reason: "Curto sobe com BCB hawkish: carry ajuda, inflação limita" };
  return { score: 0, reason: `Curva ${di.shape}: leitura mista para BRL (${di.cause})` };
}
