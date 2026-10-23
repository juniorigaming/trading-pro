"use client";
import { useMemo } from "react";
import { Activity, ShieldCheck, Clock, DollarSign, Info } from "lucide-react";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { computeAccount } from "@/lib/account";
import { getCurrentSession } from "@/lib/session";
import { calculateMetrics } from "@/lib/calculations";
import { formatCurrency, formatNumber, formatR } from "@/lib/utils";
import { usePortfolio } from "@/components/PortfolioProvider";

export default function CommandCenter() {
  const { trades } = useTrades();
  const { config } = useConfig();
  const { meta } = usePortfolio();
  const currency = config?.currency || meta.currency;
  const account = useMemo(() => computeAccount(trades, config), [trades, config]);
  const metrics = useMemo(() => calculateMetrics(trades, config?.initialCapital ?? 10000), [trades, config]);
  const session = useMemo(() => getCurrentSession(config, meta.id), [config, meta.id]);

  const riskLimit = (config?.riskPercent || 2.5) * (account.equity / 100) * (config?.maxTradesPerDay || 5);
  const weeklyLimit = (config?.weeklyRiskLimit || 5) * (account.equity / 100);
  const riskUsedPct = riskLimit > 0 ? (account.riskUsedToday / riskLimit) * 100 : 0;
  const openRiskPct = account.equity > 0 ? (account.openRisk / account.equity) * 100 : 0;
  const accountState = metrics.totalTrades === 0 ? "Sem operações" : metrics.currentLossSequence >= 3 ? "Em alerta" : metrics.netResult >= 0 ? "Positiva" : "Negativa";

  const cellCls =
    "glass-card p-3 rounded-xl";
  const labelCls = "text-[10px] uppercase tracking-wider text-text-muted font-semibold";
  const valueCls = "text-sm font-extrabold text-text-primary mt-0.5";

  return (
    <div className="glass-card-strong p-4 md:p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Activity size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Status da Conta</h2>
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${meta.accent.bg} ${meta.accent.text}`}>{meta.label} · {currency}</span>
          <span className="hidden sm:inline-flex items-center rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[9px] font-semibold text-text-muted">carteira ativa · sem filtros</span>
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
          <p className={`${valueCls} ${account.rDaily == null ? "text-text-muted" : account.rDaily >= 0 ? "text-emerald" : "text-rose"}`}>{account.rDaily != null ? formatR(account.rDaily) : "—"}</p>
          {account.rDaily == null && <p className="text-[9px] text-text-muted mt-0.5">Sem risco definido</p>}
        </div>
        <div className={cellCls}>
          <p className={labelCls}>R Semanal</p>
          <p className={`${valueCls} ${account.rWeekly == null ? "text-text-muted" : account.rWeekly >= 0 ? "text-emerald" : "text-rose"}`}>{account.rWeekly != null ? formatR(account.rWeekly) : "—"}</p>
          {account.rWeekly == null && <p className="text-[9px] text-text-muted mt-0.5">Sem risco definido</p>}
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
          <DollarSign size={12} /> Estado da conta: <span className="text-accent">{accountState}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
          <ShieldCheck size={12} /> Drawdown: <span className={account.currentDrawdown > 0 ? "text-rose" : "text-emerald"}>{account.currentDrawdown > 0 ? "−" : ""}{formatNumber(account.currentDrawdown)}%</span> <span className="font-normal text-text-muted">(pico→vale · operações da carteira ativa, sem depósitos/saques)</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-text-muted">
          <Info size={12} /> Fluxo de caixa fora do P&amp;L: +{formatCurrency(account.totalDeposits, currency)} aportes · −{formatCurrency(account.totalWithdrawals, currency)} retiradas.
        </span>
      </div>
    </div>
  );
}
