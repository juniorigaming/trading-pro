"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CurrencyScoreView } from "@/lib/ai/types";
import { Badge, DeltaArrow, classColor, fmtScore, scoreBg } from "./ui";

const MOMENTUM_LABEL: Record<string, string> = { STRENGTHENING: "fortalecendo", WEAKENING: "enfraquecendo", STABLE: "estável", NARRATIVE_SHIFT: "mudança de narrativa" };
const CLASS_LABEL: Record<string, string> = { VERY_STRONG: "Muito forte", STRONG: "Forte", MODERATELY_STRONG: "Mod. forte", NEUTRAL: "Neutro", MODERATELY_WEAK: "Mod. fraca", WEAK: "Fraca", VERY_WEAK: "Muito fraca" };

/** compact = sem expandir drivers (widgets). clean = só rank, moeda, barra, score e seta (página de análise). */
export default function G8Ranking({ scores, compact = false, clean = false }: { scores: CurrencyScoreView[]; compact?: boolean; clean?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...scores].sort((a, b) => a.rank - b.rank);
  return (
    <div className="space-y-1.5">
      {sorted.map((s) => (
        <div key={s.currency} className="rounded-xl border border-border bg-surface-2/60">
          <button onClick={() => !compact && setOpen(open === s.currency ? null : s.currency)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
            <span className="w-6 text-xs font-extrabold text-text-muted">#{s.rank}</span>
            <span className="w-10 text-sm font-extrabold text-text-primary">{s.currency}</span>
            <div className="flex-1 h-2 rounded-full bg-surface-3 relative overflow-hidden">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
              <div className={`absolute top-0 bottom-0 ${s.score >= 0 ? "bg-emerald" : "bg-rose"}`} style={{ left: s.score >= 0 ? "50%" : `${50 + (s.score / 2) * 50}%`, width: `${Math.abs(s.score) / 2 * 50}%` }} />
            </div>
            <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold tabular-nums ${scoreBg(s.score)}`}>{fmtScore(s.score)}</span>
            <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-text-muted w-14">{s.score_delta != null && Math.abs(s.score_delta) >= 0.01 && <><DeltaArrow delta={s.score_delta} />{fmtScore(s.score_delta)}</>}</span>
            {!compact && !clean && <>
              <span className={`hidden md:inline text-[11px] font-bold w-24 ${classColor(s.classification)}`}>{CLASS_LABEL[s.classification] ?? s.classification}</span>
              <span className="hidden lg:inline text-[10px] text-text-muted w-32 truncate">{s.momentum ? MOMENTUM_LABEL[s.momentum] : "—"}</span>
              <Badge className={s.confidence === "HIGH" ? "border-emerald/40 text-emerald" : s.confidence === "MEDIUM" ? "border-amber/40 text-amber" : "border-border text-text-muted"}>{s.confidence}</Badge>
              {open === s.currency ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
            </>}
            {clean && (open === s.currency ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />)}
          </button>
          {open === s.currency && (
            <div className="px-3 pb-3 text-xs">
              <p className="text-text-muted mb-1">{s.live_events} eventos ativos · score bruto {s.score_raw.toFixed(3)} · anterior {fmtScore(s.previous_score)}</p>
              {s.drivers.length === 0 ? <p className="text-text-muted">Sem drivers (sem dados interpretados ainda).</p> : (
                <ul className="space-y-1">
                  {s.drivers.map((d) => (
                    <li key={d.event_id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2 py-1">
                      <span className="truncate text-text-secondary">{d.event}</span>
                      <span className="flex items-center gap-2 shrink-0"><span className={`font-bold ${classColor(d.classification)}`}>{d.classification}</span><span className="tabular-nums text-text-muted">{d.weight > 0 ? "+" : ""}{d.weight.toFixed(3)}</span><span className="text-text-muted">{new Date(d.released_at).toLocaleDateString("pt-BR")}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ))}
      {sorted.length === 0 && <p className="text-xs text-text-muted">Nenhum score calculado ainda. Rode uma Análise Macro.</p>}
    </div>
  );
}
