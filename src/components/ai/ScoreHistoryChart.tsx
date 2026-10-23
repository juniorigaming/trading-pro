"use client";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { apiFetch } from "@/lib/ai/client";
import { G8 } from "@/lib/ai/types";
import { useTheme } from "@/components/ThemeProvider";
import { Spinner } from "./ui";

const COLORS: Record<string, string> = { USD: "#60a5fa", EUR: "#34d399", GBP: "#f472b6", JPY: "#f87171", CHF: "#a78bfa", CAD: "#fb923c", AUD: "#facc15", NZD: "#2dd4bf", BRL: "#34d399", WIN: "#facc15", DOL: "#f87171" };
type Row = { currency: string; score: number; computed_at: string };

/** Gráfico de histórico de scores (7D/30D/90D). Reutilizado pelo B3 via `endpoint` + `series` (USD/BRL/WIN/DOL). */
export default function ScoreHistoryChart({ endpoint = "/api/macro/scores/history", series }: { endpoint?: string; series?: readonly string[] } = {}) {
  const all = series ?? G8;
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [state, setState] = useState<{ days: number; rows: Row[] } | null>(null);
  const [sel, setSel] = useState<string[]>([...all]);
  const { theme } = useTheme();
  const chartPalette = theme === "dark"
    ? { text: "#94a3b8", grid: "#29313b", tooltipBg: "#08090b", tooltipBorder: "#303640", tooltipText: "#f5f7fa", reference: "#64748b" }
    : { text: "#64748b", grid: "#dbe2ea", tooltipBg: "#ffffff", tooltipBorder: "#dbe2ea", tooltipText: "#0f172a", reference: "#94a3b8" };
  useEffect(() => { let alive = true; apiFetch<Row[]>(`${endpoint}${endpoint.includes("?") ? "&" : "?"}days=${days}`).then((r) => alive && setState({ days, rows: r })).catch(() => alive && setState({ days, rows: [] })); return () => { alive = false; }; }, [days, endpoint]);
  const rows = state && state.days === days ? state.rows : null;
  const data = useMemo(() => {
    if (!rows) return [];
    const byTs = new Map<string, Record<string, number | string>>();
    for (const r of rows) { const k = r.computed_at.slice(0, 16); const o = byTs.get(k) ?? { t: k }; o[r.currency] = r.score; byTs.set(k, o); }
    return [...byTs.values()].sort((a, b) => String(a.t).localeCompare(String(b.t))).map((o) => ({ ...o, label: new Date(String(o.t)).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }));
  }, [rows]);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {([7, 30, 90] as const).map((d) => <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${days === d ? "border-accent bg-accent-soft text-accent" : "border-border text-text-muted"}`}>{d}D</button>)}
        <span className="mx-1 text-text-muted">|</span>
        {all.map((c) => <button key={c} onClick={() => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))} className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${sel.includes(c) ? "border-transparent" : "border-border opacity-40"}`} style={{ color: COLORS[c], background: sel.includes(c) ? `${COLORS[c]}22` : undefined }}>{c}</button>)}
      </div>
      {rows == null ? <Spinner label="Carregando histórico..." /> : data.length < 2 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-2/40 px-4 py-5 text-center">
          <p className="text-xs font-semibold text-text-secondary">{data.length === 0 ? "Sem pontos no período selecionado" : "Amostra insuficiente para traçar uma tendência"}</p>
          <p className="text-[10px] text-text-muted mt-1">{data.length} ponto{data.length === 1 ? "" : "s"} · são necessários pelo menos 2; o histórico é alimentado por análises salvas.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartPalette.text }} axisLine={{ stroke: chartPalette.grid }} tickLine={false} />
            <YAxis domain={[-2, 2]} ticks={[-2, -1, 0, 1, 2]} tick={{ fontSize: 10, fill: chartPalette.text }} axisLine={{ stroke: chartPalette.grid }} tickLine={false} />
            <Tooltip contentStyle={{ background: chartPalette.tooltipBg, border: `1px solid ${chartPalette.tooltipBorder}`, borderRadius: 12, color: chartPalette.tooltipText, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10, color: chartPalette.text }} />
            <ReferenceLine y={0} stroke={chartPalette.reference} />
            <ReferenceLine y={1} stroke="#10b98155" strokeDasharray="3 3" /><ReferenceLine y={-1} stroke="#f43f5e55" strokeDasharray="3 3" />
            {all.filter((c) => sel.includes(c)).map((c) => <Line key={c} type="monotone" dataKey={c} stroke={COLORS[c]} dot={false} strokeWidth={2} connectNulls />)}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
