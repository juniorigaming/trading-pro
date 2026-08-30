"use client";

import { useMemo, useState } from "react";
import { BarChart3, Clock, Calendar, TrendingUp, Target, Filter, Flame, Gauge } from "lucide-react";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { groupByAsset, groupBySession, groupBySetup, groupByWeekday, groupByHour, calculateMetrics, rDistribution } from "@/lib/calculations";
import { formatCurrency, formatNumber, formatR } from "@/lib/utils";
import SampleSizeWarning from "@/components/SampleSizeWarning";

interface EdgeFilters {
  asset: string;
  session: string;
  macroAligned: string;
  dxyAligned: string;
  sweep: string;
  displacement: string;
  mss: string;
  fvg: string;
  ob: string;
}

export default function AnalisesPage() {
  const { trades, loading } = useTrades();
  const { config } = useConfig();
  const initialCapital = config?.initialCapital ?? 10000;

  const [edge, setEdge] = useState<EdgeFilters>({
    asset: "all", session: "all", macroAligned: "all", dxyAligned: "all", sweep: "all", displacement: "all", mss: "all", fvg: "all", ob: "all",
  });

  const byAsset = useMemo(() => groupByAsset(trades), [trades]);
  const bySetup = useMemo(() => groupBySetup(trades), [trades]);
  const bySession = useMemo(() => groupBySession(trades), [trades]);
  const byWeekday = useMemo(() => groupByWeekday(trades), [trades]);
  const byHour = useMemo(() => groupByHour(trades), [trades]);
  const metrics = useMemo(() => calculateMetrics(trades, initialCapital), [trades, initialCapital]);
  const rDist = useMemo(() => rDistribution(trades), [trades]);

  const edgeTrades = useMemo(() => {
    return trades.filter((t) => {
      if (edge.asset !== "all" && t.asset !== edge.asset) return false;
      if (edge.session !== "all" && t.session !== edge.session) return false;
      if (edge.macroAligned !== "all" && (!!t.macroBias && t.macroBias !== "Neutro") !== (edge.macroAligned === "yes")) return false;
      if (edge.dxyAligned !== "all" && !!t.dxyBias !== (edge.dxyAligned === "yes")) return false;
      if (edge.sweep !== "all" && !!t.sweepLiquidity !== (edge.sweep === "yes")) return false;
      if (edge.displacement !== "all" && !!t.displacement !== (edge.displacement === "yes")) return false;
      if (edge.mss !== "all" && !!t.choch !== (edge.mss === "yes")) return false;
      if (edge.fvg !== "all" && !!t.fvg !== (edge.fvg === "yes")) return false;
      if (edge.ob !== "all" && !!t.orderBlock !== (edge.ob === "yes")) return false;
      return true;
    });
  }, [trades, edge]);

  const edgeMetrics = useMemo(() => calculateMetrics(edgeTrades, initialCapital), [edgeTrades, initialCapital]);
  const edgeAssets = useMemo(() => Array.from(new Set(trades.map((t) => t.asset))).sort(), [trades]);
  const edgeSessions = useMemo(() => Array.from(new Set(trades.map((t) => t.session))).sort(), [trades]);

  // Execution score vs result
  const execAnalysis = useMemo(() => {
    const sc = trades.filter((t) => t.executionScore != null);
    const avgExec = sc.length ? sc.reduce((s, t) => s + (t.executionScore || 0), 0) / sc.length : 0;
    const winExec = sc.filter((t) => t.resultType === "WIN");
    const lossExec = sc.filter((t) => t.resultType === "LOSS");
    const avgWinExec = winExec.length ? winExec.reduce((s, t) => s + (t.executionScore || 0), 0) / winExec.length : 0;
    const avgLossExec = lossExec.length ? lossExec.reduce((s, t) => s + (t.executionScore || 0), 0) / lossExec.length : 0;
    return { avgExec, avgWinExec, avgLossExec, count: sc.length };
  }, [trades]);

  // MAE / MFE
  const maeMfe = useMemo(() => {
    const w = trades.filter((t) => t.maeAmount != null && t.mfeAmount != null && t.resultType === "WIN");
    const l = trades.filter((t) => t.maeAmount != null && t.mfeAmount != null && t.resultType === "LOSS");
    const all = trades.filter((t) => t.maeAmount != null && t.mfeAmount != null);
    const avg = (arr: TradeLike[]) => arr.length ? arr.reduce((s, t) => s + (t.maeAmount || 0), 0) / arr.length : 0;
    const avgMfe = (arr: TradeLike[]) => arr.length ? arr.reduce((s, t) => s + (t.mfeAmount || 0), 0) / arr.length : 0;
    return { avgMaeWin: avg(w), avgMaeLoss: avg(l), avgMfeWin: avgMfe(w), avgMfeAll: avgMfe(all), count: all.length };
  }, [trades]);

  const maxAbsResult = Math.max(1, ...byWeekday.map((d) => Math.abs(d.result)));

  if (loading) return <div className="p-8 text-center text-slate-muted text-sm">Carregando...</div>;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Análises</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <p className="text-sm text-slate-muted">{trades.length} operações</p>
          <SampleSizeWarning n={trades.length} />
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <AnalysisTable title="Por Ativo" icon={BarChart3} rows={byAsset} />
        <AnalysisTable title="Por Setup" icon={Target} rows={bySetup} />
        <AnalysisTable title="Por Sessão" icon={Clock} rows={bySession} />
      </section>

      {/* Edge Explorer */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Filter size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Edge Explorer</h2>
          <SampleSizeWarning n={edgeTrades.length} />
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <Sel label="Ativo" value={edge.asset} onChange={(v) => setEdge({ ...edge, asset: v })} options={["all", ...edgeAssets]} />
          <Sel label="Sessão" value={edge.session} onChange={(v) => setEdge({ ...edge, session: v })} options={["all", ...edgeSessions]} />
          <Sel label="Macro" value={edge.macroAligned} onChange={(v) => setEdge({ ...edge, macroAligned: v })} options={["all", "yes", "no"]} />
          <Sel label="DXY" value={edge.dxyAligned} onChange={(v) => setEdge({ ...edge, dxyAligned: v })} options={["all", "yes", "no"]} />
          <Sel label="Sweep" value={edge.sweep} onChange={(v) => setEdge({ ...edge, sweep: v })} options={["all", "yes", "no"]} />
          <Sel label="Disp." value={edge.displacement} onChange={(v) => setEdge({ ...edge, displacement: v })} options={["all", "yes", "no"]} />
          <Sel label="MSS/CHoCH" value={edge.mss} onChange={(v) => setEdge({ ...edge, mss: v })} options={["all", "yes", "no"]} />
          <Sel label="FVG" value={edge.fvg} onChange={(v) => setEdge({ ...edge, fvg: v })} options={["all", "yes", "no"]} />
          <Sel label="OB" value={edge.ob} onChange={(v) => setEdge({ ...edge, ob: v })} options={["all", "yes", "no"]} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <EdgeStat label="Trades" value={String(edgeTrades.length)} />
          <EdgeStat label="Win Rate" value={`${formatNumber(edgeMetrics.winRate, 1)}%`} />
          <EdgeStat label="Avg R" value={formatR(edgeMetrics.avgR)} />
          <EdgeStat label="Expectancy (R)" value={formatR(edgeMetrics.expectancy ? edgeMetrics.expectancy / (edgeMetrics.avgLoss || 1) : 0)} />
          <EdgeStat label="Profit Factor" value={formatNumber(edgeMetrics.profitFactor)} />
          <EdgeStat label="Max DD" value={`-${formatNumber(edgeMetrics.maxDrawdown)}%`} />
        </div>
      </section>

      {/* Execution vs Result */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="glass-card-strong p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Gauge size={16} className="text-accent" /></div>
            <h2 className="text-base font-bold text-text-primary">Execution Score vs Resultado</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-card p-3 rounded-xl text-center"><p className="text-[10px] text-text-muted uppercase">Média Geral</p><p className="text-xl font-extrabold text-text-primary">{execAnalysis.avgExec ? formatNumber(execAnalysis.avgExec, 0) : "—"}</p></div>
            <div className="glass-card p-3 rounded-xl text-center"><p className="text-[10px] text-text-muted uppercase">Wins</p><p className="text-xl font-extrabold text-emerald">{execAnalysis.avgWinExec ? formatNumber(execAnalysis.avgWinExec, 0) : "—"}</p></div>
            <div className="glass-card p-3 rounded-xl text-center"><p className="text-[10px] text-text-muted uppercase">Losses</p><p className="text-xl font-extrabold text-rose">{execAnalysis.avgLossExec ? formatNumber(execAnalysis.avgLossExec, 0) : "—"}</p></div>
          </div>
          <p className="text-[11px] text-text-muted mt-3">Um WIN pode ter execução ruim e um LOSS pode ter execução excelente — o score mede aderência ao processo, não o resultado.</p>
        </div>

        <div className="glass-card-strong p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Flame size={16} className="text-accent" /></div>
            <h2 className="text-base font-bold text-text-primary">MAE vs MFE (Captura)</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-3 rounded-xl text-center"><p className="text-[10px] text-text-muted uppercase">MAE média (wins)</p><p className="text-lg font-extrabold text-rose">-{formatCurrency(maeMfe.avgMaeWin)}</p></div>
            <div className="glass-card p-3 rounded-xl text-center"><p className="text-[10px] text-text-muted uppercase">MAE média (losses)</p><p className="text-lg font-extrabold text-rose">-{formatCurrency(maeMfe.avgMaeLoss)}</p></div>
            <div className="glass-card p-3 rounded-xl text-center"><p className="text-[10px] text-text-muted uppercase">MFE média (wins)</p><p className="text-lg font-extrabold text-emerald">+{formatCurrency(maeMfe.avgMfeWin)}</p></div>
            <div className="glass-card p-3 rounded-xl text-center"><p className="text-[10px] text-text-muted uppercase">MFE média (todas)</p><p className="text-lg font-extrabold text-emerald">+{formatCurrency(maeMfe.avgMfeAll)}</p></div>
          </div>
          <SampleSizeWarning n={maeMfe.count} />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="glass-card-strong p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Calendar size={16} className="text-accent" /></div>
            <h2 className="text-base font-bold text-text-primary">Por Dia da Semana</h2>
          </div>
          {byWeekday.every((d) => d.trades === 0) ? <Empty /> : (
            <div className="space-y-3">
              {byWeekday.map((day) => (
                <div key={day.key} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-2 border border-border">
                  <span className="w-20 text-xs font-bold text-text-secondary">{day.key}</span>
                  <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
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
            <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><TrendingUp size={16} className="text-accent" /></div>
            <h2 className="text-base font-bold text-text-primary">Expectancy e Distribuição de R</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="glass-card p-4 rounded-xl text-center">
              <p className="text-[10px] text-text-muted uppercase">Expectancy ($)</p>
              <p className={`text-2xl font-extrabold mt-1 ${metrics.expectancy >= 0 ? "text-emerald" : "text-rose"}`}>{metrics.expectancy >= 0 ? "+" : ""}{formatCurrency(metrics.expectancy)}</p>
            </div>
            <div className="glass-card p-4 rounded-xl text-center">
              <p className="text-[10px] text-text-muted uppercase">R Médio</p>
              <p className={`text-2xl font-extrabold mt-1 ${rDist.avg >= 0 ? "text-emerald" : "text-rose"}`}>{formatR(rDist.avg)}</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div><p className="text-text-muted text-[10px] uppercase">Mediana</p><p className="font-bold text-text-primary">{formatNumber(rDist.median)}R</p></div>
            <div><p className="text-text-muted text-[10px] uppercase">Maior R</p><p className="font-bold text-emerald">{formatNumber(rDist.max)}R</p></div>
            <div><p className="text-text-muted text-[10px] uppercase">Menor R</p><p className="font-bold text-rose">{formatNumber(rDist.min)}R</p></div>
            <div><p className="text-text-muted text-[10px] uppercase">Total R</p><p className="font-bold text-text-primary">{formatNumber(rDist.total)}R</p></div>
          </div>
        </div>
      </section>

      <section className="glass-card-strong p-5 md:p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Clock size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Por Horário</h2>
        </div>
        {byHour.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {byHour.map((h) => (
              <div key={h.key} className="glass-card p-3 rounded-xl text-center">
                <p className="text-[10px] text-text-muted">{h.key}</p>
                <p className={`text-sm font-extrabold ${h.result >= 0 ? "text-emerald" : "text-rose"}`}>{h.result >= 0 ? "+" : ""}{formatCurrency(h.result)}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{h.trades} ops · WR {formatNumber(h.winRate, 0)}%</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type TradeLike = { maeAmount?: number; mfeAmount?: number; resultType?: string };

function AnalysisTable({ title, icon: Icon, rows }: { title: string; icon: typeof BarChart3; rows: ReturnType<typeof groupByAsset> }) {
  return (
    <div className="glass-card-strong p-5 md:p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Icon size={16} className="text-accent" /></div>
        <h2 className="text-base font-bold text-text-primary">{title}</h2>
        <SampleSizeWarning n={rows.reduce((s, r) => s + r.trades, 0)} show={rows.length > 0} />
      </div>
      {rows.length === 0 ? <Empty /> : (
        <table className="w-full text-sm">
          <thead><tr className="text-[10px] uppercase text-text-muted border-b border-border"><th className="text-left py-2">{title.replace("Por ", "")}</th><th className="text-right py-2">WR</th><th className="text-right py-2">Resultado</th><th className="text-right py-2">Ops</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border-subtle">
                <td className="py-2.5 text-text-primary font-medium">{r.key}</td>
                <td className={`py-2.5 text-right ${r.winRate >= 50 ? "text-emerald" : "text-amber"}`}>{formatNumber(r.winRate, 0)}%</td>
                <td className={`py-2.5 text-right ${r.result >= 0 ? "text-emerald" : "text-rose"}`}>{r.result >= 0 ? "+" : ""}{formatCurrency(r.result)}</td>
                <td className="py-2.5 text-right text-text-secondary">{r.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/30 cursor-pointer">
      {options.map((o) => <option key={o} value={o}>{o === "all" ? `${label}: Todos` : o === "yes" ? `${label}: Sim` : o === "no" ? `${label}: Não` : `${label}: ${o}`}</option>)}
    </select>
  );
}

function EdgeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-3 rounded-xl text-center">
      <p className="text-[10px] uppercase text-text-muted font-semibold">{label}</p>
      <p className="text-lg font-extrabold text-text-primary mt-0.5">{value}</p>
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-text-muted text-center py-8">Nenhum dado disponível ainda. Registre operações para ver as análises.</p>;
}
