"use client";
import { TrendingUp, TrendingDown, ShieldAlert, Ban, Info } from "lucide-react";
import type { MacroAnalysisResult, MacroSummaryView, TradeCandidateView } from "@/lib/ai/types";
import { Badge, riskColor } from "./ui";

/** Força na escala de apresentação (−5..+5). */
export const fmt5 = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}`);

export function confColor(pct: number) {
  return pct >= 65 ? "text-emerald" : pct >= 40 ? "text-amber" : "text-text-muted";
}

function PairRow({ c }: { c: TradeCandidateView }) {
  const rel = c.relative_strength ?? 0;
  const pct = c.confidence_pct ?? 0;
  return (
    <li className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold text-text-primary">{c.symbol}</span>
        <Badge className={rel > 0 ? "bg-emerald/15 text-emerald border-emerald/40" : "bg-rose/15 text-rose border-rose/40"}>
          {c.strength_class ?? c.bias}
        </Badge>
        <span className="text-xs font-bold tabular-nums text-text-primary">{fmt5(rel)}</span>
        <span className={`text-[11px] font-semibold tabular-nums ${confColor(pct)}`}>conf. {pct}%</span>
        <Badge className={`${riskColor(c.event_risk)} ml-auto`}>risco {c.event_risk}</Badge>
      </div>
      <p className="mt-1 text-[11px] text-text-muted tabular-nums">
        {c.base_currency} {fmt5(c.base_score)} · {c.quote_currency} {fmt5(c.quote_score)}
      </p>
      {c.invalidation_events && c.invalidation_events.length > 0 && (
        <p className="mt-1 text-[10px] text-amber">⚠ pode invalidar: {c.invalidation_events.slice(0, 2).join(" · ")}</p>
      )}
    </li>
  );
}

/**
 * Resumo macro do dashboard. Lê exclusivamente `result.summary` calculado no backend —
 * a UI não recalcula ranking, força relativa nem confiança (fonte única, sem duplicação).
 */
export default function MacroSummary({ result }: { result: MacroAnalysisResult }) {
  const s: MacroSummaryView | undefined = result.summary;
  if (!s) return null;

  return (
    <div className="space-y-4">
      {/* 1. Resumo macro */}
      <div className="glass-card p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Moeda mais forte</p>
          {s.strongest ? (
            <>
              <p className="text-xl font-extrabold text-emerald">{s.strongest.currency} <span className="text-sm tabular-nums">{fmt5(s.strongest.score)}</span></p>
              <p className={`text-[11px] font-semibold ${confColor(s.strongest.confidence_pct)}`}>confiança {s.strongest.confidence_pct}%</p>
              {s.strongest.score <= 0 && <p className="text-[10px] text-text-muted mt-0.5">Nenhuma moeda com força positiva — é a melhor do ranking, não uma moeda forte.</p>}
            </>
          ) : <p className="text-sm text-text-muted">sem dado</p>}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Moeda mais fraca</p>
          {s.weakest ? (
            <>
              <p className="text-xl font-extrabold text-rose">{s.weakest.currency} <span className="text-sm tabular-nums">{fmt5(s.weakest.score)}</span></p>
              <p className={`text-[11px] font-semibold ${confColor(s.weakest.confidence_pct)}`}>confiança {s.weakest.confidence_pct}%</p>
            </>
          ) : <p className="text-sm text-text-muted">sem dado</p>}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Risco geral</p>
          <p className="mt-1"><span className={`px-2 py-1 rounded-md text-xs font-extrabold border ${riskColor(s.overall_risk)}`}>{s.overall_risk}</span></p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Qualidade da amostra</p>
          <p className="text-[11px] text-text-secondary mt-1 leading-snug">
            {s.no_data_currencies.length > 0 && <>Sem dado: <b className="text-text-primary">{s.no_data_currencies.join(", ")}</b> (neutras por ausência de evidência).<br /></>}
            {s.conflicted_currencies.length > 0 && <>Viés misto: <b className="text-amber">{s.conflicted_currencies.join(", ")}</b>.</>}
            {s.no_data_currencies.length === 0 && s.conflicted_currencies.length === 0 && <span className="text-emerald">Evidência consistente nas 8 moedas.</span>}
          </p>
        </div>
      </div>

      {/* 2. Top 3 LONG / SHORT */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card p-4">
          <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5 mb-2"><TrendingUp size={15} className="text-emerald" />Top 3 LONG</h3>
          {s.top_long.length === 0 ? (
            <p className="text-xs text-text-muted">Nenhum par LONG com evidência suficiente. Pares com assimetria mas confiança baixa aparecem em <b>Pares a evitar</b> — e não são recomendados.</p>
          ) : <ul className="space-y-1.5">{s.top_long.map((c) => <PairRow key={c.symbol} c={c} />)}</ul>}
        </div>
        <div className="glass-card p-4">
          <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5 mb-2"><TrendingDown size={15} className="text-rose" />Top 3 SHORT</h3>
          {s.top_short.length === 0 ? (
            <p className="text-xs text-text-muted">Nenhum par SHORT com evidência suficiente. Pares com assimetria mas confiança baixa aparecem em <b>Pares a evitar</b> — e não são recomendados.</p>
          ) : <ul className="space-y-1.5">{s.top_short.map((c) => <PairRow key={c.symbol} c={c} />)}</ul>}
        </div>
      </div>

      {/* 3. Pares a evitar + alertas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card p-4">
          <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5 mb-2"><Ban size={15} className="text-text-muted" />Pares a evitar</h3>
          {result.pairs_to_avoid.length === 0 ? (
            <p className="text-xs text-text-muted">Nenhum par sinalizado para evitar agora.</p>
          ) : (
            <ul className="space-y-1.5">
              {result.pairs_to_avoid.map((p) => (
                <li key={p.symbol} className="text-xs text-text-secondary">
                  <b className="text-text-primary">{p.symbol}</b> — {p.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="glass-card p-4">
          <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5 mb-2"><ShieldAlert size={15} className="text-amber" />Alertas macro</h3>
          {s.alerts.length === 0 ? (
            <p className="text-xs text-text-muted">Sem evento de alto impacto iminente nas moedas analisadas.</p>
          ) : <ul className="space-y-1 list-disc pl-4">{s.alerts.map((a, i) => <li key={i} className="text-xs text-text-secondary">{a}</li>)}</ul>}
        </div>
      </div>

      {/* 4. Conclusão */}
      <div className="flex items-start gap-2 rounded-xl border border-sky/30 bg-sky/10 px-3 py-2 text-xs text-sky">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>
          <b>Viés macro não representa entrada operacional.</b> A força indica a qualidade da EVIDÊNCIA macro, não probabilidade de lucro.
          {s.top_long.length + s.top_short.length > 0 && <> Priorize a observação técnica (SMC/ICT) em: <b>{[...s.top_long, ...s.top_short].map((c) => c.symbol).join(", ")}</b>.</>}
        </p>
      </div>
    </div>
  );
}
