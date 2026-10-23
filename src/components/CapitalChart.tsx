"use client";
import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3 } from "lucide-react";
import { Trade } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

interface Props {
  trades: Trade[];
  initialCapital: number;
  currency?: string;
}

function compactCurrency(value: number, currency: string) {
  try {
    if (currency === "USDT" || currency === "USDC" || currency === "BUSD") {
      return `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)} ${currency}`;
    }
    return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
      style: "currency", currency, notation: "compact", maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString("pt-BR")} ${currency}`;
  }
}

export default function CapitalChart({ trades, initialCapital, currency = "USD" }: Props) {
  const [range, setRange] = useState<"weekly" | "monthly" | "all">("all");
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const palette = isDark
    ? { grid: "#252a31", axis: "#778293", tooltipBg: "#0a0b0d", tooltipBorder: "#303640", tooltipText: "#f5f7fa", dot: "#000000" }
    : { grid: "#dfe5ec", axis: "#64748b", tooltipBg: "#ffffff", tooltipBorder: "#dfe5ec", tooltipText: "#0f172a", dot: "#ffffff" };

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
  const tradePnl = trades.reduce((sum, t) => sum + (t.resultAmount || 0), 0);
  const growthPercent = initialCapital > 0 ? ((currentBalance - initialCapital) / initialCapital) * 100 : null;
  const values = data.map((d) => d.balance);
  const minVal = Math.min(initialCapital, ...values);
  const maxVal = Math.max(initialCapital, ...values);
  const padding = Math.max((maxVal - minVal) * 0.15, 50);

  return (
    <div className="glass-card-strong p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-text-primary">Evolução do Capital</h2>
          <p className="text-[11px] text-slate-muted mt-0.5">Capital inicial + trades do recorte · depósitos e saques não entram na série</p>
        </div>
        <div className="flex gap-1.5">
          {(["weekly", "monthly", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                range === r ? "bg-accent-soft text-accent border border-accent/20" : "text-slate-muted hover:text-text-primary hover:bg-surface-3"
              }`}
            >
              {r === "weekly" ? "Recentes" : r === "monthly" ? "Últimas 30 ops" : "Tudo"}
            </button>
          ))}
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="h-[220px] md:h-[260px] rounded-xl border border-dashed border-border bg-surface-2/40 flex flex-col items-center justify-center px-5 text-center">
          <BarChart3 size={22} className="text-text-muted mb-2" />
          <p className="text-sm font-semibold text-text-secondary">Sem operações neste recorte</p>
          <p className="text-[11px] text-text-muted mt-1">Ajuste os filtros ou registre uma operação para formar a série.</p>
        </div>
      ) : (
        <div className="h-[260px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--user-accent)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--user-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: palette.axis, fontSize: 11 }} axisLine={{ stroke: palette.grid }} tickLine={false} minTickGap={30} />
              <YAxis domain={[minVal - padding, maxVal + padding]} tick={{ fill: palette.axis, fontSize: 11 }} axisLine={{ stroke: palette.grid }} tickLine={false} tickFormatter={(v: number) => compactCurrency(v, currency)} />
              <Tooltip
                contentStyle={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, borderRadius: 10, color: palette.tooltipText, fontSize: 12 }}
                labelStyle={{ color: palette.axis, fontSize: 11 }}
                formatter={(v: unknown) => [formatCurrency(Number(v || 0), currency), "Saldo teórico"]}
              />
              <Area type="monotone" dataKey="balance" stroke="var(--user-accent)" strokeWidth={2.5} fill="url(#balanceGrad)" dot={data.length < 40} activeDot={{ r: 5, fill: "var(--user-accent)", stroke: palette.dot, strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
        <div>
          <p className="text-[10px] text-slate-muted uppercase tracking-wider">Capital inicial</p>
          <p className="text-sm font-bold text-text-primary">{formatCurrency(initialCapital, currency)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-muted uppercase tracking-wider">P&amp;L dos trades</p>
          <p className={`text-sm font-bold ${tradePnl > 0 ? "text-emerald" : tradePnl < 0 ? "text-rose" : "text-text-secondary"}`}>{tradePnl > 0 ? "+" : ""}{formatCurrency(tradePnl, currency)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-muted uppercase tracking-wider">Variação vs. capital inicial</p>
          <p className={`text-sm font-bold ${growthPercent == null ? "text-text-muted" : growthPercent >= 0 ? "text-emerald" : "text-rose"}`}>
            {growthPercent == null ? "—" : `${growthPercent >= 0 ? "+" : ""}${formatNumber(growthPercent)}%`}
          </p>
        </div>
      </div>
    </div>
  );
}
