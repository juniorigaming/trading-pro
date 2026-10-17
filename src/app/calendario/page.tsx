"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import { useTrades } from "@/hooks/useTradeData";
import { buildCalendarData, DayResult } from "@/lib/calculations";
import { formatCurrency, formatR } from "@/lib/utils";
import { localTodayKey, shiftDayKey } from "@/lib/date";

const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const monthShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Filtro de período: "MONTH" = navegação mês a mês (padrão); número = últimos N dias até hoje. */
type Period = "MONTH" | 15 | 30 | 90 | 180;
const PERIODS: { id: Period; label: string; days?: number }[] = [
  { id: "MONTH", label: "Mês" },
  { id: 15, label: "15 dias" },
  { id: 30, label: "30 dias" },
  { id: 90, label: "3 meses" },
  { id: 180, label: "6 meses" },
];
const STORAGE_KEY = "tp.calendar.period";

/** Chave de dia no mesmo padrão do calendário (YYYY-MM-DD, UTC — igual a buildCalendarData). */
const fmtShort = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
const fmtLong = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

interface RangeStats {
  days: number; daysOperated: number; trades: number; wins: number; losses: number; breakEven: number;
  result: number; resultR: number; winRate: number; best: DayResult | null; worst: DayResult | null; avgPerDay: number;
}
function statsFor(days: DayResult[], totalDays: number): RangeStats {
  const trades = days.reduce((s, d) => s + d.trades, 0);
  const wins = days.reduce((s, d) => s + d.wins, 0);
  const losses = days.reduce((s, d) => s + d.losses, 0);
  const breakEven = days.reduce((s, d) => s + d.breakEven, 0);
  const result = days.reduce((s, d) => s + d.result, 0);
  const resultR = days.reduce((s, d) => s + d.resultR, 0);
  const sorted = [...days].sort((a, b) => b.result - a.result);
  return {
    days: totalDays, daysOperated: days.length, trades, wins, losses, breakEven, result, resultR,
    winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
    best: sorted[0] ?? null, worst: sorted.length ? sorted[sorted.length - 1] : null,
    avgPerDay: days.length ? result / days.length : 0,
  };
}

export default function CalendarioPage() {
  const { trades, loading } = useTrades();
  const calendarMap = useMemo(() => buildCalendarData(trades), [trades]);

  const [period, setPeriod] = useState<Period>("MONTH");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) { const p = saved === "MONTH" ? "MONTH" : (Number(saved) as Period); if (PERIODS.some((x) => x.id === p)) Promise.resolve().then(() => setPeriod(p)); }
    } catch { /* storage indisponível */ }
  }, []);
  const choosePeriod = (p: Period) => {
    setPeriod(p); setSelectedDay(null);
    try { localStorage.setItem(STORAGE_KEY, String(p)); } catch { /* ignore */ }
    if (p !== "MONTH") setViewDate(new Date()); // período sempre termina hoje → mostra o mês atual
  };

  // Intervalo do filtro (inclusivo): [hoje − (N−1), hoje]
  const range = useMemo(() => {
    if (period === "MONTH") return null;
    const end = localTodayKey();
    return { start: shiftDayKey(end, -(period - 1)), end, days: period };
  }, [period]);
  const inRange = (key: string) => !range || (key >= range.start && key <= range.end);

  const initialDate = useMemo(() => {
    const dates = Array.from(calendarMap.keys()).sort();
    return dates.length > 0 ? new Date(`${dates[dates.length - 1]}T12:00:00`) : new Date();
  }, [calendarMap]);

  const [viewDate, setViewDate] = useState(initialDate);
  const [selectedDay, setSelectedDay] = useState<DayResult | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Dias do mês exibido (mesma chave do grid) e dias do período filtrado
  // (cálculos leves — sem memoização manual, o React Compiler cuida disso)
  const monthDays = Array.from(calendarMap.values()).filter((d) => d.date.startsWith(monthPrefix));
  const periodDays = range ? Array.from(calendarMap.values()).filter((d) => d.date >= range.start && d.date <= range.end).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const monthStats = statsFor(monthDays, daysInMonth);
  const periodStats = range ? statsFor(periodDays, range.days) : null;
  const stats = periodStats ?? monthStats;

  // Resumo por mês (útil para 3 e 6 meses, já que o grid mostra um mês por vez)
  const perMonth = (() => {
    if (!range) return [];
    const acc = new Map<string, { result: number; trades: number; days: number }>();
    for (const d of periodDays) { const k = d.date.slice(0, 7); const o = acc.get(k) ?? { result: 0, trades: 0, days: 0 }; o.result += d.result; o.trades += d.trades; o.days += 1; acc.set(k, o); }
    // inclui meses do intervalo sem operação (para o usuário ver o vazio)
    const cur = new Date(range.start + "T00:00:00Z"); const endKey = range.end.slice(0, 7);
    while (cur.toISOString().slice(0, 7) <= endKey) { const k = cur.toISOString().slice(0, 7); if (!acc.has(k)) acc.set(k, { result: 0, trades: 0, days: 0 }); cur.setUTCMonth(cur.getUTCMonth() + 1, 1); }
    return Array.from(acc.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ key: k, label: `${monthShort[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}`, ...v }));
  })();

  // Navegação de mês: no modo período, não sai do intervalo
  const canGo = (delta: number) => {
    if (!range) return true;
    const target = new Date(year, month + delta, 1);
    const k = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
    return k >= range.start.slice(0, 7) && k <= range.end.slice(0, 7);
  };
  const changeMonth = (delta: number) => {
    if (!canGo(delta)) return;
    setViewDate(new Date(year, month + delta, 1));
    setSelectedDay(null);
  };
  const goToMonth = (ym: string) => { setViewDate(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)); setSelectedDay(null); };

  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? "";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Calendário</h1>
          <p className="text-sm text-slate-muted mt-1">Acompanhe seus resultados dia a dia</p>
        </div>
        {/* Filtro de período */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-muted font-medium"><Filter size={12} /> Período</span>
          <div className="inline-flex rounded-xl border border-white/10 bg-dark-900/60 p-1 gap-1">
            {PERIODS.map((p) => (
              <button
                key={String(p.id)}
                onClick={() => choosePeriod(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${period === p.id ? "bg-emerald/15 text-emerald border border-emerald/30" : "text-slate-400 hover:text-text-primary hover:bg-white/5 border border-transparent"}`}
                title={p.id === "MONTH" ? "Navegar mês a mês" : `Operações dos últimos ${p.id} dias (até hoje)`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="glass-card-strong p-12 text-center text-slate-muted text-sm">Carregando...</div>
      ) : (
        <div className="glass-card-strong p-5 md:p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div>
              <h2 className="text-lg font-extrabold text-text-primary">{monthNames[month]} {year}</h2>
              {range && (
                <p className="text-[11px] text-slate-muted inline-flex items-center gap-1 mt-0.5">
                  <CalendarDays size={12} /> Últimos {periodLabel} · {fmtLong(range.start)} – {fmtLong(range.end)} · dias fora do período aparecem apagados
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => changeMonth(-1)} disabled={!canGo(-1)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-text-primary transition disabled:opacity-25 disabled:cursor-not-allowed"><ChevronLeft size={18} /></button>
              <button onClick={() => changeMonth(1)} disabled={!canGo(1)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-text-primary transition disabled:opacity-25 disabled:cursor-not-allowed"><ChevronRight size={18} /></button>
            </div>
          </div>

          {/* Resumo por mês dentro do período (3/6 meses): clique para navegar até o mês */}
          {range && perMonth.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {perMonth.map((m) => (
                <button key={m.key} onClick={() => goToMonth(m.key)}
                  className={`px-2.5 py-1.5 rounded-lg border text-left transition ${m.key === monthPrefix ? "border-emerald/40 bg-emerald/10" : "border-white/10 bg-dark-900/40 hover:border-white/20"}`}>
                  <p className="text-[10px] uppercase tracking-wider text-slate-muted">{m.label}</p>
                  <p className={`text-xs font-extrabold ${m.trades === 0 ? "text-slate-600" : m.result > 0 ? "text-emerald" : m.result < 0 ? "text-rose" : "text-sky"}`}>
                    {m.trades === 0 ? "sem op." : `${m.result > 0 ? "+" : ""}${formatCurrency(m.result)}`}
                  </p>
                  {m.trades > 0 && <p className="text-[9px] text-slate-muted">{m.trades} ops · {m.days} dia{m.days > 1 ? "s" : ""}</p>}
                </button>
              ))}
            </div>
          )}

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
              const key = `${monthPrefix}-${String(day).padStart(2, "0")}`;
              const data = calendarMap.get(key);
              const active = inRange(key);
              const isToday = key === localTodayKey();
              return (
                <button
                  key={day}
                  onClick={() => data && active && setSelectedDay(data)}
                  disabled={!active}
                  className={`aspect-[4/3] md:aspect-square rounded-xl p-2 md:p-3 border flex flex-col justify-between transition text-left ${
                    !active ? "bg-dark-900/20 border-white/[0.02] text-slate-700 opacity-40 cursor-not-allowed" :
                    !data ? "bg-dark-900/40 border-white/[0.03] text-slate-600 cursor-default" :
                    data.result > 0 ? "bg-emerald/5 border-emerald/15 hover:border-emerald/30 text-emerald hover:scale-[1.03]" :
                    data.result < 0 ? "bg-rose/5 border-rose/15 hover:border-rose/30 text-rose hover:scale-[1.03]" :
                    "bg-sky/5 border-sky/15 hover:border-sky/30 text-sky hover:scale-[1.03]"
                  } ${isToday ? "ring-1 ring-emerald/40" : ""}`}
                >
                  <span className="text-[10px] md:text-xs font-bold opacity-60">{day}</span>
                  {data ? (
                    <div>
                      <p className="text-xs md:text-sm font-extrabold">{data.result > 0 ? "+" : ""}{formatCurrency(data.result)}</p>
                      <p className="text-[9px] md:text-[10px] opacity-70">{data.trades} ops</p>
                    </div>
                  ) : (
                    <span className="text-[9px] opacity-40">{active ? "Sem op." : ""}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Estatísticas: do período filtrado ou do mês exibido */}
          <div className="mt-6 pt-5 border-t border-white/5">
            <p className="text-[11px] text-slate-muted mb-3 font-medium">
              {range ? `Resumo dos últimos ${periodLabel} (${periodStats!.trades} operações)` : `Resumo de ${monthNames[month]} ${year}`}
            </p>
            <div className={`grid grid-cols-2 gap-3 md:gap-4 ${range ? "md:grid-cols-3 xl:grid-cols-6" : "md:grid-cols-3"}`}>
              <div className="glass-card p-4 rounded-xl">
                <h3 className="text-xs font-bold text-text-primary mb-1">Dias Operados</h3>
                <p className="text-2xl font-extrabold text-emerald">{stats.daysOperated}</p>
                <p className="text-[10px] text-slate-muted">De {stats.days} dias {range ? "no período" : "no mês"}</p>
              </div>
              <div className="glass-card p-4 rounded-xl">
                <h3 className="text-xs font-bold text-text-primary mb-1">Win Rate</h3>
                <p className={`text-2xl font-extrabold ${stats.winRate >= 50 ? "text-emerald" : "text-rose"}`}>{stats.winRate.toFixed(1)}%</p>
                <p className="text-[10px] text-slate-muted">{stats.wins}W / {stats.losses}L / {stats.breakEven}BE</p>
              </div>
              <div className="glass-card p-4 rounded-xl">
                <h3 className="text-xs font-bold text-text-primary mb-1">{range ? "Resultado do Período" : "Resultado Mensal"}</h3>
                <p className={`text-2xl font-extrabold ${stats.result >= 0 ? "text-emerald" : "text-rose"}`}>{stats.result >= 0 ? "+" : ""}{formatCurrency(stats.result)}</p>
                <p className="text-[10px] text-slate-muted">{formatR(stats.resultR)} acumulado</p>
              </div>
              {range && (
                <>
                  <div className="glass-card p-4 rounded-xl">
                    <h3 className="text-xs font-bold text-text-primary mb-1">Média por Dia Operado</h3>
                    <p className={`text-2xl font-extrabold ${stats.avgPerDay >= 0 ? "text-emerald" : "text-rose"}`}>{stats.avgPerDay >= 0 ? "+" : ""}{formatCurrency(stats.avgPerDay)}</p>
                    <p className="text-[10px] text-slate-muted">{stats.daysOperated ? (stats.trades / stats.daysOperated).toFixed(1) : "0"} ops por dia</p>
                  </div>
                  <button onClick={() => stats.best && setSelectedDay(stats.best)} className="glass-card p-4 rounded-xl text-left hover:border-emerald/30 transition disabled:cursor-default" disabled={!stats.best}>
                    <h3 className="text-xs font-bold text-text-primary mb-1">Melhor Dia</h3>
                    <p className="text-2xl font-extrabold text-emerald">{stats.best ? `${stats.best.result > 0 ? "+" : ""}${formatCurrency(stats.best.result)}` : "—"}</p>
                    <p className="text-[10px] text-slate-muted">{stats.best ? `${fmtShort(stats.best.date)} · ${stats.best.trades} ops` : "sem operações"}</p>
                  </button>
                  <button onClick={() => stats.worst && setSelectedDay(stats.worst)} className="glass-card p-4 rounded-xl text-left hover:border-rose/30 transition disabled:cursor-default" disabled={!stats.worst}>
                    <h3 className="text-xs font-bold text-text-primary mb-1">Pior Dia</h3>
                    <p className="text-2xl font-extrabold text-rose">{stats.worst ? `${stats.worst.result > 0 ? "+" : ""}${formatCurrency(stats.worst.result)}` : "—"}</p>
                    <p className="text-[10px] text-slate-muted">{stats.worst ? `${fmtShort(stats.worst.date)} · ${stats.worst.trades} ops` : "sem operações"}</p>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Lista de dias operados no período (o grid mostra só um mês; aqui aparecem todos) */}
          {range && (
            <div className="mt-5 pt-5 border-t border-white/5">
              <p className="text-[11px] text-slate-muted mb-2 font-medium">Dias com operação nos últimos {periodLabel} ({periodDays.length})</p>
              {periodDays.length === 0 ? (
                <p className="text-xs text-slate-600">Nenhuma operação registrada neste período nesta carteira.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {periodDays.map((d) => (
                    <button key={d.date} onClick={() => setSelectedDay(d)}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-bold tabular-nums transition hover:scale-[1.03] ${d.result > 0 ? "border-emerald/20 bg-emerald/5 text-emerald" : d.result < 0 ? "border-rose/20 bg-rose/5 text-rose" : "border-sky/20 bg-sky/5 text-sky"}`}
                      title={`${d.trades} ops · ${d.wins}W/${d.losses}L/${d.breakEven}BE`}>
                      {fmtShort(d.date)} <span className="opacity-80">{d.result > 0 ? "+" : ""}{formatCurrency(d.result)}</span> <span className="opacity-50 font-normal">· {d.trades}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedDay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedDay(null)}>
          <div className="glass-card-strong p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-text-primary">{new Date(selectedDay.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</h3>
              <button onClick={() => setSelectedDay(null)} className="text-slate-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="glass-card p-3 rounded-xl text-center">
                <p className="text-[10px] text-slate-muted uppercase">Operações</p>
                <p className="text-xl font-extrabold text-text-primary">{selectedDay.trades}</p>
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
              <div className="glass-card p-3 rounded-xl text-center">
                <p className="text-[10px] text-slate-muted uppercase">Exec. Score</p>
                <p className="text-sm font-bold text-text-primary">{selectedDay.avgExecutionScore ?? "—"}</p>
              </div>
              <div className="glass-card p-3 rounded-xl text-center">
                <p className="text-[10px] text-slate-muted uppercase">Plano</p>
                <p className="text-sm font-bold text-accent">{selectedDay.planAdherence != null ? `${selectedDay.planAdherence}%` : "—"}</p>
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
