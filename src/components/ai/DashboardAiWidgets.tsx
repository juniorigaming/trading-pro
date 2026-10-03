"use client";
import { Component, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { BrainCircuit, Trophy, Siren, Target, ChevronRight, Landmark } from "lucide-react";
import { apiFetch } from "@/lib/ai/client";
import { B3_SESSION_LABEL, type B3AnalysisResult } from "@/lib/b3/types";
import type { CurrencyScoreView, MacroAnalysisResult, TradeCandidateView } from "@/lib/ai/types";
import { Badge, DeltaArrow, fmtScore, riskColor, scoreBg, SESSION_LABEL } from "./ui";
import CurrencyExposure from "./CurrencyExposure";

/** Aceita linhas em snake_case (contrato) ou camelCase (linha crua do banco) sem quebrar o dashboard. */
function normalizeCandidates(input: unknown): TradeCandidateView[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const num = (a: unknown, b: unknown) => { const v = Number(a ?? b ?? 0); return Number.isFinite(v) ? v : 0; };
    const symbol = String(r.symbol ?? ""); if (!symbol) return [];
    return [{
      symbol,
      bias: (r.bias === "SHORT" ? "SHORT" : "LONG") as TradeCandidateView["bias"],
      strong_currency: (r.strong_currency ?? r.strongCurrency ?? "USD") as TradeCandidateView["strong_currency"],
      weak_currency: (r.weak_currency ?? r.weakCurrency ?? "USD") as TradeCandidateView["weak_currency"],
      strong_score: num(r.strong_score, r.strongScore),
      weak_score: num(r.weak_score, r.weakScore),
      macro_divergence: num(r.macro_divergence, r.macroDivergence),
      confidence: (r.confidence ?? "LOW") as TradeCandidateView["confidence"],
      priority: num(r.priority, 0),
      event_risk: (r.event_risk ?? r.eventRisk ?? "LOW") as TradeCandidateView["event_risk"],
      event_risk_events: (Array.isArray(r.event_risk_events) ? r.event_risk_events : Array.isArray(r.eventRiskEvents) ? r.eventRiskEvents : []) as TradeCandidateView["event_risk_events"],
      reason: String(r.reason ?? ""),
    }];
  });
}

/** Error boundary local: se os widgets IA falharem, o resto do dashboard continua funcionando. */
class WidgetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error("[DashboardAiWidgets]", err); }
  render() {
    if (this.state.failed) return (
      <div className="glass-card p-4 mb-6 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm text-text-secondary"><BrainCircuit size={18} className="text-amber" />Widgets IA indisponíveis no momento (erro ao renderizar). O restante do painel segue normal.</div><Link href="/ranking-g8" className="text-xs font-bold text-accent inline-flex items-center gap-1">Abrir Ranking <ChevronRight size={14} /></Link></div>
    );
    return this.props.children;
  }
}

export default function DashboardAiWidgets() { return <WidgetBoundary><DashboardAiWidgetsInner /></WidgetBoundary>; }

/** Widgets do dashboard principal: top/bottom G8, candidatos, risco de eventos e exposição. Falha silenciosa se o módulo IA ainda não foi usado. */
function DashboardAiWidgetsInner() {
  const [scores, setScores] = useState<CurrencyScoreView[] | null>(null);
  const [latest, setLatest] = useState<MacroAnalysisResult | null>(null);
  const [cands, setCands] = useState<TradeCandidateView[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [b3, setB3] = useState<B3AnalysisResult | null>(null);
  useEffect(() => { apiFetch<B3AnalysisResult | null>("/api/b3/analyses?latest=1").then((r) => setB3(r && typeof r === "object" && "win" in r ? r : null)).catch(() => setB3(null)); }, []);
  useEffect(() => {
    Promise.all([apiFetch<CurrencyScoreView[]>("/api/macro/scores"), apiFetch<MacroAnalysisResult | null>("/api/macro/analyses?latest=1"), apiFetch<TradeCandidateView[]>("/api/macro/candidates")])
      .then(([s, l, c]) => { setScores(Array.isArray(s) ? s : []); setLatest(l && typeof l === "object" ? l : null); setCands(normalizeCandidates(c)); }).catch(() => setUnavailable(true));
  }, []);
  if (unavailable) return (
    <div className="glass-card p-4 mb-6 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm text-text-secondary"><BrainCircuit size={18} className="text-accent" />Módulo IA ainda não configurado (rode a migration e defina as variáveis).</div><Link href="/analise-macro" className="text-xs font-bold text-accent inline-flex items-center gap-1">Abrir <ChevronRight size={14} /></Link></div>
  );
  const sorted = scores ? [...scores].sort((a, b) => a.rank - b.rank) : [];
  const top = sorted.slice(0, 3), bottom = sorted.slice(-3).reverse();
  const risky = (latest?.event_risk ?? []).filter((r) => r.level === "HIGH" || r.level === "EXTREME");
  const sessionLabel = latest ? (SESSION_LABEL[latest.session] ?? latest.session) : null;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
      <Link href="/ranking-g8" className="glass-card p-4 hover:bg-surface-2/60 transition">
        <div className="flex items-center justify-between mb-2"><p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5"><Trophy size={14} className="text-accent" />Ranking G8</p>{sessionLabel && <span className="text-[10px] text-text-muted">{sessionLabel}</span>}</div>
        {sorted.length === 0 ? <p className="text-xs text-text-muted">Sem análise ainda.</p> : (
          <div className="grid grid-cols-2 gap-x-3 text-xs">
            <div>{top.map((s) => <p key={s.currency} className="flex items-center justify-between py-0.5"><span className="font-extrabold text-text-primary">{s.currency}</span><span className="flex items-center gap-1"><DeltaArrow delta={s.score_delta} /><span className={`px-1.5 rounded ${scoreBg(s.score)}`}>{fmtScore(s.score)}</span></span></p>)}</div>
            <div>{bottom.map((s) => <p key={s.currency} className="flex items-center justify-between py-0.5"><span className="font-extrabold text-text-primary">{s.currency}</span><span className="flex items-center gap-1"><DeltaArrow delta={s.score_delta} /><span className={`px-1.5 rounded ${scoreBg(s.score)}`}>{fmtScore(s.score)}</span></span></p>)}</div>
          </div>
        )}
      </Link>
      <Link href="/ranking-g8" className="glass-card p-4 hover:bg-surface-2/60 transition">
        <p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><Target size={14} className="text-accent" />Trade Candidates</p>
        {cands.length === 0 ? <p className="text-xs text-text-muted">Nenhum par com divergência ≥ 1.0.</p> : cands.slice(0, 4).map((c) => <p key={c.symbol} className="flex items-center justify-between text-xs py-0.5"><span className="font-extrabold text-text-primary">{c.symbol}</span><span className="flex items-center gap-1.5"><span className={c.bias === "LONG" ? "text-emerald font-bold" : "text-rose font-bold"}>{c.bias}</span><span className="text-text-muted tabular-nums">Δ{Number(c.macro_divergence ?? 0).toFixed(2)}</span><Badge className={riskColor(c.event_risk)}>{c.event_risk}</Badge></span></p>)}
      </Link>
      <Link href="/ranking-g8" className="glass-card p-4 hover:bg-surface-2/60 transition">
        <p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><Siren size={14} className="text-amber" />Event Risk</p>
        {!latest ? <p className="text-xs text-text-muted">Sem calendário carregado.</p> : risky.length === 0 ? <p className="text-xs text-emerald">Sem eventos de alto impacto iminentes.</p> : risky.map((r) => <p key={r.currency} className="text-xs py-0.5 flex items-center gap-2"><Badge className={riskColor(r.level)}>{r.currency} {r.level}</Badge><span className="text-text-muted truncate">{r.events[0]?.event}</span></p>)}
        {latest && <p className="text-[10px] text-text-muted mt-1">{(latest.pending_events ?? []).length} eventos pendentes</p>}
      </Link>
      <div className="glass-card p-4"><p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><BrainCircuit size={14} className="text-accent" />Exposição por moeda</p><CurrencyExposure compact /></div>
      <Link href="/b3" className="glass-card p-4 hover:bg-surface-2/60 transition md:col-span-2 xl:col-span-4">
        <div className="flex items-center justify-between mb-2"><p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5"><Landmark size={14} className="text-accent" />B3 Macro — WIN & DOL</p>{b3 && <span className="text-[10px] text-text-muted">{b3.date} · {B3_SESSION_LABEL[b3.session]}</span>}</div>
        {!b3 ? <p className="text-xs text-text-muted">Sem análise B3 ainda — abra o módulo para carregar calendário BR/EUA, curva DI e exterior.</p> : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span>WIN <span className={`px-1.5 rounded font-bold ${scoreBg(b3.win.score)}`}>{fmtScore(b3.win.score)}</span> <span className="text-text-muted">{b3.win.bias}</span></span>
            <span>DOL <span className={`px-1.5 rounded font-bold ${scoreBg(b3.dol.divergence)}`}>{fmtScore(b3.dol.divergence)}</span> <span className="text-text-muted">{b3.dol.bias}</span></span>
            <span className="text-text-muted">USD {fmtScore(b3.usd.score)} · BRL {fmtScore(b3.brl.score)}</span>
            <span className="text-text-muted">regime <b className="text-text-primary">{b3.regime}</b></span>
            {b3.di_curve && <span className="text-text-muted">DI {b3.di_curve.shape}</span>}
            {b3.event_risk.map((e) => <Badge key={e.instrument} className={riskColor(e.level)}>{e.instrument} {e.level}</Badge>)}
            {b3.trade_candidates.slice(0, 3).map((c) => <span key={`${c.instrument}${c.bias}`} className="font-bold"><span className="text-text-primary">{c.instrument}</span> <span className={c.bias === "LONG" ? "text-emerald" : "text-rose"}>{c.bias}</span></span>)}
          </div>
        )}
      </Link>
    </div>
  );
}
