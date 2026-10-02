/**
 * Event Risk — classifica risco de eventos PENDENTES (nunca realizados) para moedas e pares.
 * LOW < MEDIUM < HIGH < EXTREME
 */
import type { Currency, EventRiskLevel, PendingEventView } from "@/lib/ai/types";

export interface EventRiskOptions {
  horizonHours?: number; // janela considerada (default 12h)
  now?: Date;
}

const ORDER: EventRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "EXTREME"];
export function maxRisk(a: EventRiskLevel, b: EventRiskLevel): EventRiskLevel { return ORDER[Math.max(ORDER.indexOf(a), ORDER.indexOf(b))]; }

/** Peso individual de um evento pendente dado impacto e proximidade. */
function eventScore(e: PendingEventView): number {
  const base = e.impact === "high" ? 3 : e.impact === "medium" ? 1.5 : e.impact === "low" ? 0.5 : 1;
  const m = e.minutes_until;
  const proximity = m <= 60 ? 1.5 : m <= 180 ? 1.25 : m <= 360 ? 1.0 : m <= 720 ? 0.75 : 0.5;
  return base * proximity;
}

/**
 * Risco para um conjunto de moedas (1 moeda = card; 2 moedas = par).
 * EXTREME: evento high nas DUAS pernas, ou ≥2 eventos high na janela, ou high em ≤60 min.
 */
export function eventRiskFor(currencies: Currency[], pending: PendingEventView[], opts: EventRiskOptions = {}): { level: EventRiskLevel; events: PendingEventView[]; score: number } {
  const horizon = (opts.horizonHours ?? 12) * 60;
  const relevant = pending
    .filter((e) => currencies.includes(e.currency) && e.minutes_until >= 0 && e.minutes_until <= horizon)
    .sort((a, b) => a.minutes_until - b.minutes_until);
  if (relevant.length === 0) return { level: "LOW", events: [], score: 0 };
  const highs = relevant.filter((e) => e.impact === "high");
  const highCcys = new Set(highs.map((e) => e.currency));
  const score = relevant.reduce((s, e) => s + eventScore(e), 0);
  let level: EventRiskLevel = "LOW";
  if (highs.length >= 1) level = "HIGH";
  else if (relevant.some((e) => e.impact === "medium")) level = "MEDIUM";
  if ((currencies.length >= 2 && highCcys.size >= 2) || highs.length >= 2 || highs.some((e) => e.minutes_until <= 60) || score >= 6) level = "EXTREME";
  else if (level === "MEDIUM" && score >= 3) level = "HIGH";
  return { level, events: relevant, score: Number(score.toFixed(2)) };
}

/** Converte linha do banco em PendingEventView com minutes_until calculado. */
export function toPendingView(e: { id: number; currency: string; event: string; scheduledAt: Date | string; impact: string; forecast: string | null; previous: string | null }, now: Date = new Date()): PendingEventView {
  const at = new Date(e.scheduledAt);
  return {
    id: e.id, currency: e.currency as Currency, event: e.event, scheduled_at: at.toISOString(), impact: e.impact,
    forecast: e.forecast, previous: e.previous, minutes_until: Math.round((at.getTime() - now.getTime()) / 60_000),
  };
}
