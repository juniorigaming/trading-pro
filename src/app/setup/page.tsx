"use client";

import { useMemo } from "react";
import { Square, CheckSquare, BarChart3 } from "lucide-react";
import { useTrades } from "@/hooks/useTradeData";
import { groupBySetup } from "@/lib/calculations";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function SetupPage() {
  const { trades } = useTrades();
  const bySetup = useMemo(() => groupBySetup(trades), [trades]);

  const liquidityCounts = useMemo(() => {
    const map = new Map<string, number>();
    trades.forEach((t) => {
      if (t.liquidityType) map.set(t.liquidityType, (map.get(t.liquidityType) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [trades]);

  const sweptCounts = useMemo(() => {
    const map = new Map<string, number>();
    trades.forEach((t) => {
      if (t.liquiditySwept) map.set(t.liquiditySwept, (map.get(t.liquiditySwept) || 0) + 1);
    });
    return map;
  }, [trades]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Setup / Estratégia</h1>
        <p className="text-sm text-slate-muted mt-1">Performance da sua estratégia SMC por setup</p>
      </header>

      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-violet/10 flex items-center justify-center"><BarChart3 size={16} className="text-violet" /></div>
          <h2 className="text-base font-bold text-white">Performance por Setup</h2>
        </div>
        {bySetup.length === 0 ? (
          <p className="text-xs text-slate-muted text-center py-8">Nenhuma operação registrada ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase text-slate-muted border-b border-white/5"><th className="text-left py-2">Setup</th><th className="text-right py-2">Ops</th><th className="text-right py-2">WR</th><th className="text-right py-2">Resultado</th><th className="text-right py-2">R Médio</th><th className="text-right py-2">Profit Factor</th></tr></thead>
            <tbody>
              {bySetup.map((s) => (
                <tr key={s.key} className="border-b border-white/[0.03]">
                  <td className="py-2.5 text-white font-medium">{s.key}</td>
                  <td className="py-2.5 text-right text-slate-300">{s.trades}</td>
                  <td className={`py-2.5 text-right ${s.winRate >= 50 ? "text-emerald" : "text-amber"}`}>{formatNumber(s.winRate, 0)}%</td>
                  <td className={`py-2.5 text-right ${s.result >= 0 ? "text-emerald" : "text-rose"}`}>{s.result >= 0 ? "+" : ""}{formatCurrency(s.result)}</td>
                  <td className="py-2.5 text-right text-slate-300">{formatNumber(s.avgR)}R</td>
                  <td className="py-2.5 text-right text-slate-300">{s.profitFactor === Infinity ? "∞" : formatNumber(s.profitFactor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card-strong p-5 md:p-6">
          <h2 className="text-sm font-bold text-white mb-4">Referência: Checklist SMC</h2>
          <div className="space-y-2.5">
            {["Estrutura HTF definida", "Estrutura LTF definida", "BOS", "CHoCH", "Liquidez identificada", "Sweep de liquidez", "Deslocamento", "Confirmação de tendência", "FVG presente", "Order Block presente", "Entrada em região válida"].map((item) => (
              <div key={item} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-slate-300">
                <Square size={14} className="text-slate-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card-strong p-5 md:p-6">
          <h2 className="text-sm font-bold text-white mb-4">Contexto de Liquidez (Operações Reais)</h2>
          {liquidityCounts.length === 0 ? (
            <p className="text-xs text-slate-muted text-center py-8">Nenhum dado de liquidez registrado ainda.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {liquidityCounts.map(([liq, count]) => (
                <div key={liq} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs">
                  <span className="text-slate-300">{liq}</span>
                  <span className="font-bold text-white">{count}x</span>
                </div>
              ))}
            </div>
          )}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <h4 className="text-xs font-bold text-white mb-2">Londres capturou liquidez antes da entrada?</h4>
            <div className="flex gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald/10 text-emerald border border-emerald/20">Sim: {sweptCounts.get("Sim") || 0}</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose/10 text-rose border border-rose/20">Não: {sweptCounts.get("Não") || 0}</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber/10 text-amber border border-amber/20">Parcial: {sweptCounts.get("Parcial") || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
