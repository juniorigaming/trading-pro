/** Journal — leitura/escrita combinando trades (existente) + trade_journal + trade_metrics + error_tags. */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { errorTags, trades, tradeJournal, tradeMetrics, tradeScreenshots } from "@/db/schema";
import { computeExposure, type ExposureResult } from "@/lib/macro/exposure";
import type { JournalRow } from "./stats";

export interface JournalEntry {
  id: number; date: string; time: string; session: string; symbol: string; direction: "BUY" | "SELL"; status: string;
  entry: number | null; stop_loss: number | null; take_profit: number | null; position_size: number | null;
  risk_usd: number | null; risk_percent: number | null; planned_rr: number | null; realized_r: number | null; pnl: number | null; result: string | null;
  strong_currency: string | null; weak_currency: string | null; macro_divergence: number | null; macro_scores: Record<string, number> | null;
  htf_bias: string | null; draw_on_liquidity: string | null; poi: string | null; liquidity_sweep: boolean | null; mss_timeframe: string | null; mss_type: string | null;
  displacement: boolean | null; fvg: boolean | null; entry_model: string | null; setup_grade: string | null; setup_grade_locked_at: string | null;
  mae_r: number | null; mfe_r: number | null; mae_price: number | null; mfe_price: number | null;
  error_tags: string[]; lesson: string | null; notes: string | null; technical_analysis_id: number | null; macro_analysis_id: number | null;
  ai_review: unknown | null; screenshots: { id: number; kind: string; timeframe: string | null; data_url: string }[];
}

const n = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

export async function listJournal(limit = 200, withScreenshots = false, onlyId?: number): Promise<JournalEntry[]> {
  const db = getDb();
  // Screenshots (base64) só são carregados quando pedidos explicitamente — evita payloads gigantes (erro 1102 no Workers).
  const where = onlyId ? and(eq(trades.isDemo, false), eq(trades.id, onlyId)) : eq(trades.isDemo, false);
  const rows = await db.select({ t: trades, j: tradeJournal, m: tradeMetrics }).from(trades)
    .leftJoin(tradeJournal, eq(tradeJournal.tradeId, trades.id)).leftJoin(tradeMetrics, eq(tradeMetrics.tradeId, trades.id))
    .where(where).orderBy(desc(trades.date), desc(trades.id)).limit(limit);
  const ids = rows.map((r) => r.t.id);
  const tags = ids.length ? await db.select().from(errorTags).where(inArray(errorTags.tradeId, ids)) : [];
  const shots = withScreenshots && ids.length ? await db.select().from(tradeScreenshots).where(inArray(tradeScreenshots.tradeId, ids)) : [];
  return rows.map(({ t, j, m }) => ({
    id: t.id, date: t.date.toISOString(), time: t.time, session: t.session, symbol: t.asset, direction: t.direction as "BUY" | "SELL", status: t.status,
    entry: n(t.entryPrice), stop_loss: n(t.stopLoss), take_profit: n(t.takeProfit), position_size: n(t.positionSize),
    risk_usd: n(j?.riskUsd ?? t.riskAmount), risk_percent: j?.riskPercent ?? t.riskPercent ?? null, planned_rr: j?.plannedRr ?? t.plannedRR ?? null,
    realized_r: m?.realizedR ?? t.resultR ?? t.realizedRR ?? null, pnl: n(t.resultAmount), result: t.resultType,
    strong_currency: j?.strongCurrency ?? null, weak_currency: j?.weakCurrency ?? null, macro_divergence: j?.macroDivergence ?? null, macro_scores: (j?.macroScores as Record<string, number>) ?? null,
    htf_bias: j?.htfBias ?? t.htfBias ?? null, draw_on_liquidity: j?.drawOnLiquidity ?? t.drawOnLiquidity ?? null, poi: j?.poi ?? t.poi ?? null,
    liquidity_sweep: j?.liquiditySweep ?? t.sweepLiquidity ?? null, mss_timeframe: j?.mssTimeframe ?? null, mss_type: j?.mssType ?? null,
    displacement: j?.displacement ?? t.displacement ?? null, fvg: j?.fvg ?? t.fvg ?? null, entry_model: j?.entryModel ?? null, setup_grade: j?.setupGrade ?? null,
    setup_grade_locked_at: j?.setupGradeLockedAt?.toISOString() ?? null,
    mae_r: m?.maeR ?? null, mfe_r: m?.mfeR ?? null, mae_price: n(m?.maePrice ?? t.maePrice), mfe_price: n(m?.mfePrice ?? t.mfePrice),
    error_tags: tags.filter((x) => x.tradeId === t.id).map((x) => x.tag), lesson: j?.lesson ?? t.lesson ?? null, notes: t.notes ?? null,
    technical_analysis_id: j?.technicalAnalysisId ?? null, macro_analysis_id: j?.macroAnalysisId ?? null, ai_review: j?.aiReviewJson ?? null,
    screenshots: shots.filter((s) => s.tradeId === t.id).map((s) => ({ id: s.id, kind: s.kind, timeframe: s.timeframe, data_url: s.dataUrl })),
  }));
}

export async function getJournalEntry(id: number): Promise<JournalEntry | null> {
  const rows = await listJournal(1, true, id);
  return rows[0] ?? null;
}

export function toStatsRows(entries: JournalEntry[]): JournalRow[] {
  return entries.filter((e) => e.status === "CLOSED" || e.result).map((e) => ({
    id: e.id, date: e.date, session: e.session, symbol: e.symbol, direction: e.direction, resultType: e.result, resultAmount: e.pnl, realizedR: e.realized_r,
    maeR: e.mae_r, mfeR: e.mfe_r, setupGrade: e.setup_grade, entryModel: e.entry_model, mssTimeframe: e.mss_timeframe, mssType: e.mss_type, macroDivergence: e.macro_divergence, errorTags: e.error_tags,
  }));
}

export interface JournalUpsert {
  // trade (existente)
  date?: string; time?: string; session?: string; symbol?: string; direction?: "BUY" | "SELL"; status?: string;
  entry?: number | null; stop_loss?: number | null; take_profit?: number | null; position_size?: number | null; pnl?: number | null; result?: "WIN" | "LOSS" | "BREAK EVEN" | null; notes?: string | null;
  // journal
  strong_currency?: string | null; weak_currency?: string | null; macro_divergence?: number | null; macro_scores?: Record<string, number> | null; macro_analysis_id?: number | null; technical_analysis_id?: number | null;
  htf_bias?: string | null; draw_on_liquidity?: string | null; poi?: string | null; liquidity_sweep?: boolean | null; mss_timeframe?: string | null; mss_type?: string | null;
  displacement?: boolean | null; fvg?: boolean | null; entry_model?: string | null; setup_grade?: string | null; planned_rr?: number | null; risk_usd?: number | null; risk_percent?: number | null;
  error_tags?: string[]; lesson?: string | null;
  // metrics
  realized_r?: number | null; mae_r?: number | null; mfe_r?: number | null; mae_price?: number | null; mfe_price?: number | null; protected_structure?: string | null;
  screenshots?: { kind: "BEFORE" | "AFTER" | "OTHER"; timeframe?: string | null; data_url: string }[];
}

function sessionLabel(s?: string) { return s === "ASIA" ? "Ásia" : s === "LONDON" ? "Londres" : s === "NEW_YORK" ? "Nova York" : s || "Outro"; }

/** Cria trade + journal. Reusa a tabela trades (insert mínimo compatível com o banco atual). */
export async function createJournalEntry(b: JournalUpsert): Promise<number> {
  const db = getDb();
  const date = b.date ? new Date(b.date) : new Date();
  const [t] = await db.insert(trades).values({
    date, time: b.time ?? date.toISOString().slice(11, 16), asset: (b.symbol ?? "").toUpperCase(), direction: b.direction ?? "BUY", session: sessionLabel(b.session),
    status: b.status ?? "OPEN", entryPrice: b.entry != null ? String(b.entry) : null, stopLoss: b.stop_loss != null ? String(b.stop_loss) : null, takeProfit: b.take_profit != null ? String(b.take_profit) : null,
    positionSize: b.position_size != null ? String(b.position_size) : null, resultAmount: b.pnl != null ? String(b.pnl) : null, resultType: b.result ?? null, notes: b.notes ?? null,
  } as typeof trades.$inferInsert).returning({ id: trades.id });
  await updateJournalEntry(t.id, b, true);
  return t.id;
}

export async function updateJournalEntry(id: number, b: JournalUpsert, isNew = false): Promise<void> {
  const db = getDb();
  if (!isNew) {
    const set: Partial<typeof trades.$inferInsert> = {};
    if (b.date) set.date = new Date(b.date); if (b.time) set.time = b.time; if (b.session) set.session = sessionLabel(b.session);
    if (b.symbol) set.asset = b.symbol.toUpperCase(); if (b.direction) set.direction = b.direction; if (b.status) set.status = b.status;
    if (b.entry !== undefined) set.entryPrice = b.entry == null ? null : String(b.entry); if (b.stop_loss !== undefined) set.stopLoss = b.stop_loss == null ? null : String(b.stop_loss);
    if (b.take_profit !== undefined) set.takeProfit = b.take_profit == null ? null : String(b.take_profit); if (b.position_size !== undefined) set.positionSize = b.position_size == null ? null : String(b.position_size);
    if (b.pnl !== undefined) set.resultAmount = b.pnl == null ? null : String(b.pnl); if (b.result !== undefined) set.resultType = b.result; if (b.notes !== undefined) set.notes = b.notes;
    if (b.realized_r !== undefined) set.resultR = b.realized_r;
    if (b.result && b.status === undefined) set.status = "CLOSED";
    if (Object.keys(set).length) await db.update(trades).set(set).where(eq(trades.id, id));
  }
  // journal (grade travada na primeira definição — antes do resultado)
  const existing = await db.select().from(tradeJournal).where(eq(tradeJournal.tradeId, id)).limit(1);
  const j: Partial<typeof tradeJournal.$inferInsert> = { updatedAt: new Date() };
  const map: [keyof JournalUpsert, keyof typeof tradeJournal.$inferInsert][] = [
    ["strong_currency", "strongCurrency"], ["weak_currency", "weakCurrency"], ["macro_divergence", "macroDivergence"], ["macro_scores", "macroScores"], ["macro_analysis_id", "macroAnalysisId"], ["technical_analysis_id", "technicalAnalysisId"],
    ["htf_bias", "htfBias"], ["draw_on_liquidity", "drawOnLiquidity"], ["poi", "poi"], ["liquidity_sweep", "liquiditySweep"], ["mss_timeframe", "mssTimeframe"], ["mss_type", "mssType"], ["displacement", "displacement"], ["fvg", "fvg"],
    ["entry_model", "entryModel"], ["planned_rr", "plannedRr"], ["risk_percent", "riskPercent"], ["lesson", "lesson"], ["error_tags", "errorTags"],
  ];
  for (const [from, to] of map) if (b[from] !== undefined) (j as Record<string, unknown>)[to] = b[from];
  if (b.risk_usd !== undefined) j.riskUsd = b.risk_usd == null ? null : String(b.risk_usd);
  if (b.setup_grade !== undefined) {
    const locked = existing[0]?.setupGradeLockedAt;
    const hasResult = !!(existing[0] && (await db.select({ r: trades.resultType }).from(trades).where(eq(trades.id, id)))[0]?.r);
    if (!locked || !hasResult) { j.setupGrade = b.setup_grade; if (b.setup_grade && !locked) j.setupGradeLockedAt = new Date(); }
  }
  if (existing[0]) await db.update(tradeJournal).set(j).where(eq(tradeJournal.tradeId, id));
  else await db.insert(tradeJournal).values({ tradeId: id, ...j } as typeof tradeJournal.$inferInsert);
  // metrics
  if (["realized_r", "mae_r", "mfe_r", "mae_price", "mfe_price", "protected_structure"].some((k) => b[k as keyof JournalUpsert] !== undefined)) {
    const m: Partial<typeof tradeMetrics.$inferInsert> = { updatedAt: new Date() };
    if (b.realized_r !== undefined) m.realizedR = b.realized_r; if (b.mae_r !== undefined) m.maeR = b.mae_r; if (b.mfe_r !== undefined) m.mfeR = b.mfe_r;
    if (b.mae_price !== undefined) m.maePrice = b.mae_price == null ? null : String(b.mae_price); if (b.mfe_price !== undefined) m.mfePrice = b.mfe_price == null ? null : String(b.mfe_price);
    if (b.protected_structure !== undefined) m.protectedStructure = b.protected_structure;
    await db.insert(tradeMetrics).values({ tradeId: id, ...m } as typeof tradeMetrics.$inferInsert).onConflictDoUpdate({ target: tradeMetrics.tradeId, set: m });
  }
  // tags
  if (b.error_tags) {
    await db.delete(errorTags).where(eq(errorTags.tradeId, id));
    if (b.error_tags.length) await db.insert(errorTags).values(b.error_tags.map((tag) => ({ tradeId: id, tag })));
  }
  // screenshots (append)
  if (b.screenshots?.length) {
    for (const s of b.screenshots) {
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(s.data_url) || s.data_url.length > 800_000) continue;
      await db.insert(tradeScreenshots).values({ tradeId: id, kind: s.kind, timeframe: s.timeframe ?? null, dataUrl: s.data_url });
    }
  }
}

export async function deleteScreenshot(tradeId: number, shotId: number) {
  await getDb().delete(tradeScreenshots).where(and(eq(tradeScreenshots.id, shotId), eq(tradeScreenshots.tradeId, tradeId)));
}

/** Exposição das operações abertas (status OPEN) com base nos símbolos. */
export async function loadOpenExposure(): Promise<ExposureResult> {
  const rows = await getDb().select({ id: trades.id, asset: trades.asset, direction: trades.direction, riskR: trades.resultR }).from(trades)
    .where(and(eq(trades.status, "OPEN"), eq(trades.isDemo, false)));
  return computeExposure(rows.map((r) => ({ id: r.id, symbol: r.asset, direction: r.direction as "BUY" | "SELL", riskR: null })));
}
