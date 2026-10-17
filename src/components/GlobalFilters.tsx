"use client";
import { Search } from "lucide-react";
import { Trade } from "@/lib/types";
import { dayOrdinal, localTodayKey, tradeDayKey } from "@/lib/date";

export interface FilterState {
  period: string;
  asset: string;
  session: string;
  setup: string;
  result: string;
  direction: string;
}

export const defaultFilters: FilterState = {
  period: "all",
  asset: "all",
  session: "all",
  setup: "all",
  result: "all",
  direction: "all",
};

export function applyFilters(trades: Trade[], filters: FilterState): Trade[] {
  const today = localTodayKey();
  const todayOrdinal = dayOrdinal(today);
  const [year, month] = today.split("-");
  return trades.filter((t) => {
    const key = tradeDayKey(t.date);
    const tradeOrdinal = dayOrdinal(key);
    const diffDays = todayOrdinal - tradeOrdinal;

    if (filters.period !== "all") {
      if (filters.period === "today" && diffDays !== 0) return false;
      if (filters.period === "weekly" && (diffDays < 0 || diffDays > 6)) return false;
      if (filters.period === "monthly" && (diffDays < 0 || diffDays > 29)) return false;
      if (filters.period === "this_month" && key.slice(0, 7) !== `${year}-${month}`) return false;
      if (filters.period === "this_year" && key.slice(0, 4) !== year) return false;
    }
    if (filters.asset !== "all" && t.asset !== filters.asset) return false;
    if (filters.session !== "all" && t.session !== filters.session) return false;
    if (filters.setup !== "all" && (t.setup || "Sem setup") !== filters.setup) return false;
    if (filters.result !== "all" && t.resultType !== filters.result) return false;
    if (filters.direction !== "all" && t.direction !== filters.direction) return false;
    return true;
  });
}

interface Props {
  trades: Trade[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

export default function GlobalFilters({ trades, filters, onChange }: Props) {
  const uniqueAssets = Array.from(new Set(trades.map((t) => t.asset))).sort();
  const uniqueSessions = Array.from(new Set(trades.map((t) => t.session))).sort();
  const uniqueSetups = Array.from(new Set(trades.map((t) => t.setup || "Sem setup"))).sort();

  const update = (field: keyof FilterState, value: string) => {
    onChange({ ...filters, [field]: value });
  };

  return (
    <div className="glass-card p-4 md:p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-slate-muted" />
          <h3 className="text-sm font-bold text-text-primary">Filtros Globais</h3>
        </div>
        {JSON.stringify(filters) !== JSON.stringify(defaultFilters) && (
          <button onClick={() => onChange(defaultFilters)} className="text-[11px] text-emerald hover:underline font-medium">
            Limpar filtros
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <FilterSelect label="Período" value={filters.period} onChange={(v) => update("period", v)} options={[
          { value: "today", label: "Hoje" },
          { value: "weekly", label: "7 dias" },
          { value: "monthly", label: "30 dias" },
          { value: "this_month", label: "Este mês" },
          { value: "this_year", label: "Este ano" },
          { value: "all", label: "Todo período" },
        ]} />
        <FilterSelect label="Ativo" value={filters.asset} onChange={(v) => update("asset", v)} options={[
          { value: "all", label: "Todos" },
          ...uniqueAssets.map((a) => ({ value: a, label: a })),
        ]} />
        <FilterSelect label="Sessão" value={filters.session} onChange={(v) => update("session", v)} options={[
          { value: "all", label: "Todas" },
          ...uniqueSessions.map((s) => ({ value: s, label: s })),
        ]} />
        <FilterSelect label="Setup" value={filters.setup} onChange={(v) => update("setup", v)} options={[
          { value: "all", label: "Todos" },
          ...uniqueSetups.map((s) => ({ value: s, label: s })),
        ]} />
        <FilterSelect label="Direção" value={filters.direction} onChange={(v) => update("direction", v)} options={[
          { value: "all", label: "Todas" },
          { value: "BUY", label: "BUY" },
          { value: "SELL", label: "SELL" },
        ]} />
        <FilterSelect label="Resultado" value={filters.result} onChange={(v) => update("result", v)} options={[
          { value: "all", label: "Todos" },
          { value: "WIN", label: "WIN" },
          { value: "LOSS", label: "LOSS" },
          { value: "BREAK EVEN", label: "BREAK EVEN" },
        ]} />
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-slate-muted font-medium uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-dark-800 border border-white/5 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald/30 hover:bg-dark-750 transition w-36"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
