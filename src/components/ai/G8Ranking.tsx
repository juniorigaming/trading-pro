"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CurrencyScoreView, EvaluatedCurrency, ScoreDriver } from "@/lib/ai/types";
import { Badge, DeltaArrow, classColor, scoreBg } from "./ui";
import { confColor, fmt5 } from "./MacroSummary";

const MOMENTUM_LABEL: Record<string, string> = { STRENGTHENING: "fortalecendo", WEAKENING: "enfraquecendo", STABLE: "estável", NARRATIVE_SHIFT: "mudança de narrativa" };
/** Viés pelo score agregado (escala −5..+5): ≥ +1.50 forte positivo · +0.75 positivo · +0.25 levemente positivo · neutro · … · ≤ −1.50 forte negativo. */
export const CLASS_LABEL: Record<string, string> = { VERY_STRONG: "Forte positivo", STRONG: "Positivo", MODERATELY_STRONG: "Levemente positivo", NEUTRAL: "Neutro", MODERATELY_WEAK: "Levemente negativo", WEAK: "Negativo", VERY_WEAK: "Forte negativo" };
const CONSISTENCY_LABEL: Record<string, string> = { HIGH: "alta", MIXED: "mista", LOW: "baixa", NA: "não aplicável (1 evento)" };
const PREV_LABEL: Record<string, string> = { agrees: "previous confirma", disagrees: "previous contradiz" };
const DIR_LABEL: Record<string, string> = { BULLISH: "alta da moeda", BEARISH: "baixa da moeda", NEUTRAL: "neutro (medido)" };
const EVIDENCE_LABEL: Record<string, string> = { WEAK: "evidência fraca", MODERATE: "evidência moderada", STRONG: "evidência sólida" };
const EVIDENCE_TITLE: Record<string, string> = {
  WEAK: "Score sustentado por pouca evidência (ex.: um único dado de impacto baixo ou sem forecast). Entra no ranking, mas não gera candidato de par.",
  MODERATE: "Evidência intermediária: dado primário único ou alguns dados secundários.",
  STRONG: "Vários dados relevantes ou dado primário de alto impacto.",
};
/** Pílula de nível de evidência — só aparece quando é FRACA (as demais não precisam de ressalva). */
function EvidencePill({ level }: { level?: string }) {
  if (level !== "WEAK") return null;
  return <Badge className="border-amber/40 text-amber" title={EVIDENCE_TITLE[level]}>{EVIDENCE_LABEL[level]}</Badge>;
}

/** Score na escala do dashboard (−5..+5). null ⇒ sem evidência (NUNCA 0). */
export const display5 = (s: CurrencyScoreView): number | null => (s.score === null ? null : (s.score_display ?? Number((s.score * 2.5).toFixed(2))));

function DriverDetail({ d }: { d: ScoreDriver }) {
  const ref = d.reference_basis === "FORECAST" ? "forecast" : d.reference_basis === "PREVIOUS" ? "previous" : null;
  return (
    <li className="rounded-lg bg-surface px-2 py-1.5 space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-text-secondary font-semibold">{d.event}{d.primary && <span className="ml-1 text-[9px] uppercase text-accent font-bold">primário</span>}</span>
        <span className={`tabular-nums font-bold ${(d.contribution ?? 0) >= 0 ? "text-emerald" : "text-rose"}`}>
          {d.contribution != null ? `${d.contribution > 0 ? "+" : ""}${d.contribution.toFixed(3)}` : d.weight.toFixed(3)}
        </span>
      </div>
      <p className="text-[10px] text-text-muted tabular-nums">
        {d.actual ? `atual ${d.actual}` : "atual —"}{ref && <> · {ref} {d.reference_basis === "FORECAST" ? d.forecast : d.previous}</>}
        {d.surprise != null && <> · surpresa {d.surprise > 0 ? "+" : ""}{Math.abs(d.surprise) >= 1000 ? d.surprise.toExponential(2) : d.surprise.toFixed(2)}</>}
        {d.surprise_ratio != null && <> · {d.surprise_ratio.toFixed(1)}× o ruído</>}
        {d.event_score != null && <> · <b className="text-text-secondary">score do evento {d.event_score > 0 ? "+" : ""}{d.event_score.toFixed(2)}</b></>}
        {d.previous_check && <> · {PREV_LABEL[d.previous_check]}</>}
        {" · "}{d.direction ? DIR_LABEL[d.direction] : d.classification}
        {" · peso "}{d.weight.toFixed(2)}{" · "}{new Date(d.released_at).toLocaleDateString("pt-BR")}
      </p>
      {d.explanation && <p className="text-[10px] text-text-muted leading-snug">{d.explanation}</p>}
    </li>
  );
}

/** compact = sem expandir drivers (widgets). clean = só rank, moeda, barra, score e seta (página de análise). */
export default function G8Ranking({ scores, compact = false, clean = false }: { scores: CurrencyScoreView[]; compact?: boolean; clean?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const evaluated = scores.filter((s): s is EvaluatedCurrency => s.status === "EVALUATED" && s.score !== null).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const insufficient = scores.filter((s) => s.status !== "EVALUATED").sort((a, b) => a.currency.localeCompare(b.currency));
  return (
    <div className="space-y-1.5">
      {evaluated.map((s) => {
        const v = display5(s) ?? 0;
        const pct = s.confidence_pct ?? null;
        return (
          <div key={s.currency} className="rounded-xl border border-border bg-surface-2/60">
            <button onClick={() => !compact && setOpen(open === s.currency ? null : s.currency)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
              <span className="w-6 text-xs font-extrabold text-text-muted">#{s.rank}</span>
              <span className="w-10 text-sm font-extrabold text-text-primary">{s.currency}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-3 relative overflow-hidden">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                <div className={`absolute top-0 bottom-0 ${v >= 0 ? "bg-emerald" : "bg-rose"}`} style={{ left: v >= 0 ? "50%" : `${50 + (v / 5) * 50}%`, width: `${(Math.abs(v) / 5) * 50}%` }} />
              </div>
              <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold tabular-nums ${scoreBg(s.score)}`}>{fmt5(v)}</span>
              <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-text-muted w-14">
                {s.score_delta != null && Math.abs(s.score_delta) >= 0.01 && <><DeltaArrow delta={s.score_delta} />{fmt5(s.score_delta * 2.5)}</>}
              </span>
              {!compact && !clean && <>
                <span className={`hidden md:inline text-[11px] font-bold w-24 ${classColor(s.classification ?? "NEUTRAL")}`}>{s.classification ? (CLASS_LABEL[s.classification] ?? s.classification) : "—"}</span>
                <span className="hidden lg:inline text-[10px] text-text-muted w-32 truncate">{s.momentum ? MOMENTUM_LABEL[s.momentum] : "—"}</span>
                <Badge className={pct == null ? "border-border text-text-muted" : pct >= 65 ? "border-emerald/40 text-emerald" : pct >= 40 ? "border-amber/40 text-amber" : "border-border text-text-muted"}>
                  {pct == null ? s.confidence : `${pct}%`}
                </Badge>
                <span className="hidden sm:inline"><EvidencePill level={s.evidence_level} /></span>
                {open === s.currency ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
              </>}
              {clean && <>
                <EvidencePill level={s.evidence_level} />
                {pct != null && <span className={`text-[11px] font-semibold tabular-nums ${confColor(pct)}`}>{pct}%</span>}
                {open === s.currency ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
              </>}
            </button>
            {open === s.currency && (
              <div className="px-3 pb-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1 mb-2 text-[11px]">
                  <div><p className="text-[9px] uppercase tracking-wider text-text-muted">Score</p><p className={`font-extrabold tabular-nums ${v > 0 ? "text-emerald" : v < 0 ? "text-rose" : "text-text-secondary"}`}>{fmt5(v)}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-text-muted">Viés</p><p className={`font-bold ${classColor(s.classification ?? "NEUTRAL")}`}>{s.classification ? CLASS_LABEL[s.classification] : "—"}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-text-muted">Confiança da evidência</p><p className={`font-bold tabular-nums ${pct != null ? confColor(pct) : ""}`}>{pct ?? "—"}%</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-text-muted">Evidências</p><p className="font-bold tabular-nums text-text-secondary">{s.live_events} ({s.evidence_level ? EVIDENCE_LABEL[s.evidence_level].replace("evidência ", "") : "—"})</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-text-muted">Consistência</p><p className={`font-bold ${s.conflict ? "text-amber" : "text-text-secondary"}`}>{CONSISTENCY_LABEL[s.consistency ?? (s.live_events <= 1 ? "NA" : s.conflict ? "LOW" : "HIGH")]}{s.conflict && " · indicadores contraditórios"}</p></div>
                </div>
                {s.confidence_breakdown && (
                  <p className="text-[10px] text-text-muted mb-1 tabular-nums">
                    Confiança = 30% qualidade/impacto ({Math.round(s.confidence_breakdown.quality * 100)}) + 25% magnitude ({Math.round(s.confidence_breakdown.magnitude * 100)}) + 20% consistência ({Math.round(s.confidence_breakdown.consistency * 100)}) + 15% quantidade ({Math.round(s.confidence_breakdown.quantity * 100)}) + 10% certeza do dado ({Math.round(s.confidence_breakdown.certainty * 100)}) = {s.confidence_breakdown.raw_pct}%
                    {s.confidence_breakdown.raw_pct > s.confidence_breakdown.cap_pct && <> → teto de {s.confidence_breakdown.cap_pct}% com {s.live_events} evidência{s.live_events > 1 ? "s" : ""}</>}
                    {s.confidence_breakdown.conflict_penalty && <> → ×0.8 por conflito</>}
                  </p>
                )}
                <p className="text-[10px] text-text-muted mb-2">Score = média ponderada dos scores dos eventos (direção × magnitude da surpresa normalizada × impacto × relevância). Confiança = robustez da evidência — <b>não</b> é probabilidade de o preço subir nem de lucro.</p>
                <p className="text-[10px] font-semibold text-text-muted mb-1">Motivos:</p>
                <ul className="space-y-1">{s.drivers.map((d) => <DriverDetail key={d.event_id} d={d} />)}</ul>
                {s.excluded_events && s.excluded_events.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold text-text-muted mb-1">Eventos desta análise que NÃO pontuaram:</p>
                    <ul className="space-y-0.5">{s.excluded_events.map((e) => <li key={e.event_id} className="text-[10px] text-text-muted">{e.event} — {e.reason}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {insufficient.length > 0 && (
        <div className="rounded-xl border border-dashed border-border px-3 py-2">
          <p className="text-[11px] font-bold text-text-muted mb-1">Sem dado divulgado nesta análise — sem score e sem posição no ranking</p>
          <div className="flex flex-wrap gap-1.5">
            {insufficient.map((s) => (
              <span key={s.currency} className="text-[11px] font-semibold text-text-muted border border-border rounded-md px-2 py-0.5" title={s.excluded_events?.[0]?.reason ?? "Nenhuma divulgação com direção mensurável nesta análise."}>
                {s.currency} · sem dado
              </span>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-1">Ausência de dado não é fraqueza: estas moedas não foram medidas nesta análise.</p>
        </div>
      )}
      {evaluated.length === 0 && insufficient.length === 0 && <p className="text-xs text-text-muted">Nenhum score calculado ainda. Rode uma Análise Macro.</p>}
    </div>
  );
}
