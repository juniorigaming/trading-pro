"use client";
import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { BrainCircuit, Trophy, Siren, Target, ChevronRight, Landmark, Bitcoin, RefreshCw } from "lucide-react";
import type { PortfolioId } from "@/lib/portfolio";
import { apiFetch } from "@/lib/ai/client";
import { subscribeAiDataUpdated } from "@/lib/ai/refresh-events";
import { B3_SESSION_LABEL, type B3AnalysisResult } from "@/lib/b3/types";
import type { CurrencyScoreView, MacroAnalysisResult, TradeCandidateView , EvaluatedCurrency } from "@/lib/ai/types";
import { Badge, DeltaArrow, fmtScore, riskColor, scoreBg, SESSION_LABEL } from "./ui";
import CurrencyExposure from "./CurrencyExposure";

/** Aceita linhas em snake_case (contrato) ou camelCase (linha crua do banco) sem quebrar o dashboard. */
function normalizeCandidates(input: unknown): TradeCandidateView[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const num = (a: unknown, b: unknown) => { const v = Number(a ?? b ?? 0); return Number.isFinite(v) ? v : 0; };
    const symbol = String(r.symbol ?? ""); if (!symbol || r.eligible !== true) return [];
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
      event_risk_assessed: r.event_risk_assessed !== false,
      event_risk_events: (Array.isArray(r.event_risk_events) ? r.event_risk_events : Array.isArray(r.eventRiskEvents) ? r.eventRiskEvents : []) as TradeCandidateView["event_risk_events"],
      reason: String(r.reason ?? ""),
      relative_strength: r.relative_strength == null ? undefined : num(r.relative_strength, null),
      base_currency: (r.base_currency ?? r.baseCurrency) as TradeCandidateView["base_currency"],
      quote_currency: (r.quote_currency ?? r.quoteCurrency) as TradeCandidateView["quote_currency"],
      base_score: r.base_score == null ? undefined : num(r.base_score, null),
      quote_score: r.quote_score == null ? undefined : num(r.quote_score, null),
      confidence_pct: r.confidence_pct == null ? undefined : num(r.confidence_pct, null),
      eligible: r.eligible === true,
      ineligible_reason: r.ineligible_reason == null ? undefined : String(r.ineligible_reason),
    }];
  });
}

function displayMacroScore(score: CurrencyScoreView): number | null {
  if (score.score === null) return null;
  return score.score_display ?? Number((score.score * 2.5).toFixed(2));
}
function displayMacroDelta(score: CurrencyScoreView): number | null {
  return score.score_delta == null ? null : Number((score.score_delta * 2.5).toFixed(2));
}
function displayCandidateDelta(candidate: TradeCandidateView): number {
  return Number(Math.abs(candidate.relative_strength ?? candidate.macro_divergence * 2.5).toFixed(2));
}
function MacroScoreRow({ score }: { score: CurrencyScoreView }) {
  const shown = displayMacroScore(score);
  return <p className="flex items-center justify-between py-0.5"><span className="font-extrabold text-text-primary">{score.currency}</span><span className="flex items-center gap-1" title="Variação do score individual desde a leitura anterior (escala de apresentação)"><DeltaArrow delta={displayMacroDelta(score)} /><span className={`px-1.5 rounded ${scoreBg(shown ?? 0)}`}>{fmtScore(shown)}</span></span></p>;
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

export default function DashboardAiWidgets({ portfolio = "FOREX" }: { portfolio?: PortfolioId }) { return <WidgetBoundary><DashboardAiWidgetsInner portfolio={portfolio} /></WidgetBoundary>; }

/**
 * Widgets do dashboard principal, por carteira (sem repetir cards):
 *  FOREX  → Ranking G8 · Trade Candidates · Event Risk · Exposição por moeda
 *  B3     → B3 Macro (WIN & DOL) em destaque · Event Risk (USD/BRL)
 *  CRYPTO → Regime global de risco (USD/exterior) · Event Risk USD
 * Falha silenciosa se o módulo IA ainda não foi usado.
 */
function DashboardAiWidgetsInner({ portfolio }: { portfolio: PortfolioId }) {
  const [scores, setScores] = useState<CurrencyScoreView[] | null>(null);
  const [latest, setLatest] = useState<MacroAnalysisResult | null>(null);
  const [cands, setCands] = useState<TradeCandidateView[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [b3, setB3] = useState<B3AnalysisResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboardData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, l, c, b] = await Promise.all([
        apiFetch<CurrencyScoreView[]>("/api/macro/scores"),
        apiFetch<MacroAnalysisResult | null>("/api/macro/analyses?latest=1"),
        apiFetch<TradeCandidateView[]>("/api/macro/candidates"),
        apiFetch<B3AnalysisResult | null>("/api/b3/analyses?latest=1").catch(() => null),
      ]);
      setScores(Array.isArray(s) ? s : []);
      setLatest(l && typeof l === "object" ? l : null);
      setCands(normalizeCandidates(c));
      setB3(b && typeof b === "object" && "win" in b ? b : null);
      setUnavailable(false);
      setLastUpdated(new Date());
    } catch {
      setUnavailable(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(loadDashboardData); }, [loadDashboardData]);
  useEffect(() => subscribeAiDataUpdated(() => { void loadDashboardData(); }), [loadDashboardData]);

  const refreshToolbar = (
    <div className="mb-2 flex items-center justify-end gap-2 text-[10px] text-text-muted">
      {lastUpdated && <span>Consultado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
      <button type="button" onClick={() => void loadDashboardData()} disabled={refreshing} className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-2 disabled:opacity-50" title="Atualizar os widgets de mercado">
        <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />Atualizar
      </button>
    </div>
  );
  if (unavailable) return (
    <div className="glass-card p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-text-secondary"><BrainCircuit size={18} className="text-accent" />Widgets de mercado indisponíveis nesta atualização.</div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void loadDashboardData()} disabled={refreshing} className="text-xs font-bold text-accent disabled:opacity-50">Tentar novamente</button>
        <Link href="/analise-macro" className="text-xs font-bold text-accent inline-flex items-center gap-1">Abrir Análise Macro <ChevronRight size={14} /></Link>
      </div>
    </div>
  );
  const sorted = scores ? (scores.filter((s) => s.status === "EVALUATED" && s.score !== null) as EvaluatedCurrency[]).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)) : [];
  const top = sorted.slice(0, 3), bottom = sorted.slice(-3).reverse();
  const risky = (latest?.event_risk ?? []).filter((r) => r.level === "HIGH" || r.level === "EXTREME");
  const sessionLabel = latest ? (SESSION_LABEL[latest.session] ?? latest.session) : null;
  const calendarProvided = latest?.calendar_status === "PROVIDED";
  const eventRiskCard = (
    <Link href={portfolio === "B3" ? "/b3" : "/ranking-g8"} className="glass-card p-4 hover:bg-surface-2/60 transition">
      <p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><Siren size={14} className="text-amber" />Event Risk</p>
      {!latest ? <p className="text-xs text-text-muted">Sem análise macro carregada.</p> : !calendarProvided ? <p className="text-xs text-amber">Calendário não informado; risco de eventos não avaliado.</p> : risky.length === 0 ? <p className="text-xs text-emerald">Sem evento de alto impacto nos eventos informados nesta análise.</p> : risky.map((r) => <p key={r.currency} className="text-xs py-0.5 flex items-center justify-between"><span className="font-extrabold">{r.currency}</span><Badge className={riskColor(r.level)}>{r.level}</Badge></p>)}
      {latest && <p className="text-[10px] text-text-muted mt-1">{(latest.pending_events ?? []).length} eventos pendentes{calendarProvided ? " na entrada desta análise" : " · não avaliado"}</p>}
    </Link>
  );
  const b3Card = (
    <Link href="/b3" className={`glass-card p-4 hover:bg-surface-2/60 transition ${portfolio === "B3" ? "md:col-span-2 xl:col-span-3" : "md:col-span-2 xl:col-span-4"}`}>
      <div className="flex items-center justify-between mb-2"><p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5"><Landmark size={14} className="text-accent" />B3 Macro — WIN &amp; DOL</p>{b3 && <span className="text-[10px] text-text-muted">{B3_SESSION_LABEL[b3.session] ?? b3.session}</span>}</div>
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
  );

  if (portfolio === "B3") {
    return (
      <div className="mb-6">
        {refreshToolbar}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {b3Card}
          {eventRiskCard}
        </div>
      </div>
    );
  }

  if (portfolio === "CRYPTO") {
    const usd = sorted.find((x) => x.currency === "USD");
    const regime = b3?.regime ?? null;
    return (
      <div className="mb-6">
        {refreshToolbar}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link href="/ranking-g8" className="glass-card p-4 hover:bg-surface-2/60 transition">
          <p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><Bitcoin size={14} className="text-sky" />Regime de risco global</p>
          {!usd && !regime ? <p className="text-xs text-text-muted">Sem análise macro ainda — rode a Análise Macro IA para ver o viés do dólar.</p> : (
            <div className="text-xs space-y-1">
              {usd && <p className="flex items-center justify-between"><span className="text-text-muted">Score macro USD (−5..+5)</span><span className="flex items-center gap-1"><DeltaArrow delta={displayMacroDelta(usd)} /><span className={`px-1.5 rounded font-bold ${scoreBg(displayMacroScore(usd) ?? 0)}`}>{fmtScore(displayMacroScore(usd))}</span></span></p>}
              {regime && <p className="flex items-center justify-between"><span className="text-text-muted">Regime (exterior)</span><b className="text-text-primary">{regime}</b></p>}
              <p className="text-[10px] text-text-muted pt-1">Dólar forte / risk-off tende a pressionar BTC e alts; use como contexto, não como sinal.</p>
            </div>
          )}
        </Link>
        {eventRiskCard}
        <div className="glass-card p-4">
          <p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><Target size={14} className="text-accent" />Checklist Cripto</p>
          <ul className="text-[11px] text-text-secondary space-y-1 list-disc pl-4">
            <li>Funding e open interest extremos → evitar perseguir movimento.</li>
            <li>Evento USD de alto impacto em &lt; 4h → reduzir alavancagem.</li>
            <li>Registrar taxa (fee) e funding no resultado líquido.</li>
          </ul>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      {refreshToolbar}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Link href="/ranking-g8" className="glass-card p-4 hover:bg-surface-2/60 transition">
        <div className="flex items-center justify-between mb-2"><p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5"><Trophy size={14} className="text-accent" />Ranking G8 · macro −5..+5</p>{sessionLabel && <span className="text-[10px] text-text-muted">{sessionLabel}</span>}</div>
        {sorted.length === 0 ? <p className="text-xs text-text-muted">Sem análise ainda.</p> : (
          <div className="grid grid-cols-2 gap-x-3 text-xs">
            <div>{top.map((s) => <MacroScoreRow key={s.currency} score={s} />)}</div>
            <div>{bottom.map((s) => <MacroScoreRow key={s.currency} score={s} />)}</div>
          </div>
        )}
      </Link>
      <Link href="/ranking-g8" className="glass-card p-4 hover:bg-surface-2/60 transition">
        <p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><Target size={14} className="text-accent" />Trade Candidates</p>
        {cands.length === 0 ? <p className="text-xs text-text-muted">Nenhum par elegível com evidência suficiente.</p> : cands.slice(0, 4).map((c) => <p key={c.symbol} className="flex items-center justify-between text-xs py-0.5"><span className="font-extrabold text-text-primary">{c.symbol}</span><span className="flex items-center gap-1.5"><span className={c.bias === "LONG" ? "text-emerald font-bold" : "text-rose font-bold"}>{c.bias}</span><span className="text-text-muted tabular-nums" title="|Δ| entre scores exibidos da base e da cotada; cada score é −5..+5, então |Δ| vai de 0 a 10">|Δ| {displayCandidateDelta(c).toFixed(2)}</span><Badge className={riskColor(c.event_risk_assessed === false ? "NOT_ASSESSED" : c.event_risk)}>{c.event_risk_assessed === false ? "N/A" : c.event_risk}</Badge></span></p>)}
      </Link>
      {eventRiskCard}
      <div className="glass-card p-4"><p className="text-xs font-extrabold text-text-primary inline-flex items-center gap-1.5 mb-2"><BrainCircuit size={14} className="text-accent" />Exposição por moeda</p><CurrencyExposure compact /></div>
      </div>
    </div>
  );
}
