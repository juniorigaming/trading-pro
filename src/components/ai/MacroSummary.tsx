"use client";
import { TrendingUp, TrendingDown, ShieldAlert, Ban, Info } from "lucide-react";
import type { MacroAnalysisResult, MacroSummaryView, TradeCandidateView } from "@/lib/ai/types";
import { Badge, riskColor } from "./ui";

/** Força na escala de apresentação (−5..+5). */
export const fmt5 = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}`);

export function confColor(pct: number) {
  return pct >= 65 ? "text-emerald" : pct >= 40 ? "text-amber" : "text-text-muted";
}

function PairRow({ c, calendarProvided }: { c: TradeCandidateView; calendarProvided: boolean }) {
  const rel = c.relative_strength ?? 0;
  const pct = c.confidence_pct ?? 0;
  const riskAssessed = c.event_risk_assessed ?? calendarProvided;
  return (
    <li className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold text-text-primary">{c.symbol}</span>
        <Badge className={rel > 0 ? "bg-emerald/15 text-emerald border-emerald/40" : "bg-rose/15 text-rose border-rose/40"}>
          {c.strength_class ?? c.bias}
        </Badge>
        <span className="text-xs font-bold tabular-nums text-text-primary" title="Δ assinado = score exibido da base − cotada; cada score é −5..+5, logo Δ pode ser −10..+10">Δ {fmt5(rel)}</span>
        <span className={`text-[11px] font-semibold tabular-nums ${confColor(pct)}`}>conf. {pct}%</span>
        <Badge className={`${riskColor(riskAssessed ? c.event_risk : "NOT_ASSESSED")} ml-auto`}>{riskAssessed ? `risco ${c.event_risk}` : "risco não avaliado"}</Badge>
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

/** Resumo calculado no backend. compact omite scores e listas já mostrados nas abas próprias. */
export default function MacroSummary({ result, compact = false }: { result: MacroAnalysisResult; compact?: boolean }) {
  const s: MacroSummaryView | undefined = result.summary;
  if (!s) return null;
  const calendarProvided = result.calendar_status === "PROVIDED" || (result.calendar_status == null && result.pending_events.length > 0);
  const avoidedSymbols = new Set(result.pairs_to_avoid.map((pair) => pair.symbol));
  const topLong = s.top_long.filter((candidate) => candidate.eligible !== false && !avoidedSymbols.has(candidate.symbol));
  const topShort = s.top_short.filter((candidate) => candidate.eligible !== false && !avoidedSymbols.has(candidate.symbol));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-xl border border-sky/30 bg-sky/10 px-3 py-2 text-xs text-sky sm:flex-row sm:items-center sm:justify-between">
        <span><b>Score macro por eventos econômicos.</b> Scores de moeda −5..+5; Δ do par (base−cotada) −10..+10. Força de preço D1/W1 é uma dimensão separada.</span>
      </div>
      <div className={`glass-card p-4 grid gap-4 sm:grid-cols-2 ${compact ? "" : "lg:grid-cols-4"}`}>
        {!compact && (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Maior score macro — eventos</p>
              {s.strongest ? <>
                <p className="text-xl font-extrabold text-emerald">{s.strongest.currency} <span className="text-sm tabular-nums">{fmt5(s.strongest.score)}</span></p>
                <p className={`text-[11px] font-semibold ${confColor(s.strongest.confidence_pct)}`}>confiança {s.strongest.confidence_pct}%</p>
                {s.strongest.score <= 0 && <p className="text-[10px] text-text-muted mt-0.5">Melhor do ranking, mas sem força positiva.</p>}
              </> : <p className="text-sm text-text-muted">sem dado</p>}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Menor score macro — eventos</p>
              {s.weakest ? <>
                <p className="text-xl font-extrabold text-rose">{s.weakest.currency} <span className="text-sm tabular-nums">{fmt5(s.weakest.score)}</span></p>
                <p className={`text-[11px] font-semibold ${confColor(s.weakest.confidence_pct)}`}>confiança {s.weakest.confidence_pct}%</p>
              </> : <p className="text-sm text-text-muted">sem dado</p>}
            </div>
          </>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Risco geral</p>
          <p className="mt-1"><span title={calendarProvided ? "Risco nos eventos informados" : "Calendário não informado; risco de eventos não avaliado"} className={`px-2 py-1 rounded-md text-xs font-extrabold border ${riskColor(calendarProvided ? s.overall_risk : "NOT_ASSESSED")}`}>{calendarProvided ? s.overall_risk : "NÃO AVALIADO"}</span></p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Qualidade da amostra</p>
          <p className="text-[11px] text-text-secondary mt-1 leading-snug">
            {s.no_data_currencies.length > 0 && <>Sem evidência suficiente: <b className="text-text-primary">{s.no_data_currencies.join(", ")}</b> (sem score).<br /></>}
            {s.conflicted_currencies.length > 0 && <>Viés misto: <b className="text-amber">{s.conflicted_currencies.join(", ")}</b>.</>}
            {s.no_data_currencies.length === 0 && s.conflicted_currencies.length === 0 && <span className="text-emerald">Evidência consistente nas moedas avaliadas.</span>}
          </p>
        </div>
      </div>

      {!compact && <>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-card p-4">
            <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5 mb-2"><TrendingUp size={15} className="text-emerald" />Top 3 LONG</h3>
            {topLong.length === 0 ? <p className="text-xs text-text-muted">Nenhum par LONG com evidência suficiente.</p> : <ul className="space-y-1.5">{topLong.map((c) => <PairRow key={c.symbol} c={c} calendarProvided={calendarProvided} />)}</ul>}
          </div>
          <div className="glass-card p-4">
            <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5 mb-2"><TrendingDown size={15} className="text-rose" />Top 3 SHORT</h3>
            {topShort.length === 0 ? <p className="text-xs text-text-muted">Nenhum par SHORT com evidência suficiente.</p> : <ul className="space-y-1.5">{topShort.map((c) => <PairRow key={c.symbol} c={c} calendarProvided={calendarProvided} />)}</ul>}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-card p-4">
            <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5 mb-2"><Ban size={15} className="text-text-muted" />Pares a evitar</h3>
            {result.pairs_to_avoid.length === 0 ? <p className="text-xs text-text-muted">Nenhum par sinalizado para evitar agora.</p> : <ul className="space-y-1.5">{result.pairs_to_avoid.map((p) => <li key={p.symbol} className="text-xs text-text-secondary"><b className="text-text-primary">{p.symbol}</b> — {p.reason}</li>)}</ul>}
          </div>
          <div className="glass-card p-4">
            <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5 mb-2"><ShieldAlert size={15} className="text-amber" />Alertas macro</h3>
            {s.alerts.length === 0 ? <p className="text-xs text-text-muted">Sem alertas macro nas moedas analisadas.</p> : <ul className="space-y-1 list-disc pl-4">{s.alerts.map((a, i) => <li key={i} className="text-xs text-text-secondary">{a}</li>)}</ul>}
          </div>
        </div>
      </>}

      <div className="flex items-start gap-2 rounded-xl border border-sky/30 bg-sky/10 px-3 py-2 text-xs text-sky">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>
          <b>Viés macro não representa entrada operacional.</b> O score mede direção e qualidade da evidência por eventos; não é força de preço nem probabilidade de lucro.
          {!compact && topLong.length + topShort.length > 0 && <> Priorize a observação técnica (SMC/ICT) em: <b>{[...topLong, ...topShort].map((c) => c.symbol).join(", ")}</b>.</>}
        </p>
      </div>
    </div>
  );
}
