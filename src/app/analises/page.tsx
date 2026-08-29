"use client";

import { useMemo } from "react";
import { BarChart3, Clock, Calendar, TrendingUp, Target } from "lucide-react";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { groupByAsset, groupBySession, groupBySetup, groupByWeekday, groupByHour, calculateMetrics, rDistribution } from "@/lib/calculations";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function AnalisesPage() {
  const { trades, loading } = useTrades();
  const { config } = useConfig();
  const initialCapital = config?.initialCapital ?? 10000;

  const byAsset = useMemo(() => groupByAsset(trades), [trades]);
  const bySetup = useMemo(() => groupBySetup(trades), [trades]);
  const bySession = useMemo(() => groupBySession(trades), [trades]);
  const byWeekday = useMemo(() => groupByWeekday(trades), [trades]);
  const byHour = useMemo(() => groupByHour(trades), [trades]);
  const metrics = useMemo(() => calculateMetrics(trades, initialCapital), [trades, initialCapital]);
  const rDist = useMemo(() => rDistribution(trades), [trades]);

  const maxAbsResult = Math.max(1, ...byWeekday.map((d) => Math.abs(d.result)));

  if (loading) return <div className="p-8 text-center text-slate-muted text-sm">Carregando...</div>;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Análises</h1>
        <p className="text-sm text-slate-muted mt-1">Análises detalhadas de performance ({trades.length} operações)</p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <AnalysisTable title="Por Ativo" icon={BarChart3} rows={byAsset} />
        <AnalysisTable title="Por Setup" icon={Target} rows={bySetup} />
        <AnalysisTable title="Por Sessão" icon={Clock} rows={bySession} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="glass-card-strong p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-violet/10 flex items-center justify-center"><Calendar size={16} className="text-violet" /></div>
            <h2 className="text-base font-bold text-white">Por Dia da Semana</h2>
          </div>
          {byWeekday.every((d) => d.trades === 0) ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {byWeekday.map((day) => (
                <div key={day.key} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <span className="w-20 text-xs font-bold text-slate-300">{day.key}</span>
                  <div className="flex-1 h-2 bg-dark-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${day.result >= 0 ? "bg-emerald" : "bg-rose"}`} style={{ width: `${(Math.abs(day.result) / maxAbsResult) * 100}%` }} />
                  </div>
                  <span className={`text-xs font-extrabold w-20 text-right ${day.result >= 0 ? "text-emerald" : "text-rose"}`}>{day.result >= 0 ? "+" : ""}{formatCurrency(day.result)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card-strong p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-violet/10 flex items-center justify-center"><TrendingUp size={16} className="text-violet" /></div>
            <h2 className="text-base font-bold text-white">Expectancy e Distribuição de R</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="glass-card p-4 rounded-xl text-center">
              <p className="text-[10px] text-slate-muted uppercase">Expectancy ($)</p>
              <p className={`text-2xl font-extrabold mt-1 ${metrics.expectancy >= 0 ? "text-emerald" : "text-rose"}`}>{metrics.expectancy >= 0 ? "+" : ""}{formatCurrency(metrics.expectancy)}</p>
            </div>
            <div className="glass-card p-4 rounded-xl text-center">
              <p className="text-[10px] text-slate-muted uppercase">R Médio</p>
              <p className={`text-2xl font-extrabold mt-1 ${rDist.avg >= 0 ? "text-emerald" : "text-rose"}`}>{rDist.avg >= 0 ? "+" : ""}{formatNumber(rDist.avg)}R</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div><p className="text-slate-muted text-[10px] uppercase">Mediana</p><p className="font-bold text-white">{formatNumber(rDist.median)}R</p></div>
            <div><p className="text-slate-muted text-[10px] uppercase">Maior R</p><p className="font-bold text-emerald">{formatNumber(rDist.max)}R</p></div>
            <div><p className="text-slate-muted text-[10px] uppercase">Menor R</p><p className="font-bold text-rose">{formatNumber(rDist.min)}R</p></div>
            <div><p className="text-slate-muted text-[10px] uppercase">Total R</p><p className="font-bold text-white">{formatNumber(rDist.total)}R</p></div>
          </div>
        </div>
      </section>

      <section className="glass-card-strong p-5 md:p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-violet/10 flex items-center justify-center"><Clock size={16} className="text-violet" /></div>
          <h2 className="text-base font-bold text-white">Por Horário</h2>
        </div>
        {byHour.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {byHour.map((h) => (
              <div key={h.key} className="glass-card p-3 rounded-xl text-center">
                <p className="text-[10px] text-slate-muted">{h.key}</p>
                <p className={`text-sm font-extrabold ${h.result >= 0 ? "text-emerald" : "text-rose"}`}>{h.result >= 0 ? "+" : ""}{formatCurrency(h.result)}</p>
                <p className="text-[10px] text-slate-muted mt-0.5">{h.trades} ops · WR {formatNumber(h.winRate, 0)}%</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AnalysisTable({ title, icon: Icon, rows }: { title: string; icon: typeof BarChart3; rows: ReturnType<typeof groupByAsset> }) {
  return (
    <div className="glass-card-strong p-5 md:p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-violet/10 flex items-center justify-center"><Icon size={16} className="text-violet" /></div>
        <h2 className="text-base font-bold text-white">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-[10px] uppercase text-slate-muted border-b border-white/5"><th className="text-left py-2">{title.replace("Por ", "")}</th><th className="text-right py-2">WR</th><th className="text-right py-2">Resultado</th><th className="text-right py-2">Ops</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-white/[0.03]">
                <td className="py-2.5 text-white font-medium">{r.key}</td>
                <td className={`py-2.5 text-right ${r.winRate >= 50 ? "text-emerald" : "text-amber"}`}>{formatNumber(r.winRate, 0)}%</td>
                <td className={`py-2.5 text-right ${r.result >= 0 ? "text-emerald" : "text-rose"}`}>{r.result >= 0 ? "+" : ""}{formatCurrency(r.result)}</td>
                <td className="py-2.5 text-right text-slate-300">{r.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EmptyState() {
  return <p className="text-xs text-slate-muted text-center py-8">Nenhum dado disponível ainda. Registre operações para ver as análises.</p>;
}
