/**
 * Pipeline macro (orquestração com banco):
 *   RAW (economic_events) → interpretação IA (macro_interpretations) → scores determinísticos (currency_scores)
 *   → candidatos (trade_candidates) → event risk → brief → macro_analyses (auditoria completa)
 */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { currencyScores, economicEvents, macroAnalyses, macroInterpretations, scoringConfig, tradeCandidates } from "@/db/schema";
import { ALL_CURRENCIES, CENTRAL_BANKS, EXTRA_CURRENCIES, G8, type AnalysisAudit, type AnyCurrency, type AuditCheck, type Category, type Classification, type Confidence, type Currency, type CurrencyScoreView, type EconomicEventInput, type EventRiskLevel, type Importance, type MacroAnalysisResult, type MacroSummaryView, type PendingEventView, type Session } from "@/lib/ai/types";
import { generateStructured } from "@/lib/ai/service";
import { MACRO_SYSTEM, SESSION_BRIEF, type PromptDef } from "@/lib/ai/prompts";
import { DEFAULT_SCORING_CONFIG, mergeScoringConfig, type ScoringConfig } from "./config";
import { baseContribution, computeCurrencyScores, normalizeEventKey, parseNumeric, type ScoredEvent } from "./scoring";
import { buildTradeCandidates } from "./pairs";
import { eventRiskFor, toPendingView } from "./event-risk";
import { classifyRelease, IMPACT_TO_IMPORTANCE } from "./indicators";

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
      user: JSON.stringify({ events: payload, ...(options.extraContext ? { extra_context: options.extraContext } : {}) }, null, 0),
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

export async function loadPendingEvents(now = new Date(), horizonHours = 72, scope?: { analysisId?: number | null }): Promise<PendingEventView[]> {
  const to = new Date(now.getTime() + horizonHours * 3_600_000);
  const from = new Date(now.getTime() - 30 * 60_000); // tolerância de 30 min p/ eventos "agora"
  const conds = [eq(economicEvents.status, "pending"), gte(economicEvents.scheduledAt, from), sql`${economicEvents.scheduledAt} <= ${to}`];
  if (scope) {
    if (!scope.analysisId) return [];
    conds.push(eq(economicEvents.sourceRef, `analysis:${scope.analysisId}`));
  }
  const rows = await getDb().select().from(economicEvents).where(and(...conds)).orderBy(economicEvents.scheduledAt);
  return rows.map((r) => toPendingView(r, now));
}

/**
 * Eventos liberados + classificação corrente → ScoredEvent[].
 *  - scope undefined (B3): comportamento anterior, janela de max_age_days.
 *  - scope.analysisId (G8): EXCLUSIVAMENTE os eventos daquela análise. Nada de análises antigas.
 */
export async function loadScoredEvents(cfg: ScoringConfig, scope?: { analysisId?: number | null }): Promise<ScoredEvent[]> {
  if (scope && !scope.analysisId) return [];
  const conds = [eq(economicEvents.status, "released")];
  if (scope?.analysisId) conds.push(eq(macroInterpretations.analysisId, scope.analysisId));
  else { const since = new Date(Date.now() - cfg.max_age_days * 86_400_000); conds.push(gte(economicEvents.scheduledAt, since)); }
  const rows = await getDb().select({
    id: economicEvents.id, currency: economicEvents.currency, event: economicEvents.event, impact: economicEvents.impact, scheduledAt: economicEvents.scheduledAt,
    eventKey: economicEvents.eventKey, supersededBy: economicEvents.supersededBy, actual: economicEvents.actual, forecast: economicEvents.forecast, previous: economicEvents.previous,
    source: economicEvents.source, category: macroInterpretations.category, importance: macroInterpretations.importance,
    classification: macroInterpretations.classification, confidence: macroInterpretations.confidence, surpriseVsForecast: macroInterpretations.surpriseVsForecast,
    ruleId: macroInterpretations.subcategory, explanation: macroInterpretations.reasoningSummary,
  }).from(economicEvents)
    .innerJoin(macroInterpretations, and(eq(macroInterpretations.eventId, economicEvents.id), eq(macroInterpretations.isCurrent, true)))
    .where(and(...conds));

  // Dentro de uma análise, a "supersede" é recalculada só entre seus próprios eventos (mesmo indicador, release mais recente vence).
  const latestByKey = new Map<string, Date>();
  if (scope?.analysisId) for (const r of rows) { const cur = latestByKey.get(r.eventKey); if (!cur || r.scheduledAt > cur) latestByKey.set(r.eventKey, r.scheduledAt); }

  return rows.map((r) => {
    const scoped = !!scope?.analysisId;
    const superseded = scoped ? r.scheduledAt.getTime() < (latestByKey.get(r.eventKey)?.getTime() ?? 0) : r.supersededBy !== null;
    return {
      event_id: r.id, currency: r.currency as AnyCurrency, event: r.event, impact: r.impact as ScoredEvent["impact"], released_at: r.scheduledAt,
      superseded, category: r.category as Category, importance: r.importance as Importance,
      classification: r.classification as Classification, confidence: r.confidence as Confidence,
      actual: r.actual, forecast: r.forecast, previous: r.previous, source: r.source,
      surprise: r.surpriseVsForecast === null ? null : Number(r.surpriseVsForecast),
      reference_basis: r.forecast ? "FORECAST" : r.previous ? "PREVIOUS" : "NONE",
      rule_id: r.ruleId, explanation: r.explanation,
    };
  });
}

export interface RecomputeOptions {
  session: Session; analysisId?: number | null; now?: Date; cfg?: ScoringConfig; persist?: boolean;
  /** IDs dos RAW desta análise (para checar que nenhuma evidência veio de outra). */
  eventIds?: number[];
  classifiedCount?: number; releasedCount?: number;
  inputType?: "screenshot" | "structured" | "manual";
  extraction?: AnalysisAudit["extraction"];
}

/** Recalcula scores/candidatos/risco a partir de UMA análise (padrão: a mais recente), aplica a checagem de consistência e persiste. */
export interface RecomputeResult extends Omit<MacroAnalysisResult, "analysis_id" | "meta" | "analysis_status" | "audit"> {
  meta: { scoring_version: string }; trusted: boolean; checks: AuditCheck[]; scopeId: number | null; audit: AnalysisAudit;
}

export async function recomputeScores(opts: RecomputeOptions): Promise<RecomputeResult> {
  const cfg = opts.cfg ?? (await loadScoringConfig());
  const now = opts.now ?? new Date();
  const db = getDb();
  const scopeId = opts.analysisId ?? (await latestAnalysisId());
  const [events, pending] = await Promise.all([loadScoredEvents(cfg, { analysisId: scopeId }), loadPendingEvents(now, 72, { analysisId: scopeId })]);
  const scores = computeCurrencyScores({ events, now, cfg });
  // Moedas fora do G8 (CNY/BRL) com ATUAL nesta análise: avaliadas pelo MESMO motor, apresentadas à parte.
  // Nunca "sem dado" quando há dado; nunca dentro do ranking G8 nem dos pares.
  const extraEvents = events.filter((e) => (EXTRA_CURRENCIES as readonly string[]).includes(e.currency));
  const extraCurrencies = extraEvents.length ? computeCurrencyScores({ events: extraEvents, now, cfg, currencies: EXTRA_CURRENCIES }).filter((s) => s.status === "EVALUATED") : [];
  const candidates = buildTradeCandidates({ scores, pending, cfg, eventRiskFor: (ccys, p) => eventRiskFor(ccys, p, { horizonHours: cfg.event_risk_hours.overnight }) });
  const eventRisk = G8.map((c) => {
    const s = scores.find((x) => x.currency === c)!;
    const r = eventRiskFor([c], pending, { horizonHours: 12 });
    return { currency: c, current_bias: s.bias ?? "NEUTRAL", level: r.level, events: r.events };
  });
  // Pares a evitar — UM registro por símbolo (motivos agregados), sem repetição.
  // REGRA DE OURO: um par que entra aqui NUNCA pode aparecer no Top 3.
  const avoidMap = new Map<string, string[]>();
  const addAvoid = (symbol: string, reason: string) => {
    const cur = avoidMap.get(symbol) ?? [];
    if (!cur.includes(reason)) cur.push(reason);
    avoidMap.set(symbol, cur);
  };
  for (const c of candidates) {
    if (c.eligible === false && c.ineligible_reason) addAvoid(c.symbol, c.ineligible_reason);
    if (c.event_risk === "EXTREME") addAvoid(c.symbol, `Event risk EXTREME: ${c.event_risk_events.slice(0, 2).map((e) => `${e.currency} ${e.event}`).join(" + ")}`);
  }
  const pairsToAvoid = [...avoidMap.entries()].map(([symbol, reasons]) => ({ symbol, reason: reasons.join(" · ") }));

  const evaluated = scores.filter((s) => s.status === "EVALUATED");
  const insufficient = scores.filter((s) => s.status !== "EVALUATED").map((s) => s.currency);
  const conflicted = evaluated.filter((s) => s.conflict).map((s) => s.currency);
  const thin = evaluated.filter((s) => (s.confidence_pct ?? 0) < 40 && s.evidence_level !== "WEAK").map((s) => s.currency);
  const weak = evaluated.filter((s) => s.evidence_level === "WEAK").map((s) => s.currency);

  // Checagem de consistência — decide se o ranking pode ser apresentado.
  const releasedCount = opts.releasedCount ?? events.length;
  const classifiedCount = opts.classifiedCount ?? events.length;
  const extraction = opts.extraction ?? null;
  const { runConsistencyChecks } = await import("./consistency");
  const { trusted, checks } = runConsistencyChecks({
    ranked: scores, analysisEventIds: new Set(opts.eventIds ?? events.map((e) => e.event_id)), releasedCount, classifiedCount,
    inputType: opts.inputType ?? "manual", extraction,
  });

  const warnings: string[] = [];
  if (insufficient.length) warnings.push(`Sem dado divulgado: ${insufficient.join(", ")} — não recebem score nem posição no ranking (nunca tratadas como 0).`);
  if (weak.length) warnings.push(`Evidência fraca: ${weak.join(", ")} — score pequeno sustentado por um único dado de impacto baixo ou sem forecast; entra no ranking, não gera candidato de par.`);
  if (thin.length) warnings.push(`Evidência fraca (confiança < 40%): ${thin.join(", ")} — score atenuado de propósito.`);
  if (conflicted.length) warnings.push(`Indicadores conflitantes (viés misto): ${conflicted.join(", ")} — confiança reduzida.`);
  if (extraCurrencies.length) warnings.push(`Fora do G8 com evidência: ${extraCurrencies.map((s) => `${s.currency} ${(s.score_display ?? 0) > 0 ? "+" : ""}${s.score_display}`).join(", ")} — mostradas à parte; não entram no ranking G8 nem nos pares.`);
  if (events.length === 0) warnings.push("Nenhum evento com direção mensurável nesta análise — nenhum ranking pode ser gerado.");
  for (const c of checks) if (!c.passed) warnings.push(`Consistência — ${c.label}: ${c.detail}`);

  // Resumo consolidado: fonte ÚNICA para o dashboard. Se a análise não é confiável, não há destaques.
  const ranked = [...evaluated].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const riskOrder: EventRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "EXTREME"];
  const overallRisk = eventRisk.reduce<EventRiskLevel>((acc, r) => (riskOrder.indexOf(r.level) > riskOrder.indexOf(acc) ? r.level : acc), "LOW");
  const alerts: string[] = [];
  for (const r of eventRisk) {
    if (r.level === "EXTREME" || r.level === "HIGH") {
      const ev = r.events[0];
      alerts.push(`${r.currency}: risco ${r.level}${ev ? ` — ${ev.event} em ${ev.minutes_until < 60 ? `${ev.minutes_until}min` : `${(ev.minutes_until / 60).toFixed(1)}h`}` : ""}. O viés pode mudar após o dado.`);
    }
  }
  for (const sc of evaluated) if (sc.momentum === "NARRATIVE_SHIFT") alerts.push(`${sc.currency}: mudança de narrativa — reavalie posições abertas nessa moeda.`);
  const presentable = candidates.filter((c) => c.eligible !== false && !avoidMap.has(c.symbol));
  if (presentable.length === 0 && candidates.length > 0) {
    warnings.push(`Nenhum par atingiu a confiança mínima (${cfg.candidate_min_confidence_pct}%) — os ${candidates.length} pares com assimetria aparecem apenas em "pares a evitar".`);
  }
  const pick = (s: CurrencyScoreView) => ({ currency: s.currency, score: s.score_display ?? 0, confidence_pct: s.confidence_pct ?? 0 });
  const summary: MacroSummaryView = {
    strongest: trusted && ranked[0] ? pick(ranked[0]) : null,
    weakest: trusted && ranked.length > 1 ? pick(ranked[ranked.length - 1]) : null,
    overall_risk: overallRisk,
    no_data_currencies: insufficient,
    conflicted_currencies: conflicted,
    top_long: trusted ? presentable.filter((c) => c.bias === "LONG").slice(0, 3) : [],
    top_short: trusted ? presentable.filter((c) => c.bias === "SHORT").slice(0, 3) : [],
    alerts: trusted ? alerts : [],
  };

  const audit: AnalysisAudit = {
    analysis_id: String(scopeId ?? ""), checks, trusted, extraction,
    scores: scores.map((s) => ({ currency: s.currency, score: s.score, status: s.status, evidence_count: s.live_events, excluded_count: s.excluded_events?.length ?? 0 })),
  };

  if (opts.persist !== false && scopeId) {
    const scoreDate = now.toISOString().slice(0, 10);
    // Só moedas com evidência entram no histórico — nunca um 0 artificial.
    const persistable = evaluated;
    if (persistable.length) await db.insert(currencyScores).values(persistable.map((s) => ({
      analysisId: scopeId, scoreDate, session: opts.session, computedAt: now, currency: s.currency, score: s.score!, scoreRaw: s.score_raw ?? 0,
      classification: s.classification!, bias: s.bias ?? "NEUTRAL", confidence: s.confidence as Confidence, rank: s.rank ?? 0, previousScore: null, scoreDelta: null,
      momentum: null, liveEvents: s.live_events, drivers: s.drivers, scoringVersion: cfg.version,
    })));
    if (candidates.length) {
      await db.insert(tradeCandidates).values(candidates.map((c) => ({
        analysisId: scopeId, candidateDate: scoreDate, session: opts.session, computedAt: now, symbol: c.symbol, bias: c.bias,
        strongCurrency: c.strong_currency, weakCurrency: c.weak_currency, strongScore: c.strong_score, weakScore: c.weak_score, macroDivergence: c.macro_divergence,
        confidence: c.confidence, priority: c.priority, eventRisk: c.event_risk, eventRiskEvents: c.event_risk_events, reason: c.reason,
      })));
    }
  }
  return {
    date: now.toISOString().slice(0, 10), session: opts.session, currencies: scores, extra_currencies: extraCurrencies, ranking: trusted ? ranked.map((s) => s.currency) : [],
    trade_candidates: candidates, pending_events: pending.slice(0, 30), event_risk: eventRisk, pairs_to_avoid: pairsToAvoid,
    summary, warnings, meta: { scoring_version: cfg.version }, trusted, checks, scopeId, audit,
  };
}

async function latestAnalysisId(): Promise<number | null> {
  const rows = await getDb().select({ id: macroAnalyses.id }).from(macroAnalyses).orderBy(desc(macroAnalyses.createdAt)).limit(1);
  return rows[0]?.id ?? null;
}

export const DETERMINISTIC_PROMPT_VERSION = "deterministic-indicator-table-v1";

/**
 * Classifica DETERMINISTICAMENTE os eventos liberados desta análise (tabela semântica, sem IA)
 * e grava uma interpretação corrente por evento. Não usa interpretação antiga.
 */
export async function classifyAnalysisEvents(cfg: ScoringConfig, analysisId: number, eventIds: number[]): Promise<{ released: number; classified: number; unknown: number }> {
  if (!eventIds.length) return { released: 0, classified: 0, unknown: 0 };
  const db = getDb();
  // Todas as moedas aceitas (G8 + CNY/BRL): quem tem ATUAL é classificado; o ranking G8 filtra depois.
  const rows = await db.select().from(economicEvents).where(and(inArray(economicEvents.id, eventIds), eq(economicEvents.status, "released"), inArray(economicEvents.currency, [...ALL_CURRENCIES])));
  if (!rows.length) return { released: 0, classified: 0, unknown: 0 };
  // Interpretações anteriores destes eventos deixam de valer (nova análise = estado limpo).
  await db.update(macroInterpretations).set({ isCurrent: false }).where(and(inArray(macroInterpretations.eventId, rows.map((r) => r.id)), eq(macroInterpretations.isCurrent, true)));
  let unknown = 0;
  const values: (typeof macroInterpretations.$inferInsert)[] = rows.map((r) => {
    const c = classifyRelease({ event: r.event, impact: r.impact, actual: r.actual, forecast: r.forecast, previous: r.previous, ocrConfidence: r.ocrConfidence });
    if (c.direction === "UNKNOWN") unknown++;
    const importance = IMPACT_TO_IMPORTANCE[r.impact] ?? "LOW";
    const bc = baseContribution({ category: c.category, importance, classification: c.classification, confidence: c.confidence, impact: r.impact as ScoredEvent["impact"] }, cfg);
    return {
      eventId: r.id, analysisId, category: c.category, subcategory: c.rule_id ?? "sem_regra", importance, classification: c.classification,
      directionValue: bc.direction_value, surpriseVsForecast: c.surprise === null ? null : c.surprise.toFixed(4),
      changeVsPrevious: c.reference_basis === "PREVIOUS" && c.surprise !== null ? c.surprise.toFixed(4) : null,
      growthImplication: "regra determinística", inflationImplication: "regra determinística",
      centralBank: CENTRAL_BANKS[r.currency as Currency] ?? "NONE", centralBankImplication: "regra determinística",
      pricedIn: null, currencyImplication: c.direction, confidence: c.confidence, reasoningSummary: c.explanation,
      weight: bc.weight, impactFactor: bc.impact_factor, confidenceFactor: bc.confidence_factor, scoreContribution: bc.base_contribution,
      scoringVersion: cfg.version, promptVersion: DETERMINISTIC_PROMPT_VERSION, model: "code", isCurrent: true,
    };
  });
  await db.insert(macroInterpretations).values(values);
  return { released: rows.length, classified: values.length, unknown };
}

export interface RunAnalysisInput {
  session: Session;
  events: EconomicEventInput[];
  inputType: "screenshot" | "structured" | "manual";
  imagesCount?: number;
  tzOffsetMinutes?: number;
  userEdits?: Record<string, unknown> | null;
  withBrief?: boolean;
  /** Auditoria da extração (JSON bruto, aceitos/rejeitados, verificação visual). */
  extraction?: AnalysisAudit["extraction"];
}

/** Fluxo G8: RAW desta análise → classificação determinística → scores só desta análise → checagem → (IA) explicação. */
export async function runMacroAnalysis(input: RunAnalysisInput): Promise<MacroAnalysisResult> {
  const db = getDb();
  const cfg = await loadScoringConfig();
  const now = new Date();
  const [analysis] = await db.insert(macroAnalyses).values({
    analysisDate: now.toISOString().slice(0, 10), session: input.session, inputType: input.inputType, imagesCount: input.imagesCount ?? 0,
    eventsCount: input.events.length, scoringVersion: cfg.version, resultJson: {}, warnings: [],
  }).returning({ id: macroAnalyses.id });

  const ids = await saveRawEvents(input.events, { tzOffsetMinutes: input.tzOffsetMinutes, sourceRef: `analysis:${analysis.id}`, userEdits: input.userEdits ?? null });
  const cls = await classifyAnalysisEvents(cfg, analysis.id, ids);
  const computed = await recomputeScores({
    session: input.session, analysisId: analysis.id, now, cfg, eventIds: ids, releasedCount: cls.released, classifiedCount: cls.classified,
    inputType: input.inputType, extraction: input.extraction ?? null,
  });
  const warnings = [...computed.warnings];
  if (cls.unknown > 0) warnings.push(`${cls.unknown} evento(s) com direção não mensurável — listados em "excluded_events", não pontuam.`);

  // IA apenas para EXPLICAR (brief). Só roda com ranking confiável e dentro do orçamento de tempo.
  if (input.withBrief !== false && computed.trusted && computed.ranking.length) {
    try {
      const brief = await generateStructured({
        purpose: "session_brief", prompt: SESSION_BRIEF, schemaName: "session_brief", temperature: 0.3, timeoutMs: 45_000,
        user: JSON.stringify({ session: input.session, date: computed.date, currency_scores: computed.currencies.filter((c) => c.status === "EVALUATED"), ranking: computed.ranking, pair_candidates: computed.trade_candidates.slice(0, 6), pending_events: computed.pending_events.slice(0, 12), pairs_to_avoid: computed.pairs_to_avoid }),
      });
      for (const r of brief.data.candidate_reasons) {
        const c = computed.trade_candidates.find((x) => x.symbol === r.symbol);
        if (c) c.reason = `${r.reason} O que observar: ${r.what_to_look_for} Invalidação macro: ${r.invalidation}`;
      }
      for (const p of brief.data.pairs_to_avoid) if (!computed.pairs_to_avoid.some((x) => x.symbol === p.symbol)) computed.pairs_to_avoid.push(p);
      warnings.push(...brief.data.warnings.map((w) => `IA: ${w}`));
      if (brief.data.headline) warnings.unshift(`Brief: ${brief.data.headline} — ${brief.data.narrative}`);
      await Promise.all(computed.trade_candidates.map((c) => db.update(tradeCandidates).set({ reason: c.reason }).where(and(eq(tradeCandidates.analysisId, analysis.id), eq(tradeCandidates.symbol, c.symbol)))));
    } catch (e) {
      warnings.push(`Brief da sessão indisponível: ${(e as Error).message}`);
    }
  }

  const { trusted, checks: _checks, scopeId: _scope, audit, meta: _meta, ...rest } = computed;
  const result: MacroAnalysisResult = {
    ...rest,
    analysis_id: String(analysis.id),
    analysis_status: trusted ? "OK" : "ANALISE_INSUFICIENTE",
    meta: { scoring_version: cfg.version, prompt_version: DETERMINISTIC_PROMPT_VERSION, model: "code", events_interpreted: cls.classified },
    warnings,
    audit: { ...audit, analysis_id: String(analysis.id) },
  };
  await db.update(macroAnalyses).set({ resultJson: result, warnings, model: "code", promptVersion: DETERMINISTIC_PROMPT_VERSION, eventsCount: ids.length }).where(eq(macroAnalyses.id, analysis.id));
  return result;
}

export async function getLatestAnalysis(session?: Session): Promise<MacroAnalysisResult | null> {
  const q = getDb().select().from(macroAnalyses).orderBy(desc(macroAnalyses.createdAt)).limit(1);
  const rows = session ? await q.where(eq(macroAnalyses.session, session)) : await q;
  const r = rows[0];
  if (!r || !r.resultJson || Object.keys(r.resultJson as object).length === 0) return null;
  return r.resultJson as MacroAnalysisResult;
}

/** Scores da ANÁLISE MAIS RECENTE (nunca um misto de análises). Usado pelo Ranking G8 e pelo histórico de risco. */
export async function latestScores(): Promise<CurrencyScoreView[]> {
  const a = await getLatestAnalysis();
  return a?.currencies ?? [];
}

export async function getScoreHistory(days: 7 | 30 | 90, currency?: Currency) {
  const since = new Date(Date.now() - days * 86_400_000);
  const conds = [gte(currencyScores.computedAt, since)];
  if (currency) conds.push(eq(currencyScores.currency, currency));
  const rows = await getDb().select({ currency: currencyScores.currency, score: currencyScores.score, computedAt: currencyScores.computedAt, session: currencyScores.session, scoreDate: currencyScores.scoreDate })
    .from(currencyScores).where(and(...conds)).orderBy(currencyScores.computedAt);
  return rows.map((r) => ({ currency: r.currency, score: r.score, computed_at: r.computedAt.toISOString(), session: r.session, date: r.scoreDate }));
}
