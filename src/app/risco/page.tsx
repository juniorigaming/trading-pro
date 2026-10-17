"use client";

import { useMemo } from "react";
import { ShieldCheck, AlertTriangle, PauseCircle } from "lucide-react";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { calculateMetrics, buildCalendarData } from "@/lib/calculations";
import { computeAccount } from "@/lib/account";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { localTodayKey } from "@/lib/date";
import { computeDayGuard } from "@/lib/day-guard";
import PositionSizeCalculator from "@/components/PositionSizeCalculator";
import Link from "next/link";

export default function RiscoPage() {
  const { trades } = useTrades();
  const { config } = useConfig();
  const initialCapital = config?.initialCapital ?? 10000;
  const metrics = useMemo(() => calculateMetrics(trades, initialCapital), [trades, initialCapital]);
  const account = useMemo(() => computeAccount(trades, config), [trades, config]);
  const calendarMap = useMemo(() => buildCalendarData(trades), [trades]);

  const todayKey = localTodayKey();
  const todayResult = calendarMap.get(todayKey)?.result ?? 0;

  const riskPerTrade = Number(config?.riskPerTrade ?? 250);
  const riskPercent = Number(config?.riskPercent ?? 2.5);
  const dailyGoal = Number(config?.dailyGoal ?? 0);
  const dailyLossLimit = Number(config?.dailyLossLimit ?? 0);
  const maxDrawdown = Number(config?.maxDrawdown ?? 15);
  const ddProgress = maxDrawdown > 0 ? Math.min(100, (metrics.currentDrawdown / maxDrawdown) * 100) : 0;
  const dailyLossProgress = dailyLossLimit > 0 ? Math.min(100, (Math.abs(Math.min(0, todayResult)) / dailyLossLimit) * 100) : 0;
  const dailyGoalProgress = dailyGoal > 0 ? Math.min(100, (Math.max(0, todayResult) / dailyGoal) * 100) : 0;
  const dayGuard = computeDayGuard(account, config);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Gestão de Risco</h1>
          <p className="text-sm text-slate-muted mt-1">Controle de risco e limites da conta</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/configuracoes#carteira" className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-soft border border-accent/30 text-accent text-xs font-bold rounded-xl hover:bg-accent/10 transition">Editar limites diários e capital →</Link>
          <Link href="/configuracoes#risk-engine" className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface-2 border border-border text-text-primary text-xs font-bold rounded-xl hover:bg-surface-3 transition">Limites avançados →</Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-1">Capital Inicial</h3>
          <p className="text-2xl font-extrabold text-text-primary">{formatCurrency(initialCapital)}</p>
        </div>
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-1">Risco por Operação</h3>
          <p className="text-2xl font-extrabold text-emerald">{formatCurrency(riskPerTrade, config?.currency)}</p>
          <p className="text-[10px] text-slate-muted">{formatNumber(riskPercent)}% do capital</p>
        </div>
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-1">Meta Diária</h3>
          <p className="text-2xl font-extrabold text-amber">{formatCurrency(dailyGoal, config?.currency)}</p>
        </div>
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-1">Limite de Perda Diária</h3>
          <p className="text-2xl font-extrabold text-rose">-{formatCurrency(dailyLossLimit, config?.currency)}</p>
        </div>
      </section>

      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <h2 className="text-base font-bold text-text-primary mb-4">Limites Configurados</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-muted uppercase mb-2">Limite de Drawdown</h4>
            <p className="text-xl font-extrabold text-rose">-{formatNumber(maxDrawdown)}%</p>
            <p className="text-[10px] text-slate-muted mb-1">Atual: -{formatNumber(metrics.currentDrawdown)}%</p>
            <div className="w-full h-1.5 bg-dark-800 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-gradient-to-r from-rose to-rose-bright rounded-full" style={{ width: `${ddProgress}%` }} />
            </div>
          </div>
          <div className="glass-card p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-muted uppercase mb-2">Limite Diário (hoje)</h4>
            <p className="text-xl font-extrabold text-amber">-{formatCurrency(dailyLossLimit, config?.currency)}</p>
            <p className="text-[10px] text-slate-muted mb-1">Resultado do dia: {todayResult >= 0 ? "+" : ""}{formatCurrency(todayResult)}</p>
            <div className="w-full h-1.5 bg-dark-800 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-gradient-to-r from-amber to-amber/70 rounded-full" style={{ width: `${dailyLossProgress}%` }} />
            </div>
          </div>
          <div className="glass-card p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-muted uppercase mb-2">Meta Diária (hoje)</h4>
            <p className="text-xl font-extrabold text-emerald">+{formatCurrency(dailyGoal, config?.currency)}</p>
            <p className="text-[10px] text-slate-muted mb-1">Progresso: {formatNumber(dailyGoalProgress, 0)}%</p>
            <div className="w-full h-1.5 bg-dark-800 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-gradient-to-r from-emerald to-emerald-bright rounded-full" style={{ width: `${dailyGoalProgress}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* Risk Engine Status */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-text-primary">Risk Engine</h2>
          {dayGuard.blocked ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose/10 text-rose border border-rose/20 text-[11px] font-bold"><PauseCircle size={12} /> TRADING PAUSED</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald/10 text-emerald border border-emerald/20 text-[11px] font-bold">Trading ativo</span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RiskCard label="Risk Used Today" value={`${formatNumber(account.riskUsedTodayPercent)}%`} sub={`${formatCurrency(account.riskUsedToday)}`} />
          <RiskCard label="Risk Remaining" value={formatCurrency(account.riskRemaining)} sub="hoje" />
          <RiskCard label="Weekly Risk" value={`${formatNumber(Math.min(100, account.weeklyRiskUsedPercent))}%`} sub={`de ${formatNumber(config?.weeklyRiskLimit || 5)}%`} />
          <RiskCard label="Open Risk" value={`${formatNumber((account.openRisk / (account.equity || 1)) * 100)}%`} sub={`max ${formatNumber(config?.maxOpenRisk || 2)}%`} />
        </div>
      </section>

      <section className="glass-card-strong p-5 md:p-6">
        <h2 className="text-base font-bold text-text-primary mb-4">Alertas Ativos</h2>
        <div className="space-y-3">
          {ddProgress >= 50 && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber/5 border border-amber/10">
              <AlertTriangle size={18} className="text-amber shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber">Você atingiu {Math.round(ddProgress)}% do limite de drawdown</p>
                <p className="text-xs text-slate-muted">Considerar reduzir risco nas próximas operações.</p>
              </div>
            </div>
          )}
          {metrics.currentLossSequence >= 3 && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-rose/5 border border-rose/10">
              <ShieldCheck size={18} className="text-rose shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-rose">{metrics.currentLossSequence} perdas consecutivas detectadas</p>
                <p className="text-xs text-slate-muted">Revisar disciplina antes de continuar operando.</p>
              </div>
            </div>
          )}
          {ddProgress < 50 && metrics.currentLossSequence < 3 && (
            <p className="text-xs text-text-muted text-center py-4">Nenhum alerta de risco no momento.</p>
          )}
        </div>
      </section>

      {/* Position Size Calculator */}
      <section className="glass-card-strong p-5 md:p-6">
        <PositionSizeCalculator />
      </section>
    </div>
  );
}

function RiskCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="glass-card p-3 rounded-xl">
      <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{label}</p>
      <p className="text-sm font-extrabold text-text-primary mt-0.5">{value}</p>
      <p className="text-[10px] text-text-muted">{sub}</p>
    </div>
  );
}
