/**
 * Event Risk B3 — WIN e DOL olham BRL + USD (+ CNY para WIN via commodities).
 * Reutiliza eventRiskFor (mesma escala LOW/MEDIUM/HIGH/EXTREME) e marca eventos-chave (COPOM, IPCA, NFP, CPI, FOMC...).
 */
import type { PendingEventView } from "@/lib/ai/types";
import { eventRiskFor, maxRisk } from "@/lib/macro/event-risk";
import { B3_KEY_EVENTS, DEFAULT_B3_CONFIG, type B3Config } from "./config";
import type { B3EventRisk } from "./types";

export function keyEventLabel(e: Pick<PendingEventView, "currency" | "event">): string | null {
  for (const k of B3_KEY_EVENTS) if (k.currency === e.currency && k.re.test(e.event)) return k.label;
  return null;
}

export function b3EventRisk(pending: PendingEventView[], opts: { now?: Date; cfg?: B3Config } = {}): B3EventRisk[] {
  const cfg = opts.cfg ?? DEFAULT_B3_CONFIG;
  const horizon = cfg.event_risk_horizon_hours;
  const mark = (evs: PendingEventView[]) => evs.map((e) => ({ ...e, key_event: keyEventLabel(e) !== null }));
  const build = (instrument: "WIN" | "DOL", ccys: ("BRL" | "USD" | "CNY")[]): B3EventRisk => {
    const r = eventRiskFor(ccys, pending, { horizonHours: horizon, now: opts.now });
    let level = r.level;
    const events = mark(r.events);
    // Eventos-chave (COPOM/FOMC/CPI/NFP/IPCA) contam como high mesmo se o calendário marcou medium
    const keySoon = events.filter((e) => e.key_event && e.minutes_until <= 180);
    if (keySoon.length && level === "LOW") level = "MEDIUM";
    if (keySoon.some((e) => /COPOM|FOMC/.test(keyEventLabel(e) ?? ""))) level = maxRisk(level, "HIGH");
    if (keySoon.some((e) => /COPOM|FOMC/.test(keyEventLabel(e) ?? "") && e.minutes_until <= 60)) level = "EXTREME";
    const next = events.find((e) => e.key_event);
    return { instrument, level, events, next_key_event: next ? `${keyEventLabel(next)} (${next.currency}) em ${next.minutes_until} min` : null };
  };
  return [build("WIN", ["BRL", "USD", "CNY"]), build("DOL", ["BRL", "USD"])];
}
