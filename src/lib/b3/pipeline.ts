/**
 * Pipeline B3 (orquestração com banco):
 *   RAW (economic_events BRL/USD/CNY) → interpretação IA (prompt Brasil) → USD via motor G8 + BRL/WIN/DOL determinísticos
 *   → curva DI / mercado / fluxo (snapshots) → regime → event risk → candidatos → alertas → brief IA → b3_macro_analyses.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { b3MacroAnalyses, b3Scores, b3Settings, b3TradeCandidates, diCurveSnapshots, economicEvents, macroInterpretations, marketSnapshots } from "@/db/schema";
import type { CurrencyScoreView, EconomicEventInput } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/service";
import { B3_SESSION_BRIEF, MACRO_BRAZIL_SYSTEM } from "@/lib/ai/prompts";
import { computeCurrencyScores } from "@/lib/macro/scoring";
import { interpretPendingEvents, loadPendingEvents, loadScoredEvents, loadScoringConfig, saveRawEvents, latestScores } from "@/lib/macro/pipeline";
import { DEFAULT_B3_CONFIG, DEFAULT_DI_CONTRACTS, mergeB3Config, type B3Config, type DiContractConfig } from "./config";
import { analyzeDiCurve, type DiCauseEvidence } from "./di-curve";
import { b3EventRisk } from "./event-risk";
import { aggregate, buildAlerts, buildB3Candidates, buildIntermarket, classifyFlow, classifyRegime, computeBrlScore, computeDolScore, computeWinScore, directionOf, globalRiskScore, categoryScores } from "./scoring";
import type { B3AnalysisResult, B3Session, DiCause, DiContractInput, DiCurveAnalysis, MarketReading } from "./types";
import type { MarketSnapshotInput } from "./providers";

const B3_CURRENCIES = ["BRL", "USD", "CNY"] as const;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try { const r = await getDb().select().from(b3Settings).where(eq(b3Settings.key, key)).limit(1); return r[0] ? (r[0].valueJson as T) : fallback; } catch { return fallback; }
}
export async function putSetting(key: string, value: unknown) {
  await getDb().insert(b3Settings).values({ key, valueJson: value as object, updatedAt: new Date() }).onConflictDoUpdate({ target: b3Settings.key, set: { valueJson: value as object, updatedAt: new Date() } });
}
export const loadB3Config = async (): Promise<B3Config> => mergeB3Config(await getSetting<Partial<B3Config> | null>("weights", null));
export const loadDiContracts = async (): Promise<DiContractConfig[]> => {
  const v = await getSetting<DiContractConfig[]>("di_contracts", DEFAULT_DI_CONTRACTS);
  return Array.isArray(v) && v.length ? v : DEFAULT_DI_CONTRACTS;
};

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------
export async function saveDiSnapshot(contracts: DiContractInput[], opts: { analysisId?: number | null; source?: string; note?: string | null; cause?: DiCause | null; ocrConfidence?: number | null; cfg?: B3Config; evidence?: DiCauseEvidence } = {}): Promise<{ id: number; analysis: DiCurveAnalysis }> {
  const analysis = analyzeDiCurve(contracts, { cfg: opts.cfg, evidence: { ...(opts.evidence ?? {}), user_cause: opts.cause ?? null } });
  const [row] = await getDb().insert(diCurveSnapshots).values({
    analysisId: opts.analysisId ?? null, contracts, shortRate: analysis.short.rate, midRate: analysis.mid.rate, longRate: analysis.long.rate,
    shortChangeBp: analysis.short.change_bp, midChangeBp: analysis.mid.change_bp, longChangeBp: analysis.long.change_bp, slopeBp: analysis.slope_bp, slopeChangeBp: analysis.slope_change_bp,
    shape: analysis.shape, cause: analysis.cause, interpretation: analysis.interpretation, source: opts.source ?? "manual", ocrConfidence: opts.ocrConfidence ?? null, note: opts.note ?? null,
  }).returning({ id: diCurveSnapshots.id });
  return { id: row.id, analysis };
}

export async function saveMarketSnapshots(rows: MarketSnapshotInput[], analysisId: number | null = null, cfg: B3Config = DEFAULT_B3_CONFIG): Promise<number> {
  const db = getDb();
  let n = 0;
  for (const r of rows) {
    if (!r.symbol) continue;
    if (r.value === null && r.change_pct === null && r.change_bp === null) continue; // nada legível → não persiste número inventado
    await db.insert(marketSnapshots).values({
      analysisId, symbol: r.symbol.toUpperCase(), value: r.value, changePct: r.change_pct, changeBp: r.change_bp, direction: directionOf(r.change_pct, r.change_bp, cfg),
      source: r.source, ocrConfidence: r.ocr_confidence ?? null, requiresManualConfirmation: !!r.requires_manual_confirmation, note: r.label_seen ?? null,
    });
    n++;
  }
  return n;
}

/** Última leitura por símbolo (ignora linhas que ainda exigem confirmação manual). */
export async function loadLatestMarkets(now = new Date(), cfg: B3Config = DEFAULT_B3_CONFIG): Promise<Record<string, MarketReading>> {
  const rows = await getDb().execute(sql`SELECT DISTINCT ON (symbol) * FROM market_snapshots WHERE requires_manual_confirmation = FALSE ORDER BY symbol, captured_at DESC`);
  const out: Record<string, MarketReading> = {};
  for (const r of rows.rows as Record<string, unknown>[]) {
    const at = new Date(String(r.captured_at));
    const stale = now.getTime() - at.getTime() > cfg.market_stale_hours * 3_600_000;
    out[String(r.symbol)] = { symbol: String(r.symbol), value: r.value === null ? null : Number(r.value), change_pct: r.change_pct === null ? null : Number(r.change_pct), change_bp: r.change_bp === null ? null : Number(r.change_bp), direction: (r.direction as MarketReading["direction"]) ?? "UNKNOWN", captured_at: at.toISOString(), source: String(r.source), stale };
  }
  return out;
}

export async function loadLatestDi(now = new Date(), cfg: B3Config = DEFAULT_B3_CONFIG, evidence?: DiCauseEvidence): Promise<{ analysis: DiCurveAnalysis; captured_at: string; stale: boolean } | null> {
  const rows = await getDb().select().from(diCurveSnapshots).orderBy(desc(diCurveSnapshots.capturedAt)).limit(1);
  const r = rows[0]; if (!r) return null;
  const stale = now.getTime() - r.capturedAt.getTime() > cfg.market_stale_hours * 3_600_000;
  const analysis = analyzeDiCurve(r.contracts as DiContractInput[], { cfg, evidence: { ...(evidence ?? {}), user_cause: (r.cause as DiCause | null) && r.cause !== "UNKNOWN" ? (r.cause as DiCause) : null } });
  return { analysis, captured_at: r.capturedAt.toISOString(), stale };
}

/** Evidências para inferir a CAUSA do movimento da curva DI a partir das interpretações recentes do BRL. */
async function loadDiEvidence(markets: Record<string, MarketReading>): Promise<DiCauseEvidence> {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const rows = await getDb().select({ cat: macroInterpretations.category, infl: macroInterpretations.inflationImplication, fis: macroInterpretations.fiscalImplication, cb: macroInterpretations.centralBankImplication, growth: macroInterpretations.growthImplication })
    .from(macroInterpretations).innerJoin(economicEvents, eq(economicEvents.id, macroInterpretations.eventId))
    .where(and(eq(macroInterpretations.isCurrent, true), eq(economicEvents.currency, "BRL"), gte(economicEvents.scheduledAt, since))).catch(() => []);
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const gr = globalRiskScore(markets);
  return {
    inflation_hot: count((r) => r.infl === "HOTTER") > count((r) => r.infl === "COOLER"), inflation_cool: count((r) => r.infl === "COOLER") > count((r) => r.infl === "HOTTER"),
    fiscal_negative: count((r) => r.fis === "NEGATIVE") > 0, fiscal_positive: count((r) => r.fis === "POSITIVE") > count((r) => r.fis === "NEGATIVE"),
    bcb_hawkish: count((r) => r.cat === "CENTRAL_BANK" && /HAWKISH/.test(r.cb)) > 0, bcb_dovish: count((r) => r.cat === "CENTRAL_BANK" && /DOVISH/.test(r.cb)) > 0,
    us_yields_up: markets.US10Y?.direction === "UP", us_yields_down: markets.US10Y?.direction === "DOWN", growth_strong: count((r) => r.growth === "POSITIVE") > count((r) => r.growth === "NEGATIVE") + 1, risk_off: gr.hint === "RISK_OFF",
  };
}

export async function latestB3Scores(): Promise<Record<string, { score: number; bias: string; confidence: string; computed_at: string; regime: string | null; delta: number | null }>> {
  const rows = await getDb().execute(sql`SELECT DISTINCT ON (instrument) * FROM b3_scores ORDER BY instrument, computed_at DESC`);
  const out: Record<string, { score: number; bias: string; confidence: string; computed_at: string; regime: string | null; delta: number | null }> = {};
  for (const r of rows.rows as Record<string, unknown>[]) out[String(r.instrument)] = { score: Number(r.score), bias: String(r.bias), confidence: String(r.confidence), computed_at: new Date(String(r.computed_at)).toISOString(), regime: (r.regime as string) ?? null, delta: r.score_delta === null ? null : Number(r.score_delta) };
  return out;
}

export async function getLatestB3Analysis(session?: B3Session): Promise<B3AnalysisResult | null> {
  const q = getDb().select().from(b3MacroAnalyses).orderBy(desc(b3MacroAnalyses.createdAt)).limit(1);
  const rows = session ? await q.where(eq(b3MacroAnalyses.session, session)) : await q;
  const r = rows[0];
  if (!r || !r.resultJson || Object.keys(r.resultJson as object).length === 0) return null;
  return r.resultJson as B3AnalysisResult;
}

export async function getB3ScoreHistory(days: 7 | 30 | 90, instrument?: string) {
  const since = new Date(Date.now() - days * 86_400_000);
  const conds = [gte(b3Scores.computedAt, since)];
  if (instrument) conds.push(eq(b3Scores.instrument, instrument));
  const rows = await getDb().select({ instrument: b3Scores.instrument, score: b3Scores.score, computedAt: b3Scores.computedAt, session: b3Scores.session, scoreDate: b3Scores.scoreDate }).from(b3Scores).where(and(...conds)).orderBy(b3Scores.computedAt);
  return rows.map((r) => ({ currency: r.instrument, score: r.score, computed_at: r.computedAt.toISOString(), session: r.session, date: r.scoreDate }));
}

// ---------------------------------------------------------------------------
// Análise completa
// ---------------------------------------------------------------------------
export interface RunB3Input {
  session: B3Session;
  events?: EconomicEventInput[]; // calendário BR/EUA/China (já validado pelo usuário)
  diCurve?: { contracts: DiContractInput[]; cause?: DiCause | null; note?: string | null; source?: string } | null;
  markets?: MarketSnapshotInput[] | null; // DXY, US10Y, SPX, minério, fluxo...
  inputType: "screenshot" | "structured" | "manual" | "recompute";
  imagesCount?: number;
  tzOffsetMinutes?: number;
  userEdits?: Record<string, unknown> | null;
  withBrief?: boolean;
  persist?: boolean;
}

export async function runB3Analysis(input: RunB3Input): Promise<B3AnalysisResult> {
  const db = getDb();
  const [scfg, cfg] = await Promise.all([loadScoringConfig(), loadB3Config()]);
  const now = new Date();
  const persist = input.persist !== false;
  const warnings: string[] = [];

  let analysisId: number | null = null;
  if (persist) {
    const [a] = await db.insert(b3MacroAnalyses).values({ analysisDate: now.toISOString().slice(0, 10), session: input.session, inputType: input.inputType, imagesCount: input.imagesCount ?? 0, eventsCount: input.events?.length ?? 0, scoringVersion: cfg.version, resultJson: {}, warnings: [] }).returning({ id: b3MacroAnalyses.id });
    analysisId = a.id;
  }

  // 1) RAW → interpretação (prompt Brasil) — tolerante a falha de IA
  let eventsSaved = 0, interpreted = 0, model: string | null = null, promptVersion: string | null = null, aiFailure: string | null = null;
  if (input.events?.length) {
    const ids = await saveRawEvents(input.events.filter((e) => (B3_CURRENCIES as readonly string[]).includes(e.currency)), { tzOffsetMinutes: input.tzOffsetMinutes, sourceRef: `b3:${analysisId ?? "recalc"}`, userEdits: input.userEdits ?? null });
    eventsSaved = ids.length;
  }
  if (input.markets?.length) { const n = await saveMarketSnapshots(input.markets, analysisId, cfg); if (n < input.markets.length) warnings.push(`${input.markets.length - n} leitura(s) de mercado sem valor legível foram descartadas (nada inventado).`); }
  // Mercado primeiro (evidência para a causa da curva)
  const markets = await loadLatestMarkets(now, cfg);
  const evidence = await loadDiEvidence(markets);
  if (input.diCurve?.contracts?.length) await saveDiSnapshot(input.diCurve.contracts, { analysisId, source: input.diCurve.source ?? "manual", note: input.diCurve.note ?? null, cause: input.diCurve.cause ?? null, cfg, evidence });
  try {
    const r = await interpretPendingEvents(scfg, null, undefined, { currencies: B3_CURRENCIES, prompt: MACRO_BRAZIL_SYSTEM, extraContext: { di_curve: input.diCurve?.contracts ?? null, markets: Object.fromEntries(Object.entries(markets).map(([k, v]) => [k, { value: v.value, change_pct: v.change_pct, change_bp: v.change_bp }])) } });
    interpreted = r.interpreted; model = r.model; promptVersion = r.promptVersion; warnings.push(...r.warnings);
  } catch (e) { aiFailure = (e as Error).message; warnings.unshift(`IA indisponível ao interpretar eventos (${aiFailure.slice(0, 140)}). RAW salvo; repita a análise em ~1 min — só o que faltou será enviado.`); }

  // 2) Scores de moeda pelo MESMO motor G8 (USD idêntico ao Ranking G8; BRL/CNY só aqui)
  const scored = await loadScoredEvents(scfg);
  const prevG8 = await latestScores().catch(() => [] as CurrencyScoreView[]);
  const prevB3: Awaited<ReturnType<typeof latestB3Scores>> = await latestB3Scores().catch(() => ({}));
  const ccyScores = computeCurrencyScores({ events: scored, now, cfg: scfg, currencies: ["USD", "BRL", "CNY"], previousScores: { USD: prevG8.find((p) => p.currency === "USD")?.score, BRL: prevB3.BRL?.score } });
  const byCcy = (c: string) => ccyScores.find((x) => (x.currency as string) === c);
  const usd = byCcy("USD")!;
  const brlEv = byCcy("BRL")!;
  const cny = byCcy("CNY") ?? null;
  const g8usd = prevG8.find((p) => p.currency === "USD");
  const usdNote = g8usd && Math.abs(g8usd.score - usd.score) >= 0.25 ? `USD recalculado (${usd.score}) difere do último snapshot G8 (${g8usd.score}) por eventos novos — o Ranking G8 será atualizado na próxima análise G8.` : null;

  // 3) Contexto: DI, fluxo, previous
  const diRow = await loadLatestDi(now, cfg, evidence);
  if (diRow?.stale) warnings.push(`Curva DI de ${new Date(diRow.captured_at).toLocaleString("pt-BR")} está desatualizada (> ${cfg.market_stale_hours}h) — não entra no score.`);
  const di = diRow && !diRow.stale ? diRow.analysis : null;
  const flowReading = markets.FOREIGN_FLOW && !markets.FOREIGN_FLOW.stale ? markets.FOREIGN_FLOW : null;
  const flow = { classification: classifyFlow(flowReading?.value ?? null, cfg), value: flowReading?.value ?? null };
  const previous = { brl: prevB3.BRL?.score ?? null, win: prevB3.WIN?.score ?? null, dol: prevB3.DOL?.score ?? null };
  const staleSyms = Object.values(markets).filter((m) => m.stale).map((m) => m.symbol);
  if (staleSyms.length) warnings.push(`Leituras antigas ignoradas: ${staleSyms.join(", ")}.`);

  // 4) Scores
  const si = { now, usd, brlEvents: brlEv, cnyEvents: cny, scoredEvents: scored, di, markets, flow, previous, cfg, scoringCfg: scfg };
  const brl = computeBrlScore(si);
  const win = computeWinScore(si, brl);
  const dol = computeDolScore(usd, brl, previous.dol, cfg);

  // 5) Event risk / regime / candidatos / alertas / intermarket
  const pending = await loadPendingEvents(now, 72);
  const eventRisk = b3EventRisk(pending.filter((p) => (B3_CURRENCIES as readonly string[]).includes(p.currency)), { now, cfg });
  const gr = globalRiskScore(markets, cfg);
  const regime = classifyRegime({ global: gr, win, brl, di, eventRisk });
  const candidates = buildB3Candidates({ win, dol, regime, eventRisk, cfg });
  const alerts = buildAlerts({ win, dol, brl, di, markets, eventRisk, previous, cfg });
  const intermarket = buildIntermarket(markets, di, win, cfg);
  const brlCats = categoryScores(scored, "BRL", now, scfg);
  const cmdComp = brl.components.find((c) => c.key === "COMMODITIES");

  const changes: string[] = [];
  if (previous.win !== null && win.delta) changes.push(`WIN ${previous.win > 0 ? "+" : ""}${previous.win} → ${win.score > 0 ? "+" : ""}${win.score}`);
  if (previous.brl !== null && brl.delta) changes.push(`BRL ${previous.brl > 0 ? "+" : ""}${previous.brl} → ${brl.score > 0 ? "+" : ""}${brl.score}`);
  if (previous.dol !== null && dol.delta) changes.push(`DOL divergência ${previous.dol > 0 ? "+" : ""}${previous.dol} → ${dol.divergence > 0 ? "+" : ""}${dol.divergence}`);
  if (prevB3.WIN?.regime && prevB3.WIN.regime !== regime) changes.push(`Regime ${prevB3.WIN.regime} → ${regime}`);
  if (win.coverage < cfg.min_coverage_for_medium) warnings.push(`Cobertura de dados do WIN baixa (${Math.round(win.coverage * 100)}%): informe curva DI, S&P/NAS, DXY/US10Y e commodities.`);
  if (brl.coverage < cfg.min_coverage_for_medium) warnings.push(`Cobertura de dados do BRL baixa (${Math.round(brl.coverage * 100)}%).`);

  const result: B3AnalysisResult = {
    analysis_id: analysisId === null ? null : String(analysisId), date: now.toISOString().slice(0, 10), session: input.session,
    brazil_macro: { score_from_events: brlEv.live_events ? brlEv.score : null, live_events: brlEv.live_events, drivers: brlEv.drivers, categories: Object.fromEntries(Object.entries(brlCats).map(([k, v]) => [k, { score: v.score, n: v.n }])) },
    usd: { score: usd.score, bias: usd.bias, confidence: usd.confidence, source: "g8_engine", live_events: usd.live_events, drivers: usd.drivers, b3_context_note: usdNote },
    brl, di_curve: di,
    global_risk: { regime_hint: gr.hint, score: gr.score, readings: intermarket.filter((r) => ["SPX", "NAS100", "DXY", "US10Y", "VIX"].includes(r.symbol)) },
    china: { score: cny && cny.live_events ? cny.score : null, live_events: cny?.live_events ?? 0, drivers: cny?.drivers.map((d) => `${d.event} (${d.classification})`) ?? [], note: cny && cny.live_events ? "China forte tende a sustentar minério/VALE/BRL — nunca usar isoladamente." : "Sem dado chinês interpretado." },
    commodities: { score: cmdComp?.score ?? null, iron_ore: markets.IRON_ORE ?? null, brent: markets.BRENT ?? null, wti: markets.WTI ?? null, copper: markets.COPPER ?? null, note: cmdComp?.reason ?? "" },
    flow: { classification: flow.classification, value_brl_mi: flow.value, captured_at: flowReading?.captured_at ?? null, note: flow.classification === "UNKNOWN" ? "Fluxo estrangeiro não informado — não inventado." : `Fluxo ${flow.classification}` },
    win: { ...win, regime }, dol, regime, intermarket, event_risk: eventRisk, trade_candidates: candidates, alerts, changes_since_previous: changes, warnings, brief: null,
    meta: { scoring_version: cfg.version, prompt_version: promptVersion, model, events_interpreted: interpreted, data_coverage: { win: win.coverage, brl: brl.coverage } },
  };

  // 6) Brief IA (narrativa sobre números já calculados)
  if (input.withBrief !== false && !aiFailure) {
    try {
      const prevA = await getLatestB3Analysis().catch(() => null);
      const b = await generateStructured({
        purpose: "b3_brief", prompt: B3_SESSION_BRIEF, schemaName: "b3_brief", temperature: 0.3,
        user: JSON.stringify({ session: input.session, date: result.date, usd: result.usd, brl: { score: brl.score, bias: brl.bias, confidence: brl.confidence, components: brl.components }, win: { score: win.score, bias: win.bias, confidence: win.confidence, regime, components: win.components }, dol, di_curve: di, regime, event_risk: eventRisk.map((r) => ({ instrument: r.instrument, level: r.level, next_key_event: r.next_key_event })), alerts, trade_candidates: candidates.map((c) => ({ instrument: c.instrument, bias: c.bias, score: c.score })), previous: prevA ? { regime: prevA.regime, win: prevA.win.score, brl: prevA.brl.score, dol: prevA.dol.divergence, headline: prevA.brief?.headline ?? null } : null }),
      });
      result.brief = { headline: b.data.headline, regime_narrative: b.data.regime_narrative, win_view: b.data.win_view, dol_view: b.data.dol_view, di_curve_cause: b.data.di_curve_cause, di_curve_comment: b.data.di_curve_comment, conflicts: b.data.conflicts };
      if (result.di_curve && result.di_curve.cause === "UNKNOWN" && b.data.di_curve_cause !== "UNKNOWN") result.di_curve = { ...result.di_curve, cause: b.data.di_curve_cause, interpretation: `${result.di_curve.interpretation} IA: ${b.data.di_curve_comment}` };
      for (const r of b.data.candidate_reasons) { const c = candidates.find((x) => x.instrument === r.instrument); if (c) c.reason = `${r.reason} O que observar: ${r.what_to_look_for} Invalidação macro: ${r.invalidation}`; }
      warnings.push(...b.data.warnings.map((w) => `IA: ${w}`));
      if (!model) { model = b.model; promptVersion = b.promptVersion; result.meta.model = model; result.meta.prompt_version = promptVersion; }
    } catch (e) { warnings.push(`Brief B3 indisponível: ${(e as Error).message}`); }
  }

  // 7) Persistência
  if (persist && analysisId !== null) {
    const scoreDate = result.date;
    const rows = [
      { instrument: "USD", score: usd.score, bias: usd.bias, confidence: usd.confidence, previous: usd.previous_score, components: [] as unknown[], drivers: usd.drivers as unknown[] },
      { instrument: "BRL", score: brl.score, bias: brl.bias, confidence: brl.confidence, previous: brl.previous_score, components: brl.components as unknown[], drivers: brl.drivers as unknown[] },
      { instrument: "WIN", score: win.score, bias: win.bias, confidence: win.confidence, previous: win.previous_score, components: win.components as unknown[], drivers: win.drivers as unknown[] },
      { instrument: "DOL", score: dol.divergence, bias: dol.bias, confidence: dol.confidence, previous: dol.previous_divergence, components: [] as unknown[], drivers: dol.drivers as unknown[] },
    ];
    await db.insert(b3Scores).values(rows.map((r) => ({ analysisId, scoreDate, session: input.session, computedAt: now, instrument: r.instrument, score: r.score, bias: r.bias, confidence: r.confidence, regime, previousScore: r.previous, scoreDelta: r.previous === null ? null : Number((r.score - r.previous).toFixed(2)), components: r.components, drivers: r.drivers, scoringVersion: cfg.version })));
    if (candidates.length) await db.insert(b3TradeCandidates).values(candidates.map((c) => ({ analysisId, candidateDate: scoreDate, session: input.session, computedAt: now, instrument: c.instrument, bias: c.bias, score: c.score, usdScore: c.usd_score, brlScore: c.brl_score, regime, confidence: c.confidence, priority: c.priority, eventRisk: c.event_risk, eventRiskEvents: c.event_risk_events, reason: c.reason })));
    await db.update(b3MacroAnalyses).set({ resultJson: result, warnings, model, promptVersion, eventsCount: eventsSaved, regime, winScore: win.score, dolDivergence: dol.divergence }).where(eq(b3MacroAnalyses.id, analysisId));
  }
  return result;
}

export { aggregate };
