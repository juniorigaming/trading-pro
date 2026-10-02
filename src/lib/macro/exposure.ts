/**
 * Currency Exposure — detecta quando várias operações são "a mesma aposta".
 * short AUDUSD + short AUDCHF + short AUDJPY ⇒ AUD −3, USD +1, CHF +1, JPY +1.
 */
import { splitSymbol } from "./pairs";

export interface OpenTradeLike { id?: number; symbol: string; direction: "BUY" | "SELL" | "LONG" | "SHORT"; riskR?: number | null }

export interface ExposureResult {
  exposure: Record<string, number>; // moeda → unidades (±1 por trade, ponderado por riskR se informado)
  openTrades: { id?: number; symbol: string; direction: string; base: string; quote: string }[];
  alerts: { level: "WARNING" | "DANGER"; currency: string; message: string }[];
  correlatedGroups: { currency: string; side: "LONG" | "SHORT"; symbols: string[] }[];
}

export function computeExposure(trades: OpenTradeLike[], opts: { warnAt?: number; dangerAt?: number } = {}): ExposureResult {
  const warnAt = opts.warnAt ?? 2, dangerAt = opts.dangerAt ?? 3;
  const exposure: Record<string, number> = {};
  const openTrades: ExposureResult["openTrades"] = [];
  const groups = new Map<string, string[]>();
  for (const t of trades) {
    const parts = splitSymbol(t.symbol);
    if (!parts) continue;
    const long = t.direction === "BUY" || t.direction === "LONG";
    const w = t.riskR && t.riskR > 0 ? t.riskR : 1;
    exposure[parts.base] = (exposure[parts.base] ?? 0) + (long ? w : -w);
    exposure[parts.quote] = (exposure[parts.quote] ?? 0) + (long ? -w : w);
    openTrades.push({ id: t.id, symbol: t.symbol.toUpperCase(), direction: long ? "LONG" : "SHORT", base: parts.base, quote: parts.quote });
    const kb = `${parts.base}:${long ? "LONG" : "SHORT"}`, kq = `${parts.quote}:${long ? "SHORT" : "LONG"}`;
    groups.set(kb, [...(groups.get(kb) ?? []), t.symbol.toUpperCase()]);
    groups.set(kq, [...(groups.get(kq) ?? []), t.symbol.toUpperCase()]);
  }
  for (const k of Object.keys(exposure)) exposure[k] = Number(exposure[k].toFixed(2));
  const alerts: ExposureResult["alerts"] = [];
  const correlatedGroups: ExposureResult["correlatedGroups"] = [];
  for (const [key, symbols] of groups) {
    if (symbols.length < 2) continue;
    const [currency, side] = key.split(":") as [string, "LONG" | "SHORT"];
    correlatedGroups.push({ currency, side, symbols });
  }
  for (const [ccy, v] of Object.entries(exposure)) {
    const a = Math.abs(v);
    if (a >= dangerAt) alerts.push({ level: "DANGER", currency: ccy, message: `High correlated exposure to ${ccy} ${v < 0 ? "weakness" : "strength"} (${v > 0 ? "+" : ""}${v}).` });
    else if (a >= warnAt) alerts.push({ level: "WARNING", currency: ccy, message: `Correlated exposure building on ${ccy} (${v > 0 ? "+" : ""}${v}).` });
  }
  return { exposure, openTrades, alerts, correlatedGroups };
}

/** Verifica se um novo trade aumentaria a concentração. */
export function wouldIncreaseConcentration(current: ExposureResult, symbol: string, direction: "LONG" | "SHORT", threshold = 2): { ok: boolean; message: string | null } {
  const parts = splitSymbol(symbol);
  if (!parts) return { ok: true, message: null };
  const long = direction === "LONG";
  const nb = (current.exposure[parts.base] ?? 0) + (long ? 1 : -1);
  const nq = (current.exposure[parts.quote] ?? 0) + (long ? -1 : 1);
  for (const [ccy, v] of [[parts.base, nb], [parts.quote, nq]] as [string, number][]) {
    if (Math.abs(v) >= threshold && Math.abs(v) > Math.abs(current.exposure[ccy] ?? 0)) return { ok: false, message: `Esse trade elevaria a exposição em ${ccy} para ${v > 0 ? "+" : ""}${v} (correlação alta).` };
  }
  return { ok: true, message: null };
}
