"use client";
import { useMemo } from "react";
import { Activity, Gauge, TrendingUp, TrendingDown, Minus, Radio, ShieldCheck, Clock, DollarSign } from "lucide-react";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { computeAccount } from "@/lib/account";
import { getCurrentSession } from "@/lib/session";
import { calculateMetrics } from "@/lib/calculations";
import { formatCurrency, formatNumber, formatR } from "@/lib/utils";

function BiasTag({ value }: { value: string }) {
  const up = value === "Bullish" || value === "Rising" || value === "Risk-On";
  const down = value === "Bearish" || value === "Falling" || value === "Risk-Off";
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const cls = up ? "text-emerald" : down ? "text-rose" : "text-text-muted";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${cls}`}>
      <Icon size={13} /> {value}
    </span>
  );
}

export default function CommandCenter() {
  const { trades } = useTrades();
  const { config } = useConfig();
  const account = useMemo(() => computeAccount(trades, config), [trades, config]);
  const metrics = useMemo(() => calculateMetrics(trades, config?.initialCapital ?? 10000), [trades, config]);
  const session = useMemo(() => getCurrentSession(config), [config]);

  const riskLimit = (config?.riskPercent || 2.5) * (account.equity / 100) * (config?.maxTradesPerDay || 5);
  const weeklyLimit = (config?.weeklyRiskLimit || 5) * (account.equity / 100);
  const riskUsedPct = riskLimit > 0 ? (account.riskUsedToday / riskLimit) * 100 : 0;
  const openRiskPct = account.equity > 0 ? (account.openRisk / account.equity) * 100 : 0;
  const accountState = metrics.currentLossSequence >= 3 ? "Em alerta" : metrics.netResult >= 0 ? "Positiva" : "Negativa";

  const isLight = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";

  const cellCls =
    "glass-card p-3 rounded-xl";
  const labelCls = "text-[10px] uppercase tracking-wider text-text-muted font-semibold";
  const valueCls = "text-sm font-extrabold text-text-primary mt-0.5";

  return (
    <div className="glass-card-strong p-4 md:p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Activity size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Market &amp; Account Status</h2>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${
          session.isActive ? "bg-emerald/10 text-emerald border-emerald/20" : "bg-surface-3 text-text-muted border-border"
        }`}>
          <Clock size={12} /> {session.isActive ? "Sessão aberta" : "Fora de sessão"} · {session.session}
        </span>
      </div>

      {/* Account status */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <div className={cellCls}>
          <p className={labelCls}>Saldo</p>
          <p className={valueCls}>{formatCurrency(account.realizedBalance)}</p>
        </div>
        <div className={cellCls}>
          <p className={labelCls}>Equity</p>
          <p className={valueCls}>{formatCurrency(account.equity)}</p>
        </div>
        <div className={cellCls}>
          <p className={labelCls}>P&amp;L Diário</p>
          <p className={`${valueCls} ${account.pnlDaily >= 0 ? "text-emerald" : "text-rose"}`}>{account.pnlDaily >= 0 ? "+" : ""}{formatCurrency(account.pnlDaily)}</p>
        </div>
        <div className={cellCls}>
          <p className={labelCls}>P&amp;L Semanal</p>
          <p className={`${valueCls} ${account.pnlWeekly >= 0 ? "text-emerald" : "text-rose"}`}>{account.pnlWeekly >= 0 ? "+" : ""}{formatCurrency(account.pnlWeekly)}</p>
        </div>
        <div className={cellCls}>
          <p className={labelCls}>R Diário</p>
          <p className={`${valueCls} ${account.rDaily >= 0 ? "text-emerald" : "text-rose"}`}>{formatR(account.rDaily)}</p>
        </div>
        <div className={cellCls}>
          <p className={labelCls}>R Semanal</p>
          <p className={`${valueCls} ${account.rWeekly >= 0 ? "text-emerald" : "text-rose"}`}>{formatR(account.rWeekly)}</p>
        </div>
      </div>

      {/* Risk */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className={`${cellCls} border-l-2 ${riskUsedPct >= 80 ? "border-rose" : "border-accent"}`}>
          <p className={labelCls}>Risk Used Today</p>
          <div className="flex items-center justify-between mt-1">
            <p className={valueCls}>{formatNumber(riskUsedPct)}%</p>
            <span className="text-[10px] text-text-muted">de {formatNumber(riskLimit)}</span>
          </div>
          <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden mt-1.5">
            <div className={`h-full rounded-full ${riskUsedPct >= 80 ? "bg-rose" : "bg-accent"}`} style={{ width: `${Math.min(100, riskUsedPct)}%` }} />
          </div>
        </div>
        <div className={`${cellCls} border-l-2 ${account.riskRemaining <= 0 ? "border-rose" : "border-accent"}`}>
          <p className={labelCls}>Risk Remaining</p>
          <p className={valueCls}>{formatCurrency(account.riskRemaining)}</p>
          <p className="text-[10px] text-text-muted">hoje</p>
        </div>
        <div className={`${cellCls} border-l-2 ${openRiskPct >= (config?.maxOpenRisk || 2) ? "border-rose" : "border-accent"}`}>
          <p className={labelCls}>Open Risk</p>
          <p className={valueCls}>{formatNumber(openRiskPct)}%</p>
          <p className="text-[10px] text-text-muted">max {formatNumber(config?.maxOpenRisk || 2)}%</p>
        </div>
      </div>

      {/* Macro snapshot */}
      <div className="glass-card p-3 rounded-xl mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Radio size={14} className="text-accent" />
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Macro Snapshot</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div><p className="text-[10px] text-text-muted">USD Bias</p><BiasTag value="Neutro" /></div>
          <div><p className="text-[10px] text-text-muted">DXY</p><BiasTag value="Neutro" /></div>
          <div><p className="text-[10px] text-text-muted">US02Y</p><BiasTag value="Neutral" /></div>
          <div><p className="text-[10px] text-text-muted">Regime</p><BiasTag value="Risk-On" /></div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
          <DollarSign size={12} /> Estado da conta: <span className="text-accent">{accountState}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
          <ShieldCheck size={12} /> Drawdown: <span className={account.currentDrawdown > 0 ? "text-rose" : "text-emerald"}>-{formatNumber(account.currentDrawdown)}%</span>
        </span>
      </div>
    </div>
  );
}
