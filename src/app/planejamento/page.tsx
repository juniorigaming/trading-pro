"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Plus, NotebookPen, PlayCircle, Eye, Check, X, Clock } from "lucide-react";
import { useTrades } from "@/hooks/useTradeData";
import { setupScore } from "@/lib/scores";
import { formatCurrency, formatR } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  WATCHLIST: { label: "Watchlist", cls: "bg-sky/10 text-sky border-sky/20" },
  PLANNED: { label: "Planejado", cls: "bg-amber/10 text-amber border-amber/20" },
  WAITING_TRIGGER: { label: "Aguardando trigger", cls: "bg-violet/10 text-violet border-violet/20" },
  READY: { label: "Pronto", cls: "bg-emerald/10 text-emerald border-emerald/20" },
  OPEN: { label: "Aberto", cls: "bg-emerald/10 text-emerald border-emerald/20" },
  CLOSED: { label: "Fechado", cls: "bg-surface-3 text-text-muted border-border" },
  CANCELLED: { label: "Cancelado", cls: "bg-surface-3 text-text-muted border-border" },
};

export default function PlanejamentoPage() {
  const { trades, loading } = useTrades();
  const plans = useMemo(
    () => trades.filter((t) => t.status && t.status !== "CLOSED" && t.status !== "CANCELLED").sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [trades]
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Planejamento</h1>
          <p className="text-sm text-text-muted mt-1">Planeje trades antes da entrada. O resultado financeiro é separado do planejamento.</p>
        </div>
        <Link href="/planejamento/novo" className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-bold rounded-xl shadow-lg shadow-accent/20 transition active:scale-[0.98]">
          <Plus size={18} /> Planejar Trade
        </Link>
      </header>

      {loading ? (
        <div className="glass-card-strong p-12 text-center text-text-muted text-sm">Carregando...</div>
      ) : plans.length === 0 ? (
        <div className="glass-card-strong p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-accent-soft mx-auto mb-4 flex items-center justify-center"><NotebookPen size={22} className="text-accent" /></div>
          <p className="text-sm text-text-muted mb-3">Você ainda não tem trades planejados.</p>
          <Link href="/planejamento/novo" className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-white text-sm font-bold rounded-xl transition active:scale-[0.98]"><Plus size={16} /> Planejar primeiro trade</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const score = setupScore(plan);
            const meta = STATUS_META[plan.status || "PLANNED"] || STATUS_META.PLANNED;
            return (
              <div key={plan.id} className="glass-card-strong p-5 rounded-xl hover:border-accent/30 transition">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-text-primary">{plan.asset} <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${plan.direction === "BUY" ? "text-emerald bg-emerald/10" : "text-rose bg-rose/10"}`}>{plan.direction}</span></p>
                    <p className="text-[10px] text-text-muted">{new Date(plan.date).toLocaleDateString("pt-BR")} · {plan.session}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${meta.cls}`}>{meta.label}</span>
                </div>

                <div className="space-y-1.5 text-[11px] text-text-muted mb-3">
                  <Row label="Playbook" value={plan.playbook || "—"} />
                  <Row label="POI" value={plan.poi || "—"} />
                  <Row label="Draw on Liquidity" value={plan.drawOnLiquidity || "—"} />
                  {plan.timeStop && <Row label="Time Stop" value={plan.timeStop} />}
                </div>

                {/* Setup readiness */}
                <div className="glass-card p-3 rounded-xl mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Setup Readiness</p>
                    <span className={`text-xs font-extrabold ${score && score.score >= 70 ? "text-emerald" : score && score.score >= 60 ? "text-amber" : "text-rose"}`}>{score ? `${score.score}/100` : "—"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {score ? score.breakdown.slice(0, 8).map((b) => (
                      <span key={b.label} className={`inline-flex items-center gap-1 text-[10px] ${b.ok ? "text-emerald" : "text-text-muted"}`}>
                        {b.ok ? <Check size={11} /> : <X size={11} />} {b.label}
                      </span>
                    )) : <span className="text-[10px] text-text-muted">Sem score</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Link href={`/planejamento/${plan.id}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline"><Eye size={12} /> Detalhes</Link>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-muted"><Clock size={11} /> {plan.expectedSession || plan.session}</span>
                    {plan.status === "READY" && <span className="text-[10px] text-emerald font-bold inline-flex items-center gap-1"><PlayCircle size={11} /> pronto p/ executar</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-2"><span>{label}</span><span className="text-text-secondary font-medium text-right">{value}</span></p>
  );
}
