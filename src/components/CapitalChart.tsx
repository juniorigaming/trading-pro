"use client";
import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Trade } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface Props {
  trades: Trade[];
  initialCapital: number;
}

export default function CapitalChart({ trades, initialCapital }: Props) {
  const [range, setRange] = useState<"weekly" | "monthly" | "all">("all");

  const sorted = useMemo(
    () => [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.time.localeCompare(b.time)),
    [trades]
  );

  const data = useMemo(() => {
    let running = initialCapital;
    const points = [{ date: "Início", balance: initialCapital }];
    sorted.forEach((t) => {
      running += t.resultAmount || 0;
      const label = new Date(t.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      points.push({ date: label, balance: Math.round(running * 100) / 100 });
    });

    if (range === "weekly") return points.slice(-8);
    if (range === "monthly") return points.slice(-31);
    return points;
  }, [sorted, initialCapital, range]);

  const currentBalance = data.length > 0 ? data[data.length - 1].balance : initialCapital;
  const growthPercent = initialCapital > 0 ? ((currentBalance - initialCapital) / initialCapital) * 100 : 0;

  const values = data.map((d) => d.balance);
  const minVal = Math.min(initialCapital, ...values);
  const maxVal = Math.max(initialCapital, ...values);
  const padding = Math.max((maxVal - minVal) * 0.15, 50);

  return (
    <div className="glass-card-strong p-5 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold text-white">Evolução do Capital</h2>
          <p className="text-[11px] text-slate-muted mt-0.5">Saldo acumulado ao longo do período</p>
        </div>
        <div className="flex gap-1.5">
          {(["weekly", "monthly", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                range === r ? "bg-emerald/15 text-emerald border border-emerald/20" : "text-slate-muted hover:text-white hover:bg-white/5"
              }`}
            >
              {r === "weekly" ? "Recentes" : r === "monthly" ? "Últimas 30 ops" : "Tudo"}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[260px] md:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={{ stroke: "#1e3a5f" }} tickLine={false} minTickGap={30} />
            <YAxis domain={[minVal - padding, maxVal + padding]} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={{ stroke: "#1e3a5f" }} tickLine={false} tickFormatter={(v: number) => `$${Math.round(v).toLocaleString()}`} />
            <Tooltip
              contentStyle={{ background: "#0b1120", border: "1px solid #1e3a5f", borderRadius: 10, color: "#f1f5f9", fontSize: 13 }}
              labelStyle={{ color: "#94a3b8", fontSize: 11 }}
              formatter={(v: unknown) => [`$${Number(v || 0).toLocaleString()}`, "Saldo"]}
            />
            <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2.5} fill="url(#balanceGrad)" dot={data.length < 40} activeDot={{ r: 5, fill: "#10b981", stroke: "#060a14", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-white/5">
        <div>
          <p className="text-[10px] text-slate-muted uppercase tracking-wider">Saldo Inicial</p>
          <p className="text-sm font-bold text-white">{formatCurrency(initialCapital)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-muted uppercase tracking-wider">Saldo Atual</p>
          <p className={`text-sm font-bold ${currentBalance >= initialCapital ? "text-emerald" : "text-rose"}`}>{formatCurrency(currentBalance)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-muted uppercase tracking-wider">Crescimento</p>
          <p className={`text-sm font-bold ${growthPercent >= 0 ? "text-emerald" : "text-rose"}`}>{growthPercent >= 0 ? "+" : ""}{formatNumber(growthPercent)}%</p>
        </div>
      </div>
    </div>
  );
}
