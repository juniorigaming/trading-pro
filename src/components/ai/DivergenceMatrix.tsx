"use client";
import type { CurrencyScoreView, TradeCandidateView } from "@/lib/ai/types";
import { G8 } from "@/lib/ai/types";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge, riskColor, scoreBg } from "./ui";

export function DivergenceMatrix({ scores }: { scores: CurrencyScoreView[] }) {
  // Cada score de moeda usa a escala de apresentação (−5..+5); a célula é a diferença entre duas moedas (−10..+10).
  // null = sem evidência nesta análise: aparece como "—", nunca como 0.00.
  const map = Object.fromEntries(scores.map((s) => [
    s.currency,
    s.score === null ? null : (s.score_display ?? Number((s.score * 2.5).toFixed(2))),
  ])) as Record<string, number | null>;
  const order = [...G8].sort((a, b) => {
    const x = map[a] ?? null, y = map[b] ?? null;
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  });
  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] tabular-nums">
        <thead><tr><th className="px-1.5 py-1 text-text-muted text-left">linha − coluna</th>{order.map((c) => <th key={c} className="px-1.5 py-1 text-text-muted">{c}</th>)}</tr></thead>
        <tbody>
          {order.map((r) => (
            <tr key={r}>
              <td className="px-1.5 py-1 font-extrabold text-text-primary">{r} <span className={`ml-1 px-1 rounded ${map[r] == null ? "text-text-muted" : scoreBg(map[r] as number)}`}>{map[r] == null ? "—" : (map[r] as number).toFixed(2)}</span></td>
              {order.map((c) => {
                if (r === c) return <td key={c} className="px-1.5 py-1 text-center text-text-muted">·</td>;
                if (map[r] == null || map[c] == null) return <td key={c} className="px-1.5 py-1 text-center text-text-muted">—</td>;
                const d = (map[r] as number) - (map[c] as number);
                const strong = Math.abs(d) >= 2.5, ok = Math.abs(d) >= 1.0;
                return <td key={c} className={`px-1.5 py-1 text-center rounded ${ok ? (d > 0 ? (strong ? "bg-emerald/25 text-emerald font-bold" : "bg-emerald/10 text-emerald") : (strong ? "bg-rose/25 text-rose font-bold" : "bg-rose/10 text-rose")) : "text-text-muted"}`}>{d > 0 ? "+" : ""}{d.toFixed(2)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-text-muted mt-2">Cada score de moeda usa −5..+5; as células mostram Δ = score da linha − score da coluna (intervalo possível −10..+10). Verde/vermelho a partir de |1.0|; destaque forte a partir de |2.5|. Positivo = viés a favor da moeda da linha contra a coluna.</p>
    </div>
  );
}

function candidateScoreDisplay(c: TradeCandidateView, currency: string): number {
  if (currency === c.base_currency && c.base_score != null) return c.base_score;
  if (currency === c.quote_currency && c.quote_score != null) return c.quote_score;
  const native = currency === c.strong_currency ? c.strong_score : c.weak_score;
  return Number((native * 2.5).toFixed(2));
}

function candidateDivergenceDisplay(c: TradeCandidateView): number {
  return Number(Math.abs(c.relative_strength ?? c.macro_divergence * 2.5).toFixed(2));
}

export function TradeCandidates({ candidates, onPick, onPlan }: { candidates: TradeCandidateView[]; onPick?: (c: TradeCandidateView) => void; onPlan?: (c: TradeCandidateView) => void }) {
  const eligible = candidates.filter((c) => c.eligible === true);
  if (!eligible.length) return <p className="text-xs text-text-muted">Nenhum par elegível com evidência suficiente no momento. Consulte “Pares a evitar” para os motivos.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {eligible.map((c) => (
        <div key={c.symbol} className="rounded-xl border border-border bg-surface-2/60 p-3 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-extrabold text-text-muted">P{c.priority}</span>
              <span className="text-sm font-extrabold text-text-primary">{c.symbol}</span>
              <Badge className={c.bias === "LONG" ? "bg-emerald/15 text-emerald border-emerald/40" : "bg-rose/15 text-rose border-rose/40"}>{c.bias}</Badge>
            </div>
            <Badge className={riskColor(c.event_risk_assessed === false ? "NOT_ASSESSED" : c.event_risk)}>{c.event_risk_assessed === false ? "risco não avaliado" : `risco ${c.event_risk}`}</Badge>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-emerald font-bold">{c.strong_currency} {candidateScoreDisplay(c, c.strong_currency) > 0 ? "+" : ""}{candidateScoreDisplay(c, c.strong_currency).toFixed(2)}</span>
            <span className="text-text-muted">vs</span>
            <span className="text-rose font-bold">{c.weak_currency} {candidateScoreDisplay(c, c.weak_currency) > 0 ? "+" : ""}{candidateScoreDisplay(c, c.weak_currency).toFixed(2)}</span>
            <span className="ml-auto font-extrabold text-text-primary tabular-nums" title="|Δ| = |score da base − cotada|; cada score é −5..+5, então |Δ| varia de 0 a 10">|Δ| {candidateDivergenceDisplay(c).toFixed(2)}</span>
            <Badge className={c.confidence === "HIGH" ? "border-emerald/40 text-emerald" : c.confidence === "MEDIUM" ? "border-amber/40 text-amber" : "border-border text-text-muted"}>{c.confidence}</Badge>
          </div>
          {c.event_risk_events.length > 0 && <p className="mt-1.5 text-[10px] text-amber">⚠ {c.event_risk_events.slice(0, 2).map((e) => `${e.currency} ${e.event} em ${e.minutes_until < 60 ? `${e.minutes_until}min` : `${(e.minutes_until / 60).toFixed(1)}h`}`).join(" · ")}</p>}
          <p className="mt-1.5 text-[11px] text-text-secondary leading-snug line-clamp-4">{c.reason}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {onPick && <button onClick={() => onPick(c)} className="text-[11px] font-bold text-accent hover:underline">Analisar no SMC/ICT →</button>}
            {onPlan && <button onClick={() => onPlan(c)} className="text-[11px] font-bold text-sky hover:underline">Criar plano pré-preenchido →</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

const riskDot = (l: string) => (l === "EXTREME" ? "bg-rose" : l === "HIGH" ? "bg-orange-400" : l === "MEDIUM" ? "bg-amber" : "bg-emerald");

/** Versão enxuta: uma linha por par; detalhes só ao expandir. */
export function CandidateList({ candidates, onPick, calendarProvided = false }: { candidates: TradeCandidateView[]; onPick?: (c: TradeCandidateView) => void; calendarProvided?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const eligible = candidates.filter((c) => c.eligible === true);
  if (!eligible.length) return <p className="text-xs text-text-muted">Nenhum par elegível com evidência suficiente — confira “Pares a evitar”.</p>;
  return (
    <div className="space-y-1.5">
      {eligible.map((c) => {
        const isOpen = open === c.symbol;
        const riskAssessed = c.event_risk_assessed ?? calendarProvided;
        return (
          <div key={c.symbol} className="rounded-xl border border-border bg-surface-2/60">
            <button onClick={() => setOpen(isOpen ? null : c.symbol)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
              <span className="w-6 text-xs font-extrabold text-text-muted">#{c.priority}</span>
              <span className="w-20 text-sm font-extrabold text-text-primary">{c.symbol}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${c.bias === "LONG" ? "bg-emerald/15 text-emerald" : "bg-rose/15 text-rose"}`}>{c.bias}</span>
              <span className="ml-auto text-xs tabular-nums text-text-secondary" title="|Δ| = diferença absoluta entre os scores da base e da cotada (0..10)">|Δ| <b className="text-text-primary">{candidateDivergenceDisplay(c).toFixed(2)}</b></span>
              <span className="inline-flex items-center gap-1 text-[10px] text-text-muted" title={riskAssessed ? `Risco de eventos: ${c.event_risk}` : "Calendário não informado; risco não avaliado"}><span className={`w-2 h-2 rounded-full ${riskAssessed ? riskDot(c.event_risk) : "bg-text-muted"}`} />{riskAssessed ? c.event_risk !== "LOW" && c.event_risk : "não avaliado"}</span>
              {isOpen ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
            </button>
            {isOpen && (
              <div className="px-3 pb-3 text-xs space-y-2">
                <p className="text-text-muted"><span className="text-emerald font-bold">{c.strong_currency} {candidateScoreDisplay(c, c.strong_currency) > 0 ? "+" : ""}{candidateScoreDisplay(c, c.strong_currency).toFixed(2)}</span> vs <span className="text-rose font-bold">{c.weak_currency} {candidateScoreDisplay(c, c.weak_currency) > 0 ? "+" : ""}{candidateScoreDisplay(c, c.weak_currency).toFixed(2)}</span> · scores −5..+5; Δ base−cotada −10..+10 (a lista mostra |Δ| 0..10) · confiança {c.confidence_pct ?? "—"}%</p>
                {c.event_risk_events.length > 0 && <p className="text-amber">⚠ {c.event_risk_events.slice(0, 2).map((e) => `${e.currency} ${e.event} em ${e.minutes_until < 60 ? `${e.minutes_until}min` : `${(e.minutes_until / 60).toFixed(1)}h`}`).join(" · ")}</p>}
                <p className="text-text-secondary leading-snug">{c.reason}</p>
                {onPick && <button onClick={() => onPick(c)} className="font-bold text-accent hover:underline">Analisar no SMC/ICT →</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
