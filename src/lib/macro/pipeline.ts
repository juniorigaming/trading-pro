/**
 * Pipeline macro (orquestração com banco):
 *   RAW (economic_events) → interpretação IA (macro_interpretations) → scores determinísticos (currency_scores)
 *   → candidatos (trade_candidates) → event risk → brief → macro_analyses (auditoria completa)
 */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { currencyScores, economicEvents, macroAnalyses, macroInterpretations, scoringConfig, tradeCandidates } from "@/db/schema";
import { ALL_CURRENCIES, G8, type AnyCurrency, type Category, type Classification, type Confidence, type Currency, type CurrencyScoreView, type EconomicEventInput, type EventRiskLevel, type Importance, type MacroAnalysisResult, type MacroSummaryView, type PendingEventView, type Session } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/service";
import { MACRO_SYSTEM, SESSION_BRIEF, type PromptDef } from "@/lib/ai/prompts";
import { DEFAULT_SCORING_CONFIG, mergeScoringConfig, type ScoringConfig } from "./config";
import { baseContribution, computeCurrencyScores, normalizeEventKey, parseNumeric, type ScoredEvent } from "./scoring";
import { buildTradeCandidates } from "./pairs";
import { eventRiskFor, toPendingView } from "./event-risk";

export async function loadScoringConfig(): Promise<ScoringConfig> {
  try {
    const rows = await getDb().select().from(scoringConfig).where(eq(scoringConfig.isActive, true)).limit(1);
    if (rows[0]) return mergeScoringConfig({ ...(rows[0].configJson as Partial<ScoringConfig>), version: rows[0].version });
  } catch { /* tabela pode não existir ainda */ }
  return DEFAULT_SCORING_CONFIG;
}

/** Converte date + time (no fuso informado, em minutos de offset ex. -180) para Date UTC. */
export function toScheduledAt(date: string | null, time: string | null, tzOffsetMinutes = -180, fallback: Date = new Date()): Date {
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback.toISOString().slice(0, 10);
  const m = time ? /^(\d{1,2}):(\d{2})/.exec(time) : null;
  const hh = m ? Number(m[1]) : 0, mm = m ? Number(m[2]) : 0;
  const [y, mo, da] = d.split("-").map(Number);
  // hora local (offset) → UTC
  return new Date(Date.UTC(y, mo - 1, da, hh, mm) - tzOffsetMinutes * 60_000);
}

export interface SaveRawOptions { tzOffsetMinutes?: number; sourceRef?: string | null; userEdits?: Record<string, unknown> | null }

/** Upsert dos eventos RAW. Marca supersede quando chega release novo do mesmo event_key. */
export async function saveRawEvents(events: EconomicEventInput[], opts: SaveRawOptions = {}): Promise<number[]> {
  const db = getDb();
  const ids: number[] = [];
  for (const e of events) {
    if (!(ALL_CURRENCIES as readonly string[]).includes(e.currency) || !e.event?.trim()) continue;
    const scheduledAt = toScheduledAt(e.date, e.time, opts.tzOffsetMinutes ?? -180);
    const eventKey = normalizeEventKey(e.currency, e.event);
    const actual = e.actual && e.actual.trim() ? e.actual.trim() : null;
    const status = actual ? "released" : "pending";
    const values = {
      eventKey, currency: e.currency, event: e.event.trim(), impact: e.impact ?? "unknown", scheduledAt,
      actual, forecast: e.forecast?.trim() || null, previous: e.previous?.trim() || null,
      actualNum: parseNumeric(actual), forecastNum: parseNumeric(e.forecast), previousNum: parseNumeric(e.previous),
      status, source: e.source, sourceRef: opts.sourceRef ?? null, ocrConfidence: e.ocr_confidence ?? null,
      requiresManualConfirmation: !!e.requires_manual_confirmation, userEdited: !!e.user_edited,
      userEdits: e.user_edited ? (opts.userEdits ?? null) : null, updatedAt: new Date(),
    };
    const existing = await db.select({ id: economicEvents.id, actual: economicEvents.actual }).from(economicEvents)
      .where(and(eq(economicEvents.eventKey, eventKey), eq(economicEvents.scheduledAt, scheduledAt))).limit(1);
    const [row] = await db.insert(economicEvents).values(values)
      .onConflictDoUpdate({
        target: [economicEvents.eventKey, economicEvents.scheduledAt],
        set: {
          actual: values.actual, forecast: values.forecast, previous: values.previous, actualNum: values.actualNum, forecastNum: values.forecastNum, previousNum: values.previousNum,
          status: values.status, impact: values.impact, ocrConfidence: values.ocrConfidence, requiresManualConfirmation: values.requiresManualConfirmation,
          userEdited: values.userEdited, userEdits: values.userEdits, updatedAt: new Date(),
        },
      }).returning({ id: economicEvents.id });
    ids.push(row.id);
    // Se o Actual mudou (correção manual ou revisão), a interpretação antiga deixa de valer.
    if (existing[0] && existing[0].actual !== actual) {
      await db.update(macroInterpretations).set({ isCurrent: false }).where(and(eq(macroInterpretations.eventId, row.id), eq(macroInterpretations.isCurrent, true)));
    }
    if (status === "released") {
      // supersede releases anteriores do mesmo indicador (dado novo substitui o antigo)
      await db.update(economicEvents)
        .set({ supersededBy: row.id, supersededAt: new Date() })
        .where(and(eq(economicEvents.eventKey, eventKey), eq(economicEvents.status, "released"), isNull(economicEvents.supersededBy), sql`${economicEvents.scheduledAt} < ${scheduledAt}`, sql`${economicEvents.id} <> ${row.id}`));
    }
  }
  return ids;
}

interface InterpretOutcome { interpreted: number; model: string | null; promptVersion: string | null; warnings: string[] }

export interface InterpretOptions {
  /** Moedas a interpretar (padrão: G8). O módulo B3 passa BRL/USD/CNY com prompt próprio. */
  currencies?: readonly AnyCurrency[];
  /** Prompt versionado a usar (padrão: MACRO_SYSTEM G8). */
  prompt?: PromptDef;
  /** Contexto extra enviado à IA (ex.: curva DI, Selic, fiscal) — nunca números inventados. */
  extraContext?: Record<string, unknown>;
}

/** Interpreta (IA) todos os eventos released sem interpretação corrente. Em lotes de 20. */
export async function interpretPendingEvents(cfg: ScoringConfig, analysisId: number | null, onlyIds?: number[], options: InterpretOptions = {}): Promise<InterpretOutcome> {
  const db = getDb();
  const since = new Date(Date.now() - cfg.max_age_days * 86_400_000);
  const currencies = options.currencies ?? G8;
  const prompt = options.prompt ?? MACRO_SYSTEM;
  const conds = [eq(economicEvents.status, "released"), gte(economicEvents.scheduledAt, since), inArray(economicEvents.currency, [...currencies]), sql`NOT EXISTS (SELECT 1 FROM macro_interpretations mi WHERE mi.event_id = ${economicEvents.id} AND mi.is_current = TRUE)`];
  if (onlyIds?.length) conds.push(inArray(economicEvents.id, onlyIds));
  const todo = await db.select().from(economicEvents).where(and(...conds)).orderBy(economicEvents.scheduledAt);
  if (todo.length === 0) return { interpreted: 0, model: null, promptVersion: null, warnings: [] };

  // contexto por moeda: últimos drivers + score atual (para "já precificado" e mudança de narrativa)
  const latest = await latestScores();
  const context: Record<string, unknown> = {};
  for (const c of currencies) {
    const s = latest.find((x) => x.currency === c);
    context[c] = s ? { score: s.score, classification: s.classification, drivers: s.drivers.slice(0, 4).map((d) => `${d.event} (${d.classification})`) } : { score: 0, classification: "NEUTRAL", drivers: [] };
  }

  const warnings: string[] = [];
  let interpreted = 0; let model: string | null = null; let promptVersion: string | null = null;

  // Lotes MENORES em PARALELO: cada chamada gera menos tokens (responde mais rápido)
  // e várias correm ao mesmo tempo — o tempo total vira ~o da chamada mais lenta, não a soma.
  const BATCH_SIZE = 8;
  const MAX_PARALLEL = 3;
  const batches: (typeof todo)[] = [];
  for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));

  const runBatch = async (batch: typeof todo) => {
    const payload = batch.map((e) => ({ id: e.id, currency: e.currency, event: e.event, impact: e.impact, scheduled_at: e.scheduledAt.toISOString(), actual: e.actual, forecast: e.forecast, previous: e.previous }));
    const res = await generateStructured({
      purpose: prompt === MACRO_SYSTEM ? "macro_interpret" : "b3_macro_interpret", prompt, schemaName: "event_interpretation", temperature: 0.2,
      timeoutMs: 60_000,
      user: JSON.stringify({ events: payload, context_by_currency: context, ...(options.extraContext ? { extra_context: options.extraContext } : {}) }, null, 0),
    });
    model = res.model; promptVersion = res.promptVersion;
    const byId = new Map(batch.map((e) => [e.id, e]));
    // Um ÚNICO insert com todas as linhas do lote (antes: 1 round-trip por evento).
    const rows: (typeof macroInterpretations.$inferInsert)[] = [];
    for (const it of res.data.interpretations) {
      const ev = byId.get(it.event_id);
      if (!ev) { warnings.push(`IA retornou event_id desconhecido ${it.event_id}`); continue; }
      const bc = baseContribution({ category: it.category, importance: it.importance, classification: it.classification, confidence: it.confidence, impact: ev.impact as ScoredEvent["impact"] }, cfg);
      rows.push({
        eventId: ev.id, analysisId, category: it.category, subcategory: it.subcategory, importance: it.importance, classification: it.classification,
        directionValue: bc.direction_value, surpriseVsForecast: it.surprise_vs_forecast, changeVsPrevious: it.change_vs_previous,
        growthImplication: it.growth_implication, inflationImplication: it.inflation_implication, fiscalImplication: it.fiscal_implication, centralBank: it.central_bank, centralBankImplication: it.central_bank_implication,
        pricedIn: it.priced_in, currencyImplication: it.currency_implication, confidence: it.confidence, reasoningSummary: it.reasoning_summary,
        weight: bc.weight, impactFactor: bc.impact_factor, confidenceFactor: bc.confidence_factor, scoreContribution: bc.base_contribution,
        scoringVersion: cfg.version, promptVersion: res.promptVersion, model: res.model, isCurrent: true,
      });
    }
    if (rows.length) { await db.insert(macroInterpretations).values(rows); interpreted += rows.length; }
    const missing = batch.filter((e) => !res.data.interpretations.some((x) => x.event_id === e.id));
    if (missing.length) warnings.push(`${missing.length} evento(s) sem interpretação neste lote: ${missing.map((m) => m.event).join(", ")}`);
  };

  for (let i = 0; i < batches.length; i += MAX_PARALLEL) {
    const group = batches.slice(i, i + MAX_PARALLEL);
    const results = await Promise.allSettled(group.map(runBatch));
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    // Todos falharam ⇒ propaga (o chamador avisa e o RAW fica salvo). Falha parcial vira aviso.
    if (failed.length === group.length) throw failed[0].reason;
    for (const f of failed) warnings.push(`Um lote de eventos não pôde ser interpretado: ${String(f.reason).slice(0, 120)}`);
  }


  return { interpreted, model, promptVersion, warnings };
}

/** Último snapshot de score por moeda (qualquer sessão). */
export async function latestScores(): Promise<CurrencyScoreView[]> {
  const rows = await getDb().execute(sql`SELECT DISTINCT ON (currency) * FROM currency_scores ORDER BY currency, computed_at DESC`);
  return (rows.rows as Record<string, unknown>[]).map(rowToScoreView).sort((a, b) => a.rank - b.rank);
}

function rowToScoreView(r: Record<string, unknown>): CurrencyScoreView {
  return {
    currency: r.currency as Currency, score: Number(r.score), score_raw: Number(r.score_raw), previous_score: r.previous_score === null ? null : Number(r.previous_score),
    score_delta: r.score_delta === null ? null : Number(r.score_delta), momentum: (r.momentum as CurrencyScoreView["momentum"]) ?? null,
    classification: r.classification as CurrencyScoreView["classification"], bias: r.bias as CurrencyScoreView["bias"], confidence: r.confidence as Confidence,
    rank: Number(r.rank), live_events: Number(r.live_events ?? 0), drivers: (r.drivers as CurrencyScoreView["drivers"]) ?? [],
    // Campos derivados para snapshots gravados antes da v2 (mantém a UI numa única escala).
    score_display: Number((Number(r.score) * DEFAULT_SCORING_CONFIG.display_scale).toFixed(2)),
    no_data: Number(r.live_events ?? 0) === 0,
  };
}

export async function loadPendingEvents(now = new Date(), horizonHours = 72): Promise<PendingEventView[]> {
  const to = new Date(now.getTime() + horizonHours * 3_600_000);
  const from = new Date(now.getTime() - 30 * 60_000); // tolerância de 30 min p/ eventos "agora"
  const rows = await getDb().select().from(economicEvents)
    .where(and(eq(economicEvents.status, "pending"), gte(economicEvents.scheduledAt, from), sql`${economicEvents.scheduledAt} <= ${to}`))
    .orderBy(economicEvents.scheduledAt);
  return rows.map((r) => toPendingView(r, now));
}

/** Eventos released + interpretação corrente → ScoredEvent[] (todas as moedas; quem consome filtra). */
export async function loadScoredEvents(cfg: ScoringConfig): Promise<ScoredEvent[]> {
  const since = new Date(Date.now() - cfg.max_age_days * 86_400_000);
  const rows = await getDb().select({
    id: economicEvents.id, currency: economicEvents.currency, event: economicEvents.event, impact: economicEvents.impact, scheduledAt: economicEvents.scheduledAt,
    supersededBy: economicEvents.supersededBy, category: macroInterpretations.category, importance: macroInterpretations.importance,
    classification: macroInterpretations.classification, confidence: macroInterpretations.confidence,
  }).from(economicEvents)
    .innerJoin(macroInterpretations, and(eq(macroInterpretations.eventId, economicEvents.id), eq(macroInterpretations.isCurrent, true)))
    .where(and(eq(economicEvents.status, "released"), gte(economicEvents.scheduledAt, since)));
  return rows.map((r) => ({
    event_id: r.id, currency: r.currency as AnyCurrency, event: r.event, impact: r.impact as ScoredEvent["impact"], released_at: r.scheduledAt,
    superseded: r.supersededBy !== null, category: r.category as Category, importance: r.importance as Importance,
    classification: r.classification as Classification, confidence: r.confidence as Confidence,
  }));
}

export interface RecomputeOptions { session: Session; analysisId?: number | null; now?: Date; cfg?: ScoringConfig; persist?: boolean }

/** Recalcula scores/candidatos/event risk e persiste snapshot. */
export async function recomputeScores(opts: RecomputeOptions): Promise<Omit<MacroAnalysisResult, "analysis_id" | "meta"> & { meta: { scoring_version: string } }> {
  const cfg = opts.cfg ?? (await loadScoringConfig());
  const now = opts.now ?? new Date();
  const db = getDb();
  const [events, prev, pending] = await Promise.all([loadScoredEvents(cfg), latestScores(), loadPendingEvents(now)]);
  const previousScores = Object.fromEntries(prev.map((p) => [p.currency, p.score])) as Partial<Record<Currency, number>>;
  const scores = computeCurrencyScores({ events, now, previousScores, cfg });
  const candidates = buildTradeCandidates({ scores, pending, cfg, eventRiskFor: (ccys, p) => eventRiskFor(ccys, p, { horizonHours: cfg.event_risk_hours.overnight }) });
  const eventRisk = G8.map((c) => {
    const s = scores.find((x) => x.currency === c)!;
    const r = eventRiskFor([c], pending, { horizonHours: 12 });
    return { currency: c, current_bias: s.bias, level: r.level, events: r.events };
  });
  // Pares a evitar — UM registro por símbolo (motivos agregados), sem repetição.
  const avoidMap = new Map<string, string[]>();
  const addAvoid = (symbol: string, reason: string) => {
    const cur = avoidMap.get(symbol) ?? [];
    if (!cur.includes(reason)) cur.push(reason);
    avoidMap.set(symbol, cur);
  };
  for (const c of candidates) {
    if (c.event_risk === "EXTREME") addAvoid(c.symbol, `Event risk EXTREME: ${c.event_risk_events.slice(0, 2).map((e) => `${e.currency} ${e.event}`).join(" + ")}`);
    const sShift = scores.find((s) => s.currency === c.strong_currency)?.momentum === "NARRATIVE_SHIFT" || scores.find((s) => s.currency === c.weak_currency)?.momentum === "NARRATIVE_SHIFT";
    if (sShift) addAvoid(c.symbol, "Mudança de narrativa recente em uma das pernas — aguardar confirmação");
    if ((c.confidence_pct ?? 0) < 40) addAvoid(c.symbol, `Confiança baixa (${c.confidence_pct ?? 0}%) — evidência macro insuficiente`);
    const bs = scores.find((s) => s.currency === c.base_currency);
    const qs = scores.find((s) => s.currency === c.quote_currency);
    if (bs?.conflict || qs?.conflict) addAvoid(c.symbol, "Indicadores conflitantes (viés misto) numa das pernas");
  }
  const pairsToAvoid = [...avoidMap.entries()].map(([symbol, reasons]) => ({ symbol, reason: reasons.join(" · ") }));

  const warnings: string[] = [];
  const noData = scores.filter((s) => s.no_data).map((s) => s.currency);
  const conflicted = scores.filter((s) => s.conflict).map((s) => s.currency);
  const thin = scores.filter((s) => !s.no_data && (s.confidence_pct ?? 0) < 40).map((s) => s.currency);
  if (noData.length) warnings.push(`Sem dado interpretado no período: ${noData.join(", ")} — tratadas como NEUTRAS por ausência de evidência (não como fracas).`);
  if (thin.length) warnings.push(`Evidência fraca (confiança < 40%): ${thin.join(", ")} — score atenuado de propósito.`);
  if (conflicted.length) warnings.push(`Indicadores conflitantes (viés misto): ${conflicted.join(", ")} — confiança reduzida.`);
  if (events.length === 0) warnings.push("Nenhum dado realizado interpretado no período — ranking neutro.");

  // Resumo consolidado: fonte ÚNICA para o dashboard (a UI não recalcula nada).
  const ranked = [...scores].sort((a, b) => a.rank - b.rank);
  const withData = ranked.filter((s) => !s.no_data);
  const riskOrder: EventRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "EXTREME"];
  const overallRisk = eventRisk.reduce<EventRiskLevel>((acc, r) => (riskOrder.indexOf(r.level) > riskOrder.indexOf(acc) ? r.level : acc), "LOW");
  const alerts: string[] = [];
  for (const r of eventRisk) {
    if (r.level === "EXTREME" || r.level === "HIGH") {
      const ev = r.events[0];
      alerts.push(`${r.currency}: risco ${r.level}${ev ? ` — ${ev.event} em ${ev.minutes_until < 60 ? `${ev.minutes_until}min` : `${(ev.minutes_until / 60).toFixed(1)}h`}` : ""}. O viés pode mudar após o dado.`);
    }
  }
  for (const sc of scores) if (sc.momentum === "NARRATIVE_SHIFT") alerts.push(`${sc.currency}: mudança de narrativa — reavalie posições abertas nessa moeda.`);
  const summary: MacroSummaryView = {
    strongest: withData[0] ? { currency: withData[0].currency, score: withData[0].score_display ?? withData[0].score, confidence_pct: withData[0].confidence_pct ?? 0 } : null,
    weakest: withData.length > 1 ? { currency: withData[withData.length - 1].currency, score: withData[withData.length - 1].score_display ?? withData[withData.length - 1].score, confidence_pct: withData[withData.length - 1].confidence_pct ?? 0 } : null,
    overall_risk: overallRisk,
    no_data_currencies: noData,
    conflicted_currencies: conflicted,
    top_long: candidates.filter((c) => c.bias === "LONG").slice(0, 3),
    top_short: candidates.filter((c) => c.bias === "SHORT").slice(0, 3),
    alerts,
  };

  if (opts.persist !== false) {
    const scoreDate = now.toISOString().slice(0, 10);
    await db.insert(currencyScores).values(scores.map((s) => ({
      analysisId: opts.analysisId ?? null, scoreDate, session: opts.session, computedAt: now, currency: s.currency, score: s.score, scoreRaw: s.score_raw,
      classification: s.classification, bias: s.bias, confidence: s.confidence, rank: s.rank, previousScore: s.previous_score, scoreDelta: s.score_delta,
      momentum: s.momentum, liveEvents: s.live_events, drivers: s.drivers, scoringVersion: cfg.version,
    })));
    if (candidates.length) {
      await db.insert(tradeCandidates).values(candidates.map((c) => ({
        analysisId: opts.analysisId ?? null, candidateDate: scoreDate, session: opts.session, computedAt: now, symbol: c.symbol, bias: c.bias,
        strongCurrency: c.strong_currency, weakCurrency: c.weak_currency, strongScore: c.strong_score, weakScore: c.weak_score, macroDivergence: c.macro_divergence,
        confidence: c.confidence, priority: c.priority, eventRisk: c.event_risk, eventRiskEvents: c.event_risk_events, reason: c.reason,
      })));
    }
  }
  return {
    date: now.toISOString().slice(0, 10), session: opts.session, currencies: scores, ranking: scores.map((s) => s.currency), trade_candidates: candidates,
    pending_events: pending.slice(0, 30), event_risk: eventRisk, pairs_to_avoid: pairsToAvoid, summary, warnings, meta: { scoring_version: cfg.version },
  };
}

export interface RunAnalysisInput {
  session: Session;
  events: EconomicEventInput[];
  inputType: "screenshot" | "structured" | "manual";
  imagesCount?: number;
  tzOffsetMinutes?: number;
  userEdits?: Record<string, unknown> | null;
  withBrief?: boolean;
}

/** Fluxo completo: salvar RAW → interpretar → recomputar → brief → registrar análise. */
export async function runMacroAnalysis(input: RunAnalysisInput): Promise<MacroAnalysisResult> {
  const startedAt = Date.now();
  const db = getDb();
  const cfg = await loadScoringConfig();
  const now = new Date();
  const [analysis] = await db.insert(macroAnalyses).values({
    analysisDate: now.toISOString().slice(0, 10), session: input.session, inputType: input.inputType, imagesCount: input.imagesCount ?? 0,
    eventsCount: input.events.length, scoringVersion: cfg.version, resultJson: {}, warnings: [],
  }).returning({ id: macroAnalyses.id });

  const ids = await saveRawEvents(input.events, { tzOffsetMinutes: input.tzOffsetMinutes, sourceRef: `analysis:${analysis.id}`, userEdits: input.userEdits ?? null });
  // Interpretação é tolerante a falha da IA: o RAW já está salvo e o que já foi interpretado é reaproveitado.
  // Se a IA cair (503/429), devolvemos o ranking com os dados disponíveis + aviso para repetir — nada se perde.
  let interp: InterpretOutcome;
  let aiFailure: string | null = null;
  try { interp = await interpretPendingEvents(cfg, analysis.id); }
  catch (e) { aiFailure = (e as Error).message; interp = { interpreted: 0, model: null, promptVersion: null, warnings: [] }; }
  const computed = await recomputeScores({ session: input.session, analysisId: analysis.id, now, cfg });
  const warnings = [...computed.warnings, ...interp.warnings];
  if (aiFailure) warnings.unshift(`IA indisponível ao interpretar eventos (${aiFailure.slice(0, 160)}). Os eventos ficaram salvos; aguarde ~1 min e clique em "Confirmar e analisar" de novo — só o que faltou será enviado à IA.`);

  // Orçamento de tempo: o brief narrativo é um EXTRA. Se a interpretação já consumiu o tempo,
  // devolvemos o ranking na hora em vez de segurar o usuário numa segunda chamada de IA.
  const elapsedMs = Date.now() - startedAt;
  const BRIEF_BUDGET_MS = 70_000;
  if (input.withBrief !== false && !aiFailure && elapsedMs > BRIEF_BUDGET_MS) {
    warnings.push(`Brief narrativo pulado: a interpretação levou ${Math.round(elapsedMs / 1000)}s e o ranking já estava pronto. Scores, candidatos e risco abaixo estão completos.`);
  } else if (input.withBrief !== false && !aiFailure) {
    try {
      const brief = await generateStructured({
        purpose: "session_brief", prompt: SESSION_BRIEF, schemaName: "session_brief", temperature: 0.3, timeoutMs: 45_000,
        user: JSON.stringify({ session: input.session, date: computed.date, currency_scores: computed.currencies, ranking: computed.ranking, pair_candidates: computed.trade_candidates.slice(0, 6), pending_events: computed.pending_events.slice(0, 12), pairs_to_avoid: computed.pairs_to_avoid }),
      });
      for (const r of brief.data.candidate_reasons) {
        const c = computed.trade_candidates.find((x) => x.symbol === r.symbol);
        if (c) c.reason = `${r.reason} O que observar: ${r.what_to_look_for} Invalidação macro: ${r.invalidation}`;
      }
      for (const p of brief.data.pairs_to_avoid) if (!computed.pairs_to_avoid.some((x) => x.symbol === p.symbol)) computed.pairs_to_avoid.push(p);
      warnings.push(...brief.data.warnings.map((w) => `IA: ${w}`));
      if (brief.data.headline) warnings.unshift(`Brief: ${brief.data.headline} — ${brief.data.narrative}`);
      // persiste reasons nos candidatos
      await Promise.all(computed.trade_candidates.map((c) => db.update(tradeCandidates).set({ reason: c.reason }).where(and(eq(tradeCandidates.analysisId, analysis.id), eq(tradeCandidates.symbol, c.symbol)))));
    } catch (e) {
      warnings.push(`Brief da sessão indisponível: ${(e as Error).message}`);
    }
  }

  const result: MacroAnalysisResult = {
    analysis_id: String(analysis.id), ...computed,
    meta: { scoring_version: cfg.version, prompt_version: interp.promptVersion, model: interp.model, events_interpreted: interp.interpreted },
    warnings,
  };
  await db.update(macroAnalyses).set({ resultJson: result, warnings, model: interp.model, promptVersion: interp.promptVersion, eventsCount: ids.length }).where(eq(macroAnalyses.id, analysis.id));
  return result;
}

export async function getLatestAnalysis(session?: Session): Promise<MacroAnalysisResult | null> {
  const q = getDb().select().from(macroAnalyses).orderBy(desc(macroAnalyses.createdAt)).limit(1);
  const rows = session ? await q.where(eq(macroAnalyses.session, session)) : await q;
  const r = rows[0];
  if (!r || !r.resultJson || Object.keys(r.resultJson as object).length === 0) return null;
  return r.resultJson as MacroAnalysisResult;
}

export async function getScoreHistory(days: 7 | 30 | 90, currency?: Currency) {
  const since = new Date(Date.now() - days * 86_400_000);
  const conds = [gte(currencyScores.computedAt, since)];
  if (currency) conds.push(eq(currencyScores.currency, currency));
  const rows = await getDb().select({ currency: currencyScores.currency, score: currencyScores.score, computedAt: currencyScores.computedAt, session: currencyScores.session, scoreDate: currencyScores.scoreDate })
    .from(currencyScores).where(and(...conds)).orderBy(currencyScores.computedAt);
  return rows.map((r) => ({ currency: r.currency, score: r.score, computed_at: r.computedAt.toISOString(), session: r.session, date: r.scoreDate }));
}
