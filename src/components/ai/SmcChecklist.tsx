"use client";
import { CheckCircle2, XCircle, CircleDashed } from "lucide-react";
import type { ChecklistResult } from "@/lib/smc/checklist";
import { Badge, statusColor } from "./ui";

const WORKFLOW = ["MACRO", "HTF DRAW", "LOCATION", "LIQUIDITY", "DISPLACEMENT", "MSS", "RETRACEMENT", "EXECUTION"];

export default function SmcChecklist({ c }: { c: ChecklistResult }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`px-3 py-1 rounded-xl border text-sm font-extrabold ${statusColor(c.status)}`}>{c.status}</span>
        <Badge className="border-border text-text-secondary">modelo: {c.entry_model.replace("_", " ")}</Badge>
        <Badge className={c.setup_grade === "A" ? "border-emerald/40 text-emerald" : c.setup_grade === "B" ? "border-sky/40 text-sky" : c.setup_grade === "C" ? "border-amber/40 text-amber" : "border-rose/40 text-rose"}>grade {c.setup_grade}</Badge>
        <Badge className={c.risk_recommendation === "NORMAL" ? "border-emerald/40 text-emerald" : c.risk_recommendation === "REDUCED" ? "border-amber/40 text-amber" : "border-rose/40 text-rose"}>risco {c.risk_recommendation}</Badge>
      </div>
      <ol className="flex flex-wrap gap-1 mb-3">{WORKFLOW.map((w, i) => <li key={w} className="text-[9px] font-bold text-text-muted"><span className="px-1.5 py-0.5 rounded bg-surface-3">{i + 1}. {w}</span>{i < WORKFLOW.length - 1 && <span className="mx-0.5">→</span>}</li>)}</ol>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {c.items.map((it) => (
          <li key={it.key} className="flex items-start gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5">
            {it.ok === true ? <CheckCircle2 size={15} className="text-emerald mt-0.5 shrink-0" /> : it.ok === false ? <XCircle size={15} className="text-rose mt-0.5 shrink-0" /> : <CircleDashed size={15} className="text-text-muted mt-0.5 shrink-0" />}
            <div className="min-w-0"><p className="text-xs font-bold text-text-primary">{it.label}</p>{it.note && <p className="text-[10px] text-text-muted leading-snug">{it.note}</p>}</div>
          </li>
        ))}
      </ul>
      {(c.disqualifiers.length > 0 || c.downgrades.length > 0) && (
        <div className="mt-3 space-y-1">
          {c.disqualifiers.length > 0 && <p className="text-[11px] text-rose"><b>Desqualificadores:</b> {c.disqualifiers.join(", ")}</p>}
          {c.downgrades.map((d, i) => <p key={i} className="text-[11px] text-amber">↓ {d}</p>)}
        </div>
      )}
      <p className="text-[10px] text-text-muted mt-3">Lembrete fixo: <b>POI não é entrada</b>. Entrada exige sweep + displacement + MSS (ou MODELO A com risco reduzido). Grade travada antes do resultado.</p>
    </div>
  );
}
