"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, BarChart3, Target, Clock, ShieldCheck, ChevronRight, Trash2, Info } from "lucide-react";
import StatCard from "@/components/StatCard";
import CapitalChart from "@/components/CapitalChart";
import GlobalFilters, { FilterState, defaultFilters, applyFilters } from "@/components/GlobalFilters";
import AlertCard from "@/components/AlertCard";
import MetricTile from "@/components/MetricTile";
import CommandCenter from "@/components/CommandCenter";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { calculateMetrics, groupByAsset, groupBySession, groupBySetup, disciplineStats, buildCalendarData } from "@/lib/calculations";
import { computeAccount } from "@/lib/account";
import { formatCurrency, formatPercent, formatR, formatNumber } from "@/lib/utils";

export default function DashboardPage() {
  const { trades, loading, refetch } = useTrades();
  const { config } = useConfig();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const filteredTrades = useMemo(() => applyFilters(trades, filters), [trades, filters]);
  const initialCapital = config?.initialCapital ?? 10000;
  const account = useMemo(() => computeAccount(trades, config), [trades, config]);
  const metrics = useMemo(() => calculateMetrics(filteredTrades, initialCapital), [filteredTrades, initialCapital]);
  const byAsset = useMemo(() => groupByAsset(filteredTrades).slice(0, 5), [filteredTrades]);
  const bySetup = useMemo(() => groupBySetup(filteredTrades).slice(0, 5), [filteredTrades]);
  const bySession = useMemo(() => groupBySession(filteredTrades), [filteredTrades]);
  const discipline = useMemo(() => disciplineStats(filteredTrades), [filteredTrades]);
  const calendarMap = useMemo(() => buildCalendarData(filteredTrades), [filteredTrades]);
  const hasDemo = trades.some((t) => t.isDemo);

  const removeDemoData = async () => {
    if (!confirm("Remover todos os dados de demonstração? Essa ação não pode ser desfeita.")) return;
    await fetch("/api/trades/demo", { method: "DELETE" });
    refetch();
  };

  const loadDemoData = async () => {
    await fetch("/api/trades/demo", { method: "POST" });
    refetch();
  };

  // Last 14 days for calendar preview (based on the most recent trade date, or today)
  const previewDays = useMemo(() => {
    const dates = Array.from(calendarMap.keys()).sort();
    const lastDate = dates.length > 0 ? new Date(dates[dates.length - 1]) : new Date();
    const days: { label: string; data: ReturnType<typeof buildCalendarData> extends Map<string, infer V> ? V | null : null }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      days.push({ label: String(d.getDate()), data: calendarMap.get(key) || null });
    }
    return days;
  }, [calendarMap]);

  if (loading) {
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
            <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Dashboard</h1>
            <p className="text-sm text-slate-muted mt-1">Visão geral da sua performance de trading</p>
          </div>
          <Link
            href="/operacoes/novo"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-bold rounded-xl shadow-lg shadow-accent/20 transition-all duration-300 active:scale-[0.98]"
          >
            <Plus size={18} />
            Nova Operação
          </Link>
        </div>
      </header>

      {/* Command Center */}
      <CommandCenter />

      {hasDemo && (
        <div className="glass-card p-3.5 mb-6 flex flex-wrap items-center justify-between gap-3 border border-sky/20">
          <div className="flex items-center gap-2.5">
            <Info size={16} className="text-sky shrink-0" />
            <p className="text-xs text-slate-300"><span className="font-bold text-sky">DADOS DE DEMONSTRAÇÃO</span> incluídos para você testar o sistema. Eles não representam operações reais.</p>
          </div>
          <button onClick={removeDemoData} className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose hover:text-rose-bright transition px-3 py-1.5 rounded-lg border border-rose/20 hover:bg-rose/10">
            <Trash2 size={13} /> Remover dados demo
          </button>
        </div>
      )}

      {!hasDemo && trades.length === 0 && (
        <div className="glass-card p-5 mb-6 text-center">
          <p className="text-sm text-slate-300 mb-3">Você ainda não tem operações registradas. Saldo inicial: <span className="font-bold text-text-primary">{formatCurrency(initialCapital)}</span></p>
          <div className="flex justify-center gap-3">
            <Link href="/operacoes/novo" className="text-xs font-bold text-emerald hover:underline">+ Registrar primeira operação</Link>
            <button onClick={loadDemoData} className="text-xs font-bold text-sky hover:underline">Carregar dados de demonstração</button>
          </div>
        </div>
      )}

      {/* Global Filters */}
      <GlobalFilters trades={trades} filters={filters} onChange={setFilters} />

      {/* Key Metrics Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Saldo Realizado"
          value={formatCurrency(account.realizedBalance)}
          sub={`Equity: ${formatCurrency(account.equity)}`}
          positive={account.realizedPnl >= 0}
        />
        <StatCard
          label="Resultado Acumulado"
          value={`${account.realizedPnl >= 0 ? "+" : ""}${formatCurrency(account.realizedPnl)}`}
          sub={`Dep: ${formatCurrency(account.totalDeposits)} · Ret: ${formatCurrency(account.totalWithdrawals)}`}
          positive={account.realizedPnl >= 0}
        />
        <StatCard
          label="Win Rate"
          value={metrics.totalTrades > 0 ? formatPercent(metrics.winRate) : "—"}
          sub={`${metrics.wins} wins / ${metrics.losses} losses / ${metrics.breakEven} BE`}
          positive={metrics.winRate >= 50}
        />
        <StatCard
          label="Drawdown Máximo"
          value={`-${formatNumber(metrics.maxDrawdown)}%`}
          sub={`Atual: -${formatNumber(metrics.currentDrawdown)}%`}
          neutral
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

      {/* Analysis Sections */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* By Asset */}
        <div className="glass-card-strong p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-violet/10 border border-violet/10 flex items-center justify-center">
              <BarChart3 size={16} className="text-violet" />
            </div>
            <h2 className="text-base font-bold text-text-primary">Por Ativo</h2>
          </div>
          <div className="space-y-3">
            {byAsset.length === 0 && <EmptyRow />}
            {byAsset.map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition">
                <div>
                  <p className="text-sm font-bold text-text-primary">{item.key}</p>
                  <p className="text-[10px] text-slate-muted">{item.trades} operações</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-extrabold ${item.result >= 0 ? "text-emerald" : "text-rose"}`}>{item.result >= 0 ? "+" : ""}{formatCurrency(item.result)}</p>
                  <p className="text-[10px] text-slate-muted">WR: {formatNumber(item.winRate, 0)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Setup */}
        <div className="glass-card-strong p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-violet/10 border border-violet/10 flex items-center justify-center">
              <Target size={16} className="text-violet" />
            </div>
            <h2 className="text-base font-bold text-text-primary">Por Setup</h2>
          </div>
          <div className="space-y-3">
            {bySetup.length === 0 && <EmptyRow />}
            {bySetup.map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition">
                <div>
                  <p className="text-sm font-bold text-text-primary">{item.key}</p>
                  <p className="text-[10px] text-slate-muted">{item.trades} ops · PF: {item.profitFactor === Infinity ? "∞" : formatNumber(item.profitFactor)}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-extrabold ${item.result >= 0 ? "text-emerald" : "text-rose"}`}>{item.result >= 0 ? "+" : ""}{formatCurrency(item.result)}</p>
                  <p className="text-[10px] text-slate-muted">WR: {formatNumber(item.winRate, 0)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Session */}
        <div className="glass-card-strong p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-violet/10 border border-violet/10 flex items-center justify-center">
              <Clock size={16} className="text-violet" />
            </div>
            <h2 className="text-base font-bold text-text-primary">Por Sessão</h2>
          </div>
          <div className="space-y-3">
            {bySession.length === 0 && <EmptyRow />}
            {bySession.map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition">
                <div>
                  <p className="text-sm font-bold text-text-primary">{item.key}</p>
                  <p className="text-[10px] text-slate-muted">{item.trades} operações</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-extrabold ${item.result >= 0 ? "text-emerald" : "text-rose"}`}>{item.result >= 0 ? "+" : ""}{formatCurrency(item.result)}</p>
                  <p className="text-[10px] text-slate-muted">WR: {formatNumber(item.winRate, 0)}%</p>
                </div>
              </div>
            ))}
          </div>
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
              {item.data && <span>{item.data.result > 0 ? "+" : ""}${Math.abs(Math.round(item.data.result))}</span>}
            </Link>
          ))}
        </div>
        <div className="flex gap-3 mt-3 text-[10px] text-slate-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald" /> Positivo</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose" /> Negativo</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky" /> Sem operação</span>
        </div>
      </section>
    </div>
  );
}

function EmptyRow() {
  return <p className="text-xs text-slate-muted text-center py-6">Nenhuma operação registrada ainda.</p>;
}
