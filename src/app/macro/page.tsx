"use client";

import { useMemo } from "react";
import { Globe, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTrades } from "@/hooks/useTradeData";
import { formatCurrency } from "@/lib/utils";

export default function MacroPage() {
  const { trades } = useTrades();

  const macroTrades = useMemo(() => trades.filter((t) => t.macroEvent), [trades]);

  const biasCount = useMemo(() => {
    const map = new Map<string, number>();
    trades.forEach((t) => {
      if (t.macroBias) map.set(t.macroBias, (map.get(t.macroBias) || 0) + 1);
    });
    return map;
  }, [trades]);

  const dominantBias = useMemo(() => {
    let max = 0;
    let bias = "Neutro";
    biasCount.forEach((v, k) => {
      if (v > max) {
        max = v;
        bias = k;
      }
    });
    return bias;
  }, [biasCount]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Macroeconomia</h1>
        <p className="text-sm text-slate-muted mt-1">Eventos e contexto macroeconômico das operações registradas</p>
      </header>

      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <h2 className="text-base font-bold text-white mb-4">Eventos Registrados nas Suas Operações</h2>
        {macroTrades.length === 0 ? (
          <p className="text-xs text-slate-muted text-center py-8">Nenhum evento macroeconômico registrado ainda. Adicione ao cadastrar uma operação.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase text-slate-muted border-b border-white/5"><th className="text-left py-2">Evento</th><th className="text-left py-2">Moeda</th><th className="text-left py-2">Ativo</th><th className="text-left py-2">Impacto</th><th className="text-left py-2">Viés</th><th className="text-right py-2">Resultado</th></tr></thead>
            <tbody>
              {macroTrades.map((t) => (
                <tr key={t.id} className="border-b border-white/[0.03]">
                  <td className="py-2.5 text-white font-medium">{t.macroEvent}</td>
                  <td className="py-2.5 text-slate-300">{t.macroCurrency || "—"}</td>
                  <td className="py-2.5 text-slate-300">{t.asset}</td>
                  <td className="py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${t.macroImpact === "Alto" ? "bg-rose/10 text-rose" : t.macroImpact === "Médio" ? "bg-amber/10 text-amber" : "bg-sky/10 text-sky"}`}>{t.macroImpact || "—"}</span></td>
                  <td className="py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${t.macroBias === "Bullish" ? "bg-emerald/10 text-emerald" : t.macroBias === "Bearish" ? "bg-rose/10 text-rose" : "bg-sky/10 text-sky"}`}>{t.macroBias || "—"}</span></td>
                  <td className={`py-2.5 text-right font-bold ${(t.resultAmount || 0) >= 0 ? "text-emerald" : "text-rose"}`}>{(t.resultAmount || 0) >= 0 ? "+" : ""}{formatCurrency(t.resultAmount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card-strong p-5 md:p-6">
          <h2 className="text-sm font-bold text-white mb-4">Eventos Disponíveis para Registro</h2>
          <div className="flex flex-wrap gap-2">
            {["CPI", "NFP", "FOMC", "PCE", "GDP", "PMI", "Retail Sales", "Interest Rate", "Unemployment", "Outros"].map((e) => (
              <span key={e} className="text-xs px-2.5 py-1 rounded-md bg-dark-800 border border-white/5 text-slate-300">{e}</span>
            ))}
          </div>
        </div>
        <div className="glass-card-strong p-5 md:p-6">
          <h2 className="text-sm font-bold text-white mb-4">Viés Macro Dominante</h2>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${dominantBias === "Bullish" ? "bg-emerald/10 border-emerald/20" : dominantBias === "Bearish" ? "bg-rose/10 border-rose/20" : "bg-sky/10 border-sky/20"}`}>
              {dominantBias === "Bullish" ? <TrendingUp size={20} className="text-emerald" /> : dominantBias === "Bearish" ? <TrendingDown size={20} className="text-rose" /> : <Minus size={20} className="text-sky" />}
            </div>
            <div>
              <p className={`text-sm font-bold ${dominantBias === "Bullish" ? "text-emerald" : dominantBias === "Bearish" ? "text-rose" : "text-sky"}`}>{dominantBias}</p>
              <p className="text-[11px] text-slate-muted">Baseado nas operações com contexto macro registrado</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
