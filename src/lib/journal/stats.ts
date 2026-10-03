/**
 * Estatísticas do Journal — por sessão/símbolo/direção/grade/modelo/MSS/divergência/dia/tag.
 * Inclui MAE/MFE e hipóteses marcadas como OBSERVATION até haver amostra relevante.
 */
export interface JournalRow {
  id: number; date: string; session: string | null; symbol: string; direction: string;
  resultType: string | null; resultAmount: number | null; realizedR: number | null;
  maeR: number | null; mfeR: number | null;
  setupGrade: string | null; entryModel: string | null; mssTimeframe: string | null; mssType: string | null;
  macroDivergence: number | null; errorTags: string[];
  // B3 (opcionais — Forex deixa null)
  market?: string | null; instrument?: "WIN" | "DOL" | "WDO" | null; winMacroScore?: number | null; dolMacroScore?: number | null; diShort?: number | null; diLong?: number | null;
  riskRegime?: string | null; dxyState?: string | null; us10yState?: string | null; sp500State?: string | null; eventRiskAtEntry?: string | null;
}

export interface StatBucket {
  key: string; n: number; wins: number; losses: number; be: number; win_rate: number; avg_r: number | null; sum_r: number;
  profit_factor: number | null; expectancy: number | null; avg_mae: number | null; avg_mfe: number | null; pnl: number;
}

const MIN_SAMPLE = 20;

function num(v: number | null | undefined): v is number { return typeof v === "number" && Number.isFinite(v); }

export function bucketStats(key: string, rows: JournalRow[]): StatBucket {
  const n = rows.length;
  const wins = rows.filter((r) => r.resultType === "WIN").length;
  const losses = rows.filter((r) => r.resultType === "LOSS").length;
  const be = n - wins - losses;
  const rs = rows.map((r) => r.realizedR).filter(num);
  const sum_r = rs.reduce((a, b) => a + b, 0);
  const grossWin = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(rs.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  const maes = rows.map((r) => r.maeR).filter(num), mfes = rows.map((r) => r.mfeR).filter(num);
  const pnl = rows.map((r) => r.resultAmount).filter(num).reduce((a, b) => a + b, 0);
  const wr = n ? wins / n : 0;
  const avgWinR = rs.filter((r) => r > 0).length ? grossWin / rs.filter((r) => r > 0).length : 0;
  const avgLossR = rs.filter((r) => r < 0).length ? grossLoss / rs.filter((r) => r < 0).length : 0;
  return {
    key, n, wins, losses, be, win_rate: Number((wr * 100).toFixed(1)), avg_r: rs.length ? Number((sum_r / rs.length).toFixed(2)) : null, sum_r: Number(sum_r.toFixed(2)),
    profit_factor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? null : null,
    expectancy: rs.length ? Number((wr * avgWinR - (1 - wr) * avgLossR).toFixed(2)) : null,
    avg_mae: maes.length ? Number((maes.reduce((a, b) => a + b, 0) / maes.length).toFixed(2)) : null,
    avg_mfe: mfes.length ? Number((mfes.reduce((a, b) => a + b, 0) / mfes.length).toFixed(2)) : null,
    pnl: Number(pnl.toFixed(2)),
  };
}

export function groupBy(rows: JournalRow[], fn: (r: JournalRow) => string | string[] | null): StatBucket[] {
  const map = new Map<string, JournalRow[]>();
  for (const r of rows) {
    const k = fn(r);
    const keys = Array.isArray(k) ? k : [k ?? "—"];
    for (const kk of keys) map.set(kk, [...(map.get(kk) ?? []), r]);
  }
  return [...map.entries()].map(([k, v]) => bucketStats(k, v)).sort((a, b) => b.n - a.n);
}

export function divergenceBucket(d: number | null): string {
  if (d === null || d === undefined) return "sem macro";
  if (d >= 2.5) return "≥ 2.5"; if (d >= 1.5) return "1.5–2.5"; if (d >= 1.0) return "1.0–1.5"; return "< 1.0";
}

/** Bucket de score macro B3 (WIN score ou DOL divergência), na direção do trade. */
export function macroScoreBucket(r: JournalRow): string {
  const v = r.instrument === "WIN" ? r.winMacroScore : r.instrument ? r.dolMacroScore : null;
  if (v === null || v === undefined) return "sem macro";
  const long = r.direction === "BUY" || r.direction === "LONG";
  const aligned = long ? v : -v; // positivo = macro a favor
  if (aligned >= 1.5) return "macro forte a favor (≥1.5)"; if (aligned >= 0.75) return "macro a favor (0.75–1.5)"; if (aligned > -0.75) return "macro neutra"; return "contra macro";
}
/** Alinhamento com DI: WIN long quer DI caindo; DOL long quer DI curto caindo (menos carry). */
export function diAlignmentBucket(r: JournalRow): string {
  if (!r.instrument) return "n/a"; const long = r.direction === "BUY" || r.direction === "LONG";
  const di = r.instrument === "WIN" ? r.diLong : r.diShort; if (di === null || di === undefined) return "DI não registrado";
  if (Math.abs(di) < 4) return "DI estável"; const fav = di < 0; return fav === long ? "a favor do DI" : "contra o DI";
}
export function dxyAlignmentBucket(r: JournalRow): string {
  if (!r.instrument) return "n/a"; const long = r.direction === "BUY" || r.direction === "LONG"; const d = r.dxyState;
  if (!d || d === "UNKNOWN") return "DXY não registrado"; if (d === "FLAT") return "DXY estável";
  const fav = r.instrument === "WIN" ? d === "DOWN" : d === "UP"; return fav === long ? "a favor do DXY" : "contra o DXY";
}

export function weekdayName(dateIso: string): string {
  const d = new Date(dateIso); return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getUTCDay()];
}

export interface MaeMfeStats { winners: { n: number; avg_mae: number | null; avg_mfe: number | null }; losers: { n: number; avg_mae: number | null; avg_mfe: number | null }; insights: string[] }

export function maeMfeStats(rows: JournalRow[]): MaeMfeStats {
  const w = rows.filter((r) => r.resultType === "WIN"), l = rows.filter((r) => r.resultType === "LOSS");
  const avg = (xs: (number | null)[]) => { const v = xs.filter(num); return v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)) : null; };
  const out: MaeMfeStats = {
    winners: { n: w.length, avg_mae: avg(w.map((r) => r.maeR)), avg_mfe: avg(w.map((r) => r.mfeR)) },
    losers: { n: l.length, avg_mae: avg(l.map((r) => r.maeR)), avg_mfe: avg(l.map((r) => r.mfeR)) },
    insights: [],
  };
  const tag = rows.length >= MIN_SAMPLE ? "" : " [OBSERVATION — amostra < 20]";
  if (out.winners.avg_mae !== null && Math.abs(out.winners.avg_mae) >= 0.7) out.insights.push(`Vencedores andam em média ${Math.abs(out.winners.avg_mae).toFixed(2)}R contra antes de virar — stops podem estar apertados.${tag}`);
  if (out.losers.avg_mfe !== null && out.losers.avg_mfe >= 1.0) out.insights.push(`Perdedores chegaram a +${out.losers.avg_mfe.toFixed(2)}R antes do stop — avaliar gestão estrutural/parciais.${tag}`);
  if (out.winners.avg_mfe !== null && out.winners.avg_mfe > 0) {
    const realized = avg(w.map((r) => r.realizedR));
    if (realized !== null && realized < out.winners.avg_mfe * 0.6) out.insights.push(`Vencedores capturam ${realized.toFixed(2)}R de ${out.winners.avg_mfe.toFixed(2)}R de MFE médio — alvo/condução deixa dinheiro na mesa.${tag}`);
  }
  return out;
}

export interface Observation { kind: "OBSERVATION" | "SIGNIFICANT"; text: string; n: number }

/** Hipóteses do histórico — nunca alteram a estratégia automaticamente. */
export function buildObservations(rows: JournalRow[]): Observation[] {
  const obs: Observation[] = [];
  const all = bucketStats("all", rows);
  const push = (text: string, n: number) => obs.push({ kind: n >= MIN_SAMPLE ? "SIGNIFICANT" : "OBSERVATION", text, n });
  const byMss = groupBy(rows, (r) => r.mssType);
  const internal = byMss.find((b) => b.key === "INTERNAL_MSS"), external = byMss.find((b) => b.key === "EXTERNAL_MSS");
  if (internal && external && internal.n >= 3 && external.n >= 3 && internal.win_rate + 10 < external.win_rate) push(`Trades com INTERNAL_MSS possuem win rate inferior (${internal.win_rate}% vs ${external.win_rate}% com EXTERNAL_MSS).`, Math.min(internal.n, external.n));
  const byGrade = groupBy(rows, (r) => r.setupGrade);
  for (const g of byGrade) if (g.key !== "—" && g.n >= 3 && g.avg_r !== null) push(`Setups grade ${g.key}: ${g.n} trades, avg R ${g.avg_r}, win rate ${g.win_rate}%.`, g.n);
  const byTag = groupBy(rows, (r) => (r.errorTags.length ? r.errorTags : null));
  for (const t of byTag) if (t.key !== "—" && t.n >= 3 && t.avg_r !== null && all.avg_r !== null && t.avg_r < all.avg_r) push(`Trades com tag ${t.key} rendem ${t.avg_r}R vs ${all.avg_r}R na média geral.`, t.n);
  const byDiv = groupBy(rows, (r) => divergenceBucket(r.macroDivergence));
  const hi = byDiv.find((b) => b.key === "≥ 2.5" || b.key === "1.5–2.5"), lo = byDiv.find((b) => b.key === "< 1.0");
  if (hi && lo && hi.n >= 3 && lo.n >= 3 && (hi.avg_r ?? 0) > (lo.avg_r ?? 0)) push(`Divergência macro alta (${hi.key}) rende ${hi.avg_r}R vs ${lo.avg_r}R com divergência < 1.0.`, Math.min(hi.n, lo.n));
  return obs;
}
