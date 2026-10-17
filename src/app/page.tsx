"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Zap, Filter as FilterIcon, ShieldCheck, ChevronRight } from "lucide-react";
import StatCard from "@/components/StatCard";
import CapitalChart from "@/components/CapitalChart";
import GlobalFilters, { FilterState, defaultFilters, applyFilters } from "@/components/GlobalFilters";
import AlertCard from "@/components/AlertCard";
import MetricTile from "@/components/MetricTile";
import CommandCenter from "@/components/CommandCenter";
import DashboardAiWidgets from "@/components/ai/DashboardAiWidgets";
import QuickTradeModal from "@/components/QuickTradeModal";
import DashboardInsights from "@/components/DashboardInsights";
import PortfolioSwitcher from "@/components/PortfolioSwitcher";
import { usePortfolio } from "@/components/PortfolioProvider";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { calculateMetrics, disciplineStats, buildCalendarData } from "@/lib/calculations";
import { computeAccount } from "@/lib/account";
import { formatCurrency, formatPercent, formatR, formatNumber } from "@/lib/utils";
import { comparePeriods, describeDelta } from "@/lib/period-compare";
import { localTodayKey, shiftDayKey } from "@/lib/date";

export default function DashboardPage() {
  const { trades, loading, error } = useTrades();
  const { config } = useConfig();
  const { meta, ready } = usePortfolio();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [quickOpen, setQuickOpen] = useState(false);

  const filteredTrades = useMemo(() => applyFilters(trades, filters), [trades, filters]);
  const initialCapital = config?.initialCapital ?? 10000;
  const account = useMemo(() => computeAccount(trades, config), [trades, config]);
  const metrics = useMemo(() => calculateMetrics(filteredTrades, initialCapital), [filteredTrades, initialCapital]);
  const discipline = useMemo(() => disciplineStats(filteredTrades), [filteredTrades]);
  const calendarMap = useMemo(() => buildCalendarData(filteredTrades), [filteredTrades]);
  const periodComparison = comparePeriods(trades, initialCapital, 30);
  const delta30d = (current: number, previous: number, kind: "percent-change" | "points", higherIsBetter = true) => {
    if (!periodComparison.comparable) return null;
    const d = describeDelta(current, previous, { kind, higherIsBetter, decimals: 1 });
    return { ...d, label: "30d vs. 30d anteriores" };
  };

  // Últimos 14 dias até HOJE (calendário civil local, sem voltar para a última operação antiga)
  const previewDays = useMemo(() => {
    const days: { label: string; data: ReturnType<typeof buildCalendarData> extends Map<string, infer V> ? V | null : null }[] = [];
    const today = localTodayKey();
    for (let i = 13; i >= 0; i--) {
      const key = shiftDayKey(today, -i);
      days.push({ label: String(Number(key.slice(8, 10))), data: calendarMap.get(key) || null });
    }
    return days;
  }, [calendarMap]);

  if (loading || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald/30 border-t-emerald rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight flex items-center gap-3">
              Dashboard
              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-lg ${meta.accent.bg} ${meta.accent.text} border ${meta.accent.border}`}>{meta.label} · {config?.currency || meta.currency}</span>
            </h1>
            <p className="text-sm text-slate-muted mt-1">{meta.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setQuickOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-bold rounded-xl shadow-lg shadow-accent/20 transition-all active:scale-[0.98]">
              <Zap size={17} /> Registro rápido
            </button>
            <Link href="/operacoes/novo" className="inline-flex items-center gap-2 px-4 py-2.5 border border-border bg-surface-2 hover:bg-surface-3 text-text-primary text-sm font-bold rounded-xl transition">
              <Plus size={17} /> Completo
            </Link>
          </div>
        </div>
      </header>

      {error && <div className="mb-4 p-3 rounded-xl border border-rose/30 bg-rose/5 text-xs text-rose">Não foi possível carregar o histórico completo: {error}</div>}

      {/* Carteiras: Forex · B3 · Cripto */}
      <PortfolioSwitcher />

      <div className="mb-2 flex items-center gap-2 text-[10px] text-text-muted"><FilterIcon size={12} /> Filtros abaixo afetam as métricas e análises desta página; Status da Conta e IA mostram a carteira completa.</div>
      <GlobalFilters trades={trades} filters={filters} onChange={setFilters} />

      {/* Command Center (conta da carteira ativa) */}
      <CommandCenter />

      {/* Inteligência de mercado — só os widgets do mercado da carteira ativa (sem repetir cards) */}
      <DashboardAiWidgets portfolio={meta.id} />

      {trades.length === 0 && (
        <div className="glass-card p-5 mb-6 text-center">
          <p className="text-sm text-slate-300 mb-3">
            A carteira <span className="font-bold text-text-primary">{meta.label}</span> ainda não tem operações. Saldo inicial: <span className="font-bold text-text-primary">{formatCurrency(initialCapital)}</span>
            {initialCapital === 0 && <span className="text-slate-muted"> — defina o capital em Configurações.</span>}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/operacoes/novo" className="text-xs font-bold text-emerald hover:underline">+ Registrar primeira operação</Link>
            <Link href="/configuracoes#importar" className="text-xs font-bold text-sky hover:underline">Importar arquivo da corretora</Link>
            <Link href="/configuracoes#carteira" className="text-xs font-bold text-amber hover:underline">Definir saldo inicial</Link>
          </div>
        </div>
      )}

      {/* Key Metrics Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Expectância por Operação"
          value={metrics.totalTrades > 0 ? `${metrics.expectancy >= 0 ? "+" : ""}${formatCurrency(metrics.expectancy)}` : "—"}
          sub={`${metrics.totalTrades} operações · Payoff ${metrics.payoffRatio > 0 ? formatNumber(metrics.payoffRatio) : "—"}`}
          positive={metrics.expectancy >= 0}
          delta={delta30d(periodComparison.current.expectancy, periodComparison.previous.expectancy, "percent-change")}
        />
        <StatCard
          label="Resultado Acumulado"
          value={`${account.realizedPnl >= 0 ? "+" : ""}${formatCurrency(account.realizedPnl)}`}
          sub={`Dep: ${formatCurrency(account.totalDeposits)} · Ret: ${formatCurrency(account.totalWithdrawals)}`}
          positive={account.realizedPnl >= 0}
          delta={delta30d(periodComparison.current.pnl, periodComparison.previous.pnl, "percent-change")}
        />
        <StatCard
          label="Win Rate"
          value={metrics.totalTrades > 0 ? formatPercent(metrics.winRate) : "—"}
          sub={`${metrics.wins} wins / ${metrics.losses} losses / ${metrics.breakEven} BE`}
          positive={metrics.winRate >= 50}
          delta={delta30d(periodComparison.current.winRate, periodComparison.previous.winRate, "points")}
        />
        <StatCard
          label="Drawdown Máximo"
          value={`-${formatNumber(metrics.maxDrawdown)}%`}
          sub={`Atual: -${formatNumber(metrics.currentDrawdown)}%`}
          neutral
          delta={delta30d(periodComparison.current.maxDrawdown, periodComparison.previous.maxDrawdown, "points", false)}
        />
      </section>

      {/* Main Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Capital Chart */}
        <div className="lg:col-span-2">
          <CapitalChart trades={filteredTrades} initialCapital={initialCapital} />
        </div>
        {/* Right Column */}
        <div className="space-y-4">
          <AlertCard metrics={metrics} config={config} discipline={discipline} />
          <div className="glass-card p-5">
            <h3 className="text-sm font-bold text-text-primary mb-4">Sequência Atual</h3>
            <div className="flex gap-3">
              <div className="flex-1 bg-emerald/5 border border-emerald/10 rounded-lg p-3 text-center">
                <span className="text-[10px] text-slate-muted uppercase">Wins</span>
                <p className="text-xl font-extrabold text-emerald">{metrics.currentWinSequence}</p>
              </div>
              <div className="flex-1 bg-rose/5 border border-rose/10 rounded-lg p-3 text-center">
                <span className="text-[10px] text-slate-muted uppercase">Losses</span>
                <p className="text-xl font-extrabold text-rose">{metrics.currentLossSequence}</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5">
              <p className="text-[11px] text-slate-muted">Maior sequência de wins: <span className="text-emerald font-semibold">{metrics.maxWinSequence}</span></p>
              <p className="text-[11px] text-slate-muted">Maior sequência de losses: <span className="text-rose font-semibold">{metrics.maxLossSequence}</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricTile label="Ganho Médio" value={metrics.wins > 0 ? `+${formatCurrency(metrics.avgWin)}` : "—"} sub={`${formatR(metrics.avgWinR)} médio`} color="emerald" />
        <MetricTile label="Perda Média" value={metrics.losses > 0 ? `-${formatCurrency(metrics.avgLoss)}` : "—"} sub={`-${formatNumber(metrics.avgLossR)}R médio`} color="rose" />
        <MetricTile label="Profit Factor" value={metrics.profitFactor > 0 ? formatNumber(metrics.profitFactor) : "—"} sub="Lucro bruto / Perda bruta" color="emerald" />
        <MetricTile label="R Médio por Operação" value={metrics.totalTrades > 0 ? formatR(metrics.avgR) : "—"} sub="Todas as operações" color="sky" />
      </section>

      {/* Visão executiva: detalhes por dimensão ficam na página Análises */}
      <DashboardInsights trades={filteredTrades} />
      <section className="glass-card p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-text-primary">Quer investigar a performance?</h2>
          <p className="text-[11px] text-text-muted">Ativo, setup, sessão, MAE/MFE, disciplina e Edge Explorer com filtros estão em Análises.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/analises" className="text-xs font-bold text-accent hover:underline">Abrir Análises →</Link>
          <Link href="/estatisticas" className="text-xs font-bold text-sky hover:underline">Estatísticas</Link>
          <Link href="/setup" className="text-xs font-bold text-violet hover:underline">Playbook</Link>
        </div>
      </section>

      {/* Discipline Section */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-rose/10 border border-rose/10 flex items-center justify-center">
            <ShieldCheck size={16} className="text-rose" />
          </div>
          <h2 className="text-base font-bold text-text-primary">Disciplina</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile label="Dentro do Plano" value={filteredTrades.length > 0 ? `${formatNumber(discipline.followedPercent, 0)}%` : "—"} sub={`${discipline.followedPlan} / ${filteredTrades.length} operações`} color="emerald" />
          <MetricTile label="Fora do Plano" value={filteredTrades.length > 0 ? `${formatNumber(discipline.notFollowedPercent, 0)}%` : "—"} sub={`${discipline.notFollowedPlan} / ${filteredTrades.length} operações`} color="rose" />
          <MetricTile label="Entrada Antecipada" value={discipline.earlyEntry} sub="Operações" color="amber" />
          <MetricTile label="Revenge Trade" value={discipline.revengeTrade} sub="Identificadas" color="rose" />
        </div>
        <div className="mt-5 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-text-primary">Status da Estratégia</h4>
              <p className="text-xs text-slate-muted">Considerando as operações filtradas</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              discipline.followedPercent >= 80 ? "bg-emerald/10 text-emerald border-emerald/20" :
              discipline.followedPercent >= 60 ? "bg-amber/10 text-amber border-amber/20" :
              "bg-rose/10 text-rose border-rose/20"
            }`}>
              {discipline.followedPercent >= 80 ? "Excelente" : discipline.followedPercent >= 60 ? "Moderado" : "Precisa Melhorar"}
            </span>
          </div>
        </div>
      </section>

      {/* Calendar Preview */}
      <section className="glass-card-strong p-5 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-text-primary">Calendário de Trading</h2>
            <p className="text-[11px] text-slate-muted mt-0.5">Últimos 14 dias com registro</p>
          </div>
          <Link href="/calendario" className="text-xs text-emerald font-medium hover:underline flex items-center gap-1">Ver completo <ChevronRight size={14} /></Link>
        </div>
        <div className="grid grid-cols-7 gap-2 md:gap-3">
          {previewDays.map((item, idx) => (
            <Link
              key={idx}
              href="/calendario"
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-extrabold transition hover:scale-105 ${
                !item.data
                  ? "bg-slate-800/30 text-slate-600 border border-white/[0.03]"
                  : item.data.result > 0
                    ? "bg-emerald/10 text-emerald border border-emerald/20 hover:bg-emerald/15"
                    : item.data.result === 0
                      ? "bg-sky/10 text-sky border border-sky/20 hover:bg-sky/15"
                      : "bg-rose/10 text-rose border border-rose/20 hover:bg-rose/15"
              }`}
            >
              <span className="text-[9px] font-medium opacity-70">{item.label}</span>
              {item.data && <span>{item.data.result > 0 ? "+" : item.data.result < 0 ? "-" : ""}{meta.currencySymbol}{Math.abs(Math.round(item.data.result))}</span>}
            </Link>
          ))}
        </div>
        <div className="flex gap-3 mt-3 text-[10px] text-slate-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald" /> Positivo</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose" /> Negativo</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky" /> Sem operação</span>
        </div>
      </section>
      {quickOpen && <QuickTradeModal onClose={() => setQuickOpen(false)} />}
    </div>
  );
}

function EmptyRow() {
  return <p className="text-xs text-slate-muted text-center py-6">Nenhuma operação registrada ainda.</p>;
}
