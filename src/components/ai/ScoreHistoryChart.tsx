"use client";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { apiFetch } from "@/lib/ai/client";
import { G8 } from "@/lib/ai/types";
import { Spinner } from "./ui";

const COLORS: Record<string, string> = { USD: "#60a5fa", EUR: "#34d399", GBP: "#f472b6", JPY: "#f87171", CHF: "#a78bfa", CAD: "#fb923c", AUD: "#facc15", NZD: "#2dd4bf" };
type Row = { currency: string; score: number; computed_at: string };

export default function ScoreHistoryChart() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [state, setState] = useState<{ days: number; rows: Row[] } | null>(null);
  const [sel, setSel] = useState<string[]>([...G8]);
  useEffect(() => { let alive = true; apiFetch<Row[]>(`/api/macro/scores/history?days=${days}`).then((r) => alive && setState({ days, rows: r })).catch(() => alive && setState({ days, rows: [] })); return () => { alive = false; }; }, [days]);
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
        {G8.map((c) => <button key={c} onClick={() => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))} className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${sel.includes(c) ? "border-transparent" : "border-border opacity-40"}`} style={{ color: COLORS[c], background: sel.includes(c) ? `${COLORS[c]}22` : undefined }}>{c}</button>)}
      </div>
      {rows == null ? <Spinner label="Carregando histórico..." /> : data.length < 2 ? <p className="text-xs text-text-muted py-6 text-center">Histórico insuficiente ({data.length} ponto). Cada Análise Macro grava um ponto por moeda — o gráfico ganha forma com o uso diário.</p> : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis domain={[-2, 2]} ticks={[-2, -1, 0, 1, 2]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#475569" />
            <ReferenceLine y={1} stroke="#10b98155" strokeDasharray="3 3" /><ReferenceLine y={-1} stroke="#f43f5e55" strokeDasharray="3 3" />
            {G8.filter((c) => sel.includes(c)).map((c) => <Line key={c} type="monotone" dataKey={c} stroke={COLORS[c]} dot={false} strokeWidth={2} connectNulls />)}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
