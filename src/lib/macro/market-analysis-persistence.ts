import { G8, type EconomicEventInput } from "@/lib/ai/types";
import type { MacroEvidenceEvent, MacroEvidenceSnapshot } from "./market-analysis-types";

const IMPACTS = ["high", "medium", "low", "holiday", "unknown"] as const;
const SOURCES = ["screenshot_ai", "calendar_api", "manual"] as const;

function asUtcDateTime(event: MacroEvidenceEvent, tzOffsetMinutes: number): Date | null {
  if (event.origin === "saved_database" && event.scheduledAt) {
    const storedInstant = new Date(event.scheduledAt);
    if (Number.isFinite(storedInstant.getTime())) return storedInstant;
  }

  const date = event.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const localTime = event.origin === "user_confirmed"
    ? event.scheduledAt?.match(/[ T](\d{1,2}):(\d{2})/)?.slice(1)
    : null;
  const hours = localTime ? Number(localTime[0]) : 0;
  const minutes = localTime ? Number(localTime[1]) : 0;
  const [year, month, day] = date.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return null;
  if (hours > 23 || minutes > 59) return null;
  const instant = new Date(Date.UTC(year, month - 1, day, hours, minutes) - tzOffsetMinutes * 60_000);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

function normalizeName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\(.*?\)/g, " ").replace(/\b(flash|final|prelim|preliminary|revised|rev)\b/g, " ")
    .replace(/[^a-z0-9%/ ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Converte apenas evidências confirmadas em eventos do pipeline determinístico; força D1/W1 não entra no score. */
export function macroEventsForPersistence(evidence: MacroEvidenceSnapshot, tzOffsetMinutes: number): EconomicEventInput[] {
  const out: EconomicEventInput[] = [];
  const seen = new Set<string>();
  const items = [...evidence.released, ...evidence.upcoming];

  for (const item of items) {
    if (!(G8 as readonly string[]).includes(item.currency) || !item.event.trim()) continue;
    const instant = asUtcDateTime(item, tzOffsetMinutes);
    if (!instant) continue;
    const iso = instant.toISOString();
    const normalizedEvent = normalizeName(item.event);
    const key = `${item.currency}|${normalizedEvent}|${iso}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const impact = (IMPACTS as readonly string[]).includes(item.impact)
      ? item.impact as EconomicEventInput["impact"] : "unknown";
    const source = (SOURCES as readonly string[]).includes(item.source)
      ? item.source as EconomicEventInput["source"] : "manual";
    const actual = item.kind === "released" ? item.actual?.trim() || null : null;

    out.push({
      date: iso.slice(0, 10),
      time: iso.slice(11, 16),
      currency: item.currency,
      event: item.event.trim(),
      impact,
      actual,
      forecast: item.forecast?.trim() || null,
      previous: item.previous?.trim() || null,
      source,
      requires_manual_confirmation: false,
      user_edited: false,
    });
  }
  return out;
}
