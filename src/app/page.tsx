"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, BarChart3, Target, Clock, ShieldCheck, ChevronRight, Filter } from "lucide-react";
import StatCard from "@/components/StatCard";
import CapitalChart from "@/components/CapitalChart";
import GlobalFilters, { FilterState, defaultFilters, applyFilters } from "@/components/GlobalFilters";
import AlertCard from "@/components/AlertCard";
import MetricTile from "@/components/MetricTile";
import CommandCenter from "@/components/CommandCenter";
import DashboardAiWidgets from "@/components/ai/DashboardAiWidgets";
import PortfolioSwitcher from "@/components/PortfolioSwitcher";
import MarketSymbol from "@/components/MarketSymbol";
import { usePortfolio } from "@/components/PortfolioProvider";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { calculateMetrics, groupByAsset, groupBySession, groupBySetup, disciplineStats, buildCalendarData } from "@/lib/calculations";
import { computeAccount } from "@/lib/account";
import { formatCurrency, formatPercent, formatR, formatNumber } from "@/lib/utils";

export default function DashboardPage() {
  const { trades, loading } = useTrades();
  const { config, loading: configLoading } = useConfig();
  const { meta, ready } = usePortfolio();
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
  const emptyAnalysisMessage = trades.length > 0 && filteredTrades.length === 0
    ? "Nenhuma operação corresponde aos filtros atuais."
    : "Nenhuma operação registrada neste recorte.";

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

  if (loading || configLoading || !ready) {
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
          <Link
            href="/operacoes/novo"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-bold rounded-xl shadow-lg shadow-accent/20 transition-all duration-300 active:scale-[0.98]"
          >
            <Plus size={18} />
            Nova Operação
          </Link>
        </div>
      </header>

      {/* Carteiras: Forex · B3 · Cripto */}
      <PortfolioSwitcher />

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

      {/* Scope: filters apply only to the analysis below, not account status or macro context. */}
      <div className="mb-2 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-slate-muted">
        <Filter size={13} className="mt-0.5 shrink-0 text-accent" />
        <p>
          Os filtros afetam métricas de performance, gráfico, alertas, sequência, análises, disciplina e prévia do calendário. P&amp;L das Operações, Carteiras e Status da Conta mostram o histórico completo da carteira ativa; Exposição soma posições abertas de todas as carteiras; Ranking/Event Risk usam a última análise macro, sem estes filtros.
        </p>
      </div>
      <GlobalFilters trades={trades} filters={filters} onChange={setFilters} />

      {/* Key Metrics Row: these metrics use the selected trade filters, except the account P&L card. */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Expectância por Operação"
          value={metrics.totalTrades > 0 ? `${metrics.expectancy >= 0 ? "+" : ""}${formatCurrency(metrics.expectancy)}` : "—"}
          sub={`${metrics.totalTrades} operações no recorte · Payoff ${metrics.payoffRatio > 0 ? formatNumber(metrics.payoffRatio) : "—"}`}
          positive={metrics.totalTrades > 0 ? metrics.expectancy >= 0 : undefined}
        />
        <StatCard
          label="P&L das Operações"
          value={`${account.realizedPnl > 0 ? "+" : ""}${formatCurrency(account.realizedPnl)}`}
          sub={`Carteira ativa, sem filtro · fluxo fora do P&L: +${formatCurrency(account.totalDeposits)} aportes / −${formatCurrency(account.totalWithdrawals)} saques`}
          positive={account.realizedPnl > 0 ? true : account.realizedPnl < 0 ? false : undefined}
        />
        <StatCard
          label="Win Rate"
          value={metrics.totalTrades > 0 ? formatPercent(metrics.winRate) : "—"}
          sub={`${metrics.wins} wins / ${metrics.losses} losses / ${metrics.breakEven} BE · BE excluído do denominador`}
          positive={metrics.totalTrades > 0 ? metrics.winRate >= 50 : undefined}
        />
        <StatCard
          label="Drawdown Máximo"
          value={`${metrics.maxDrawdown > 0 ? "−" : ""}${formatNumber(metrics.maxDrawdown)}%`}
          sub={`Atual ${metrics.currentDrawdown > 0 ? "−" : ""}${formatNumber(metrics.currentDrawdown)}% · pico→vale no recorte · sem depósitos/saques`}
          neutral
        />
      </section>

      {/* Main Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Capital Chart */}
        <div className="lg:col-span-2">
          <CapitalChart trades={filteredTrades} initialCapital={initialCapital} currency={config?.currency || meta.currency} />
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
        <MetricTile label="Ganho Médio" value={metrics.wins > 0 ? `+${formatCurrency(metrics.avgWin)}` : "—"} sub={metrics.avgWinR != null ? `${formatR(metrics.avgWinR)} médio · ${metrics.rWins} wins com risco` : "R sem dados: risco não definido"} color="emerald" />
        <MetricTile label="Perda Média" value={metrics.losses > 0 ? `−${formatCurrency(metrics.avgLoss)}` : "—"} sub={metrics.avgLossR != null ? `−${formatNumber(metrics.avgLossR)}R médio · ${metrics.rLosses} losses com risco` : "R sem dados: risco não definido"} color="rose" />
        <MetricTile label="Profit Factor" value={metrics.profitFactor > 0 ? formatNumber(metrics.profitFactor) : "—"} sub="Lucro bruto / perda bruta · recorte filtrado" color="emerald" />
        <MetricTile label="R Médio por Operação" value={metrics.avgR != null ? formatR(metrics.avgR) : "—"} sub={metrics.rTrades > 0 ? `${metrics.rTrades} operações com risco definido` : "Sem dados: nenhuma operação com risco definido"} color="sky" />
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
            {byAsset.length === 0 && <EmptyRow message={emptyAnalysisMessage} />}
            {byAsset.map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition">
                <div className="flex min-w-0 items-center gap-2.5">
                  <MarketSymbol symbol={item.key} size="md" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text-primary truncate">{item.key}</p>
                    <p className="text-[10px] text-slate-muted">{item.trades} operações</p>
                  </div>
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
            {bySetup.length === 0 && <EmptyRow message={emptyAnalysisMessage} />}
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
            {bySession.length === 0 && <EmptyRow message={emptyAnalysisMessage} />}
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
        <p className="-mt-3 mb-4 text-[11px] text-slate-muted">Percentuais calculados somente entre operações com avaliação registrada; “sem avaliação” não conta como operação fora do plano.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <MetricTile label="Dentro do plano" value={discipline.evaluated > 0 ? `${formatNumber(discipline.followedPercent, 0)}%` : "—"} sub={`${discipline.followedPlan} / ${discipline.evaluated} avaliadas`} color="emerald" />
          <MetricTile label="Fora do plano" value={discipline.evaluated > 0 ? `${formatNumber(discipline.notFollowedPercent, 0)}%` : "—"} sub={`${discipline.notFollowedPlan} / ${discipline.evaluated} avaliadas`} color="rose" />
          <MetricTile label="Sem avaliação" value={filteredTrades.length > 0 ? discipline.unassessed : "—"} sub={`${discipline.unassessed} / ${filteredTrades.length} operações`} color="amber" />
          <MetricTile label="Entrada antecipada" value={discipline.earlyEntry} sub="Operações marcadas" color="amber" />
          <MetricTile label="Revenge trade" value={discipline.revengeTrade} sub="Identificadas" color="rose" />
        </div>
        <div className="mt-5 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-text-primary">Status da Estratégia</h4>
              <p className="text-xs text-slate-muted">{discipline.evaluated > 0 ? `Base: ${discipline.evaluated} operações avaliadas no recorte filtrado` : "Ainda não há avaliações de aderência ao plano neste recorte."}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              discipline.evaluated === 0 ? "bg-surface-2 text-text-muted border-border" :
              discipline.followedPercent >= 80 ? "bg-emerald/10 text-emerald border-emerald/20" :
              discipline.followedPercent >= 60 ? "bg-amber/10 text-amber border-amber/20" :
              "bg-rose/10 text-rose border-rose/20"
            }`}>
              {discipline.evaluated === 0 ? "Sem avaliação" : discipline.followedPercent >= 80 ? "Excelente" : discipline.followedPercent >= 60 ? "Moderado" : "Precisa melhorar"}
            </span>
          </div>
        </div>
      </section>

      {/* Calendar Preview */}
      <section className="glass-card-strong p-5 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-text-primary">Calendário de Trading</h2>
            <p className="text-[11px] text-slate-muted mt-0.5">Últimos 14 dias com registro · filtros desta página aplicados</p>
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
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="text-xs text-slate-muted text-center py-4">{message}</p>;
}
