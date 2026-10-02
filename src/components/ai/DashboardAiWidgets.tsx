"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrainCircuit, Trophy, Siren, Target, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/ai/client";
import type { CurrencyScoreView, MacroAnalysisResult, TradeCandidateView } from "@/lib/ai/types";
import { Badge, DeltaArrow, fmtScore, riskColor, scoreBg, SESSION_LABEL } from "./ui";
import CurrencyExposure from "./CurrencyExposure";

/** Widgets do dashboard principal: top/bottom G8, candidatos, risco de eventos e exposição. Falha silenciosa se o módulo IA ainda não foi usado. */
export default function DashboardAiWidgets() {
  const [scores, setScores] = useState<CurrencyScoreView[] | null>(null);
  const [latest, setLatest] = useState<MacroAnalysisResult | null>(null);
  const [cands, setCands] = useState<TradeCandidateView[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    Promise.all([apiFetch<CurrencyScoreView[]>("/api/macro/scores"), apiFetch<MacroAnalysisResult | null>("/api/macro/analyses?latest=1"), apiFetch<TradeCandidateView[]>("/api/macro/candidates")])
      .then(([s, l, c]) => { setScores(s); setLatest(l); setCands(c); }).catch(() => setUnavailable(true));
  }, []);
  if (unavailable) return (
    <div className="glass-card p-4 mb-6 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm text-text-secondary"><BrainCircuit size={18} className="text-accent" />Módulo IA ainda não configurado (rode a migration e defina as variáveis).</div><Link href="/analise-macro" className="text-xs font-bold text-accent inline-flex items-center gap-1">Abrir <ChevronRight size={14} /></Link></div>
  );
  const sorted = scores ? [...scores].sort((a, b) => a.rank - b.rank) : [];
  const top = sorted.slice(0, 3), bottom = sorted.slice(-3).reverse();
  const risky = (latest?.event_risk ?? []).filter((r) => r.level === "HIGH" || r.level === "EXTREME");
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
      <Link href="/ranking-g8" className="glass-card p-4 hover:bg-surface-2/60 transition">
        <div className="flex items-center justify-between mb-2"><p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5"><Trophy size={14} className="text-accent" />Ranking G8</p>{latest && <span className="text-[10px] text-text-muted">{SESSION_LABEL[latest.session]}</span>}</div>
        {sorted.length === 0 ? <p className="text-xs text-text-muted">Sem análise ainda.</p> : (
          <div className="grid grid-cols-2 gap-x-3 text-xs">
            <div>{top.map((s) => <p key={s.currency} className="flex items-center justify-between py-0.5"><span className="font-extrabold text-text-primary">{s.currency}</span><span className="flex items-center gap-1"><DeltaArrow delta={s.score_delta} /><span className={`px-1.5 rounded ${scoreBg(s.score)}`}>{fmtScore(s.score)}</span></span></p>)}</div>
            <div>{bottom.map((s) => <p key={s.currency} className="flex items-center justify-between py-0.5"><span className="font-extrabold text-text-primary">{s.currency}</span><span className="flex items-center gap-1"><DeltaArrow delta={s.score_delta} /><span className={`px-1.5 rounded ${scoreBg(s.score)}`}>{fmtScore(s.score)}</span></span></p>)}</div>
          </div>
        )}
      </Link>
      <Link href="/ranking-g8" className="glass-card p-4 hover:bg-surface-2/60 transition">
        <p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><Target size={14} className="text-accent" />Trade Candidates</p>
        {cands.length === 0 ? <p className="text-xs text-text-muted">Nenhum par com divergência ≥ 1.0.</p> : cands.slice(0, 4).map((c) => <p key={c.symbol} className="flex items-center justify-between text-xs py-0.5"><span className="font-extrabold text-text-primary">{c.symbol}</span><span className="flex items-center gap-1.5"><span className={c.bias === "LONG" ? "text-emerald font-bold" : "text-rose font-bold"}>{c.bias}</span><span className="text-text-muted tabular-nums">Δ{c.macro_divergence.toFixed(2)}</span><Badge className={riskColor(c.event_risk)}>{c.event_risk}</Badge></span></p>)}
      </Link>
      <Link href="/ranking-g8" className="glass-card p-4 hover:bg-surface-2/60 transition">
        <p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><Siren size={14} className="text-amber" />Event Risk</p>
        {!latest ? <p className="text-xs text-text-muted">Sem calendário carregado.</p> : risky.length === 0 ? <p className="text-xs text-emerald">Sem eventos de alto impacto iminentes.</p> : risky.map((r) => <p key={r.currency} className="text-xs py-0.5 flex items-center gap-2"><Badge className={riskColor(r.level)}>{r.currency} {r.level}</Badge><span className="text-text-muted truncate">{r.events[0]?.event}</span></p>)}
        {latest && <p className="text-[10px] text-text-muted mt-1">{latest.pending_events.length} eventos pendentes</p>}
      </Link>
      <div className="glass-card p-4"><p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><BrainCircuit size={14} className="text-accent" />Exposição por moeda</p><CurrencyExposure compact /></div>
    </div>
  );
}
