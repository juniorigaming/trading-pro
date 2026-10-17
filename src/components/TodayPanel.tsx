"use client";
/**
 * Bloco "Hoje" do Command Center: meta diária, limite de perda, operações do dia,
 * posições abertas e próximo evento de alto impacto (carteira Forex).
 * Não repete Saldo/Equity/P&L — esses já estão nos cards acima.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Target, Flame, Hash, Layers, CalendarClock, OctagonX, AlertTriangle } from "lucide-react";
import type { Trade, Config } from "@/lib/types";
import type { AccountState } from "@/lib/account";
import type { PortfolioId } from "@/lib/portfolio";
import { computeDayGuard } from "@/lib/day-guard";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface PendingEvent { id: number; currency: string; event: string; scheduled_at: string; impact: string; minutes_until: number }

interface Props {
  trades: Trade[];
  account: AccountState;
  config: Config | null;
  portfolio: PortfolioId;
}

export default function TodayPanel({ trades, account, config, portfolio }: Props) {
  const guard = computeDayGuard(account, config);
  const open = trades.filter((t) => t.status === "OPEN");
  const [nextEvent, setNextEvent] = useState<PendingEvent | null>(null);

  useEffect(() => {
    if (portfolio !== "FOREX") return;
    let alive = true;
    fetch("/api/macro/event-risk?hours=12", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pending?: PendingEvent[] } | null) => {
        if (!alive || !d?.pending) return;
        const high = d.pending
          .filter((e) => String(e.impact).toUpperCase() === "HIGH" && e.minutes_until >= 0)
          .sort((a, b) => a.minutes_until - b.minutes_until);
        setNextEvent(high[0] ?? null);
      })
      .catch(() => { if (alive) setNextEvent(null); });
    return () => { alive = false; };
  }, [portfolio]);

  const visibleEvent = portfolio === "FOREX" ? nextEvent : null;
  const cell = "glass-card p-3 rounded-xl";
  const label = "text-[10px] uppercase tracking-wider text-text-muted font-semibold flex items-center gap-1";
  const value = "text-sm font-extrabold text-text-primary mt-0.5";

  return (
    <div className="mb-4">
      {guard.blocked && (
        <div className="flex items-start gap-3 p-3 mb-3 rounded-xl border border-rose/40 bg-rose/10">
          <OctagonX size={18} className="text-rose shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-extrabold text-rose">PARE POR HOJE</p>
            <ul className="text-[11px] text-text-secondary mt-0.5 list-disc pl-4">
              {guard.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        </div>
      )}
      {!guard.blocked && guard.warnings.length > 0 && (
        <div className="flex items-center gap-2 p-2.5 mb-3 rounded-xl border border-amber/30 bg-amber/5 text-[11px] font-semibold text-amber">
          <AlertTriangle size={14} /> {guard.warnings.join(" · ")}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Meta diária */}
        <div className={`${cell} border-l-2 ${guard.goalReached ? "border-emerald" : "border-border"}`}>
          <p className={label}><Target size={11} /> Meta do dia</p>
          {guard.dailyGoal > 0 ? (
            <>
              <div className="flex items-center justify-between mt-0.5">
                <p className={`${value} ${account.pnlDaily >= 0 ? "text-emerald" : "text-rose"}`}>{account.pnlDaily >= 0 ? "+" : ""}{formatCurrency(account.pnlDaily)}</p>
                <span className="text-[10px] text-text-muted">de {formatCurrency(guard.dailyGoal)}</span>
              </div>
              <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden mt-1.5">
                <div className="h-full rounded-full bg-emerald" style={{ width: `${guard.goalProgressPct}%` }} />
              </div>
            </>
          ) : (
            <Link href="/configuracoes#carteira" className="text-[11px] text-sky hover:underline block mt-1">Definir meta</Link>
          )}
        </div>

        {/* Limite de perda */}
        <div className={`${cell} border-l-2 ${guard.lossLimitHit ? "border-rose" : guard.lossUsedPct >= 80 ? "border-amber" : "border-border"}`}>
          <p className={label}><Flame size={11} /> Limite de perda</p>
          {guard.dailyLossLimit > 0 ? (
            <>
              <div className="flex items-center justify-between mt-0.5">
                <p className={`${value} ${guard.lossUsedPct >= 80 ? "text-rose" : ""}`}>{formatNumber(guard.lossUsedPct, 0)}%</p>
                <span className="text-[10px] text-text-muted">de {formatCurrency(guard.dailyLossLimit)}</span>
              </div>
              <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden mt-1.5">
                <div className={`h-full rounded-full ${guard.lossUsedPct >= 80 ? "bg-rose" : "bg-amber"}`} style={{ width: `${guard.lossUsedPct}%` }} />
              </div>
            </>
          ) : (
            <Link href="/configuracoes#carteira" className="text-[11px] text-sky hover:underline block mt-1">Definir limite</Link>
          )}
        </div>

        {/* Operações hoje */}
        <div className={`${cell} border-l-2 ${guard.maxTradesHit ? "border-rose" : "border-border"}`}>
          <p className={label}><Hash size={11} /> Operações hoje</p>
          <p className={value}>{guard.tradesToday}{guard.maxTradesPerDay > 0 ? <span className="text-text-muted font-semibold"> / {guard.maxTradesPerDay}</span> : null}</p>
          <p className="text-[10px] text-text-muted">{guard.maxTradesPerDay > 0 ? `${Math.max(0, guard.maxTradesPerDay - guard.tradesToday)} restantes` : "sem limite"}</p>
        </div>

        {/* Posições abertas */}
        <div className={`${cell} border-l-2 ${open.length > 0 ? "border-sky" : "border-border"}`}>
          <p className={label}><Layers size={11} /> Posições abertas</p>
          <p className={value}>{open.length}</p>
          <p className="text-[10px] text-text-muted truncate" title={open.map((t) => t.asset).join(", ")}>
            {open.length > 0 ? open.slice(0, 3).map((t) => `${t.asset} ${t.direction === "BUY" ? "▲" : "▼"}`).join(" · ") : "nenhuma"}
          </p>
        </div>

        {/* Próximo evento */}
        <div className={`${cell} border-l-2 ${visibleEvent && visibleEvent.minutes_until <= 60 ? "border-rose" : "border-border"} col-span-2 md:col-span-1`}>
          <p className={label}><CalendarClock size={11} /> Próximo evento alto impacto</p>
          {portfolio !== "FOREX" ? (
            <p className="text-[11px] text-text-muted mt-1">só na carteira Forex</p>
          ) : visibleEvent ? (
            <>
              <p className={`${value} truncate`} title={visibleEvent.event}>{visibleEvent.currency} · {visibleEvent.event}</p>
              <p className={`text-[10px] ${visibleEvent.minutes_until <= 60 ? "text-rose font-bold" : "text-text-muted"}`}>em {fmtMinutes(visibleEvent.minutes_until)}</p>
            </>
          ) : (
            <p className="text-[11px] text-text-muted mt-1">nada nas próximas 12h</p>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtMinutes(m: number) {
  if (m < 60) return `${Math.max(0, Math.round(m))} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r > 0 ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}
