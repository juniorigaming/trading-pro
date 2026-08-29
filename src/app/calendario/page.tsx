"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTrades } from "@/hooks/useTradeData";
import { buildCalendarData, DayResult } from "@/lib/calculations";
import { formatCurrency, formatR } from "@/lib/utils";

const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function CalendarioPage() {
  const { trades, loading } = useTrades();
  const calendarMap = useMemo(() => buildCalendarData(trades), [trades]);

  const initialDate = useMemo(() => {
    const dates = Array.from(calendarMap.keys()).sort();
    return dates.length > 0 ? new Date(dates[dates.length - 1]) : new Date();
  }, [calendarMap]);

  const [viewDate, setViewDate] = useState(initialDate);
  const [selectedDay, setSelectedDay] = useState<DayResult | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();

  const monthTrades = useMemo(() => {
    return trades.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [trades, year, month]);

  const monthResult = monthTrades.reduce((s, t) => s + (t.resultAmount || 0), 0);
  const daysOperated = new Set(monthTrades.map((t) => new Date(t.date).toISOString().split("T")[0])).size;
  const monthWins = monthTrades.filter((t) => t.resultType === "WIN").length;
  const monthLosses = monthTrades.filter((t) => t.resultType === "LOSS").length;
  const dayWinRate = monthWins + monthLosses > 0 ? (monthWins / (monthWins + monthLosses)) * 100 : 0;

  const changeMonth = (delta: number) => {
    setViewDate(new Date(year, month + delta, 1));
    setSelectedDay(null);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Calendário</h1>
        <p className="text-sm text-slate-muted mt-1">Acompanhe seus resultados dia a dia</p>
      </header>

      {loading ? (
        <div className="glass-card-strong p-12 text-center text-slate-muted text-sm">Carregando...</div>
      ) : (
        <div className="glass-card-strong p-5 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-extrabold text-white">{monthNames[month]} {year}</h2>
            <div className="flex gap-2">
              <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition"><ChevronLeft size={18} /></button>
              <button onClick={() => changeMonth(1)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition"><ChevronRight size={18} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 md:gap-3 mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="text-center text-[10px] text-slate-muted font-medium uppercase tracking-wider">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2 md:gap-3">
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const data = calendarMap.get(key);
              return (
                <button
                  key={day}
                  onClick={() => data && setSelectedDay(data)}
                  className={`aspect-[4/3] md:aspect-square rounded-xl p-2 md:p-3 border flex flex-col justify-between transition text-left ${
                    !data ? "bg-dark-900/40 border-white/[0.03] text-slate-600 cursor-default" :
                    data.result > 0 ? "bg-emerald/5 border-emerald/15 hover:border-emerald/30 text-emerald hover:scale-[1.03]" :
                    data.result < 0 ? "bg-rose/5 border-rose/15 hover:border-rose/30 text-rose hover:scale-[1.03]" :
                    "bg-sky/5 border-sky/15 hover:border-sky/30 text-sky hover:scale-[1.03]"
                  }`}
                >
                  <span className="text-[10px] md:text-xs font-bold opacity-60">{day}</span>
                  {data ? (
                    <div>
                      <p className="text-xs md:text-sm font-extrabold">{data.result > 0 ? "+" : ""}{formatCurrency(data.result)}</p>
                      <p className="text-[9px] md:text-[10px] opacity-70">{data.trades} ops</p>
                    </div>
                  ) : (
                    <span className="text-[9px] opacity-40">Sem op.</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 pt-5 border-t border-white/5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card p-4 rounded-xl">
              <h3 className="text-xs font-bold text-white mb-1">Dias Operados</h3>
              <p className="text-2xl font-extrabold text-emerald">{daysOperated}</p>
              <p className="text-[10px] text-slate-muted">De {daysInMonth} dias no mês</p>
            </div>
            <div className="glass-card p-4 rounded-xl">
              <h3 className="text-xs font-bold text-white mb-1">Win Rate por Dia</h3>
              <p className="text-2xl font-extrabold text-emerald">{dayWinRate.toFixed(1)}%</p>
              <p className="text-[10px] text-slate-muted">Considerando dias com operação</p>
            </div>
            <div className="glass-card p-4 rounded-xl">
              <h3 className="text-xs font-bold text-white mb-1">Resultado Mensal</h3>
              <p className={`text-2xl font-extrabold ${monthResult >= 0 ? "text-emerald" : "text-rose"}`}>{monthResult >= 0 ? "+" : ""}{formatCurrency(monthResult)}</p>
              <p className="text-[10px] text-slate-muted">Acumulado no mês</p>
            </div>
          </div>
        </div>
      )}

      {selectedDay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedDay(null)}>
          <div className="glass-card-strong p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-white">{new Date(selectedDay.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</h3>
              <button onClick={() => setSelectedDay(null)} className="text-slate-muted hover:text-white"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="glass-card p-3 rounded-xl text-center">
                <p className="text-[10px] text-slate-muted uppercase">Operações</p>
                <p className="text-xl font-extrabold text-white">{selectedDay.trades}</p>
              </div>
              <div className="glass-card p-3 rounded-xl text-center">
                <p className="text-[10px] text-slate-muted uppercase">Resultado</p>
                <p className={`text-xl font-extrabold ${selectedDay.result >= 0 ? "text-emerald" : "text-rose"}`}>{selectedDay.result >= 0 ? "+" : ""}{formatCurrency(selectedDay.result)}</p>
              </div>
              <div className="glass-card p-3 rounded-xl text-center">
                <p className="text-[10px] text-slate-muted uppercase">Wins / Losses / BE</p>
                <p className="text-sm font-bold"><span className="text-emerald">{selectedDay.wins}</span> / <span className="text-rose">{selectedDay.losses}</span> / <span className="text-sky">{selectedDay.breakEven}</span></p>
              </div>
              <div className="glass-card p-3 rounded-xl text-center">
                <p className="text-[10px] text-slate-muted uppercase">Resultado R</p>
                <p className={`text-sm font-bold ${selectedDay.resultR >= 0 ? "text-emerald" : "text-rose"}`}>{formatR(selectedDay.resultR)}</p>
              </div>
            </div>
            <div className="mb-4">
              <p className="text-[10px] text-slate-muted uppercase mb-1.5">Ativos Operados</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedDay.assets.map((a) => (
                  <span key={a} className="text-[10px] px-2 py-0.5 rounded bg-dark-800 border border-white/5 text-slate-300">{a}</span>
                ))}
              </div>
            </div>
            <Link href="/operacoes" className="block text-center text-xs font-bold text-emerald hover:underline">Ver todas as operações deste dia →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
