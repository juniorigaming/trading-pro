/** Helpers de data do diário: o campo `trades.date` representa um DIA civil, não um instante. */
export function tradeDayKey(value: string | Date | null | undefined): string {
  if (value == null) return "";
  const raw = typeof value === "string" ? value : value.toISOString();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (match) return match[1];
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Dia de hoje no fuso local do usuário (o diário é pessoal e não é UTC). */
export function localTodayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function dayOrdinal(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return Number.NaN;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

export function weekdayIndex(key: string): number {
  const ordinal = dayOrdinal(key);
  return Number.isFinite(ordinal) ? new Date(ordinal * 86_400_000).getUTCDay() : 0;
}

export function formatTradeDate(value: string | Date | null | undefined): string {
  const key = tradeDayKey(value);
  if (!key) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}T00:00:00.000Z`));
}

export function shiftDayKey(key: string, days: number): string {
  const ordinal = dayOrdinal(key);
  if (!Number.isFinite(ordinal)) return key;
  const d = new Date((ordinal + days) * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
