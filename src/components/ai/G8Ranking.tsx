"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CurrencyScoreView } from "@/lib/ai/types";
import { Badge, DeltaArrow, classColor, scoreBg } from "./ui";
import { confColor, fmt5 } from "./MacroSummary";

const MOMENTUM_LABEL: Record<string, string> = { STRENGTHENING: "fortalecendo", WEAKENING: "enfraquecendo", STABLE: "estável", NARRATIVE_SHIFT: "mudança de narrativa" };
const CLASS_LABEL: Record<string, string> = { VERY_STRONG: "Muito forte", STRONG: "Forte", MODERATELY_STRONG: "Mod. forte", NEUTRAL: "Neutro", MODERATELY_WEAK: "Mod. fraca", WEAK: "Fraca", VERY_WEAK: "Muito fraca" };

/** Score na escala do dashboard (−5..+5). Vem pronto do backend; o fallback cobre snapshots antigos. */
export const display5 = (s: CurrencyScoreView) => s.score_display ?? Number((s.score * 2.5).toFixed(2));

/** compact = sem expandir drivers (widgets). clean = só rank, moeda, barra, score e seta (página de análise). */
export default function G8Ranking({ scores, compact = false, clean = false }: { scores: CurrencyScoreView[]; compact?: boolean; clean?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...scores].sort((a, b) => a.rank - b.rank);
  return (
    <div className="space-y-1.5">
      {sorted.map((s) => {
        const v = display5(s);
        const pct = s.confidence_pct ?? null;
        const noData = s.no_data ?? s.live_events === 0;
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
                <span className={`hidden md:inline text-[11px] font-bold w-24 ${noData ? "text-text-muted" : classColor(s.classification)}`}>{noData ? "Sem dado" : (CLASS_LABEL[s.classification] ?? s.classification)}</span>
                <span className="hidden lg:inline text-[10px] text-text-muted w-32 truncate">{s.momentum ? MOMENTUM_LABEL[s.momentum] : "—"}</span>
                <Badge className={pct == null ? "border-border text-text-muted" : pct >= 65 ? "border-emerald/40 text-emerald" : pct >= 40 ? "border-amber/40 text-amber" : "border-border text-text-muted"}>
                  {pct == null ? s.confidence : `${pct}%`}
                </Badge>
                {open === s.currency ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
              </>}
              {clean && <>
                {pct != null && <span className={`text-[11px] font-semibold tabular-nums ${confColor(pct)}`}>{pct}%</span>}
                {open === s.currency ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
              </>}
            </button>
            {open === s.currency && (
              <div className="px-3 pb-3 text-xs">
                {noData ? (
                  <p className="text-text-muted">Nenhum dado interpretado no período — <b className="text-text-secondary">neutra por ausência de evidência</b>, não por fraqueza. Poucos eventos ≠ moeda fraca.</p>
                ) : (
                  <>
                    <p className="text-text-muted mb-1">
                      Confiança {pct ?? "—"}% · massa de evidência {(s.evidence_mass ?? 0).toFixed(2)} · concordância {Math.round((s.agreement ?? 0) * 100)}%
                      {s.conflict && <span className="text-amber font-semibold"> · viés misto (indicadores contraditórios)</span>}
                      {" · "}anterior {s.previous_score == null ? "—" : fmt5(s.previous_score * 2.5)}
                    </p>
                    <p className="text-[10px] text-text-muted mb-2">Por que este score: soma ponderada das contribuições abaixo (importância × impacto × confiança × atualidade), atenuada quando a evidência é escassa.</p>
                    <ul className="space-y-1">
                      {s.drivers.map((d) => (
                        <li key={d.event_id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2 py-1">
                          <span className="truncate text-text-secondary">
                            {d.event}
                            {d.primary && <span className="ml-1 text-[9px] uppercase text-accent font-bold">primário</span>}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className={`font-bold ${classColor(d.classification)}`}>{d.classification}</span>
                            <span className={`tabular-nums font-semibold ${(d.contribution ?? 0) >= 0 ? "text-emerald" : "text-rose"}`}>
                              {d.contribution != null ? `${d.contribution > 0 ? "+" : ""}${d.contribution.toFixed(3)}` : `${d.weight.toFixed(3)}`}
                            </span>
                            <span className="text-text-muted">{new Date(d.released_at).toLocaleDateString("pt-BR")}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      {sorted.length === 0 && <p className="text-xs text-text-muted">Nenhum score calculado ainda. Rode uma Análise Macro.</p>}
    </div>
  );
}
