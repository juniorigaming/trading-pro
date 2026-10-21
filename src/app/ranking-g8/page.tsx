"use client";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Trophy, Grid3X3, Siren, LineChart as LineChartIcon, RefreshCw, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import G8Ranking, { type MiniScorePoint } from "@/components/ai/G8Ranking";
import MacroSummary from "@/components/ai/MacroSummary";
import CurrencyStrengthRankings from "@/components/ai/CurrencyStrengthRankings";
import PricePairCandidates from "@/components/ai/PricePairCandidates";
import { DivergenceMatrix, TradeCandidates } from "@/components/ai/DivergenceMatrix";
import EventRiskPanel from "@/components/ai/EventRiskPanel";
import ScoreHistoryChart from "@/components/ai/ScoreHistoryChart";
import { Btn, Notice, PageHeader, Section, Spinner, Tabs, SESSION_LABEL } from "@/components/ai/ui";
import { apiFetch } from "@/lib/ai/client";
import type { CurrencyScoreView, MacroAnalysisResult, TradeCandidateView } from "@/lib/ai/types";
import type { ExchangeRatesMarketSnapshot } from "@/lib/macro/market-analysis-types";
import { SESSIONS, type Session } from "@/lib/ai/types";

type Tab = "ranking" | "preco" | "matriz" | "candidatos" | "risco" | "historico";

export default function RankingG8Page() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("preco");
  const [scores, setScores] = useState<CurrencyScoreView[] | null>(null);
  const [scoreHistory, setScoreHistory] = useState<MiniScorePoint[]>([]);
  const [latest, setLatest] = useState<MacroAnalysisResult | null>(null);
  const [candidates, setCandidates] = useState<TradeCandidateView[] | null>(null);
  const [marketStrength, setMarketStrength] = useState<ExchangeRatesMarketSnapshot | null>(null);
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceErr, setPriceErr] = useState<string | null>(null);
  const [session, setSession] = useState<Session | "ALL">("ALL");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, l, c] = await Promise.all([
        apiFetch<CurrencyScoreView[]>("/api/macro/scores"),
        apiFetch<MacroAnalysisResult | null>(`/api/macro/analyses?latest=1${session !== "ALL" ? `&session=${session}` : ""}`),
        apiFetch<TradeCandidateView[]>("/api/macro/candidates"),
      ]);
      setScores(s); setLatest(l); setCandidates(c); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [session]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    let active = true;
    apiFetch<MiniScorePoint[]>("/api/macro/scores/history?days=7")
      .then((rows) => { if (active) setScoreHistory(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (active) setScoreHistory([]); });
    return () => { active = false; };
  }, []);

  const loadPriceStrength = useCallback(async () => {
    setPriceBusy(true);
    setPriceErr(null);
    try {
      const snapshot = await apiFetch<ExchangeRatesMarketSnapshot>("/api/ai/macro/market-strength");
      setMarketStrength(snapshot);
    } catch (e) {
      setPriceErr((e as Error).message);
    } finally {
      setPriceBusy(false);
    }
  }, []);
  useEffect(() => {
    if (tab === "preco" && marketStrength === null && !priceBusy && !priceErr) void Promise.resolve().then(loadPriceStrength);
  }, [tab, marketStrength, priceBusy, priceErr, loadPriceStrength]);

  const refresh = () => {
    void load();
    if (tab === "preco") void loadPriceStrength();
  };

  const recompute = async () => {
    setBusy("Recalculando scores com os eventos já interpretados (sem IA)..."); setErr(null);
    try { const r = await apiFetch<MacroAnalysisResult>("/api/macro/scores/recompute", { method: "POST", body: JSON.stringify({ session: session === "ALL" ? "LONDON" : session, persist: true }) }); setLatest({ ...r, analysis_id: r.analysis_id ?? "recalc" }); setScores(r.currencies); setCandidates(r.trade_candidates); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const tabs = [
    { id: "preco" as Tab, label: "Pares D1/W1", icon: BarChart3 }, { id: "ranking" as Tab, label: "Macro por eventos", icon: Trophy }, { id: "matriz" as Tab, label: "Divergence Matrix", icon: Grid3X3 }, { id: "candidatos" as Tab, label: "Trade Candidates", icon: Target },
    { id: "risco" as Tab, label: "Event Risk", icon: Siren }, { id: "historico" as Tab, label: "Histórico 7D/30D/90D", icon: LineChartIcon }
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <PageHeader icon={Trophy} title="Ranking G8" sub="Força de preço em D1/W1 e score macro por eventos são dimensões separadas. Dados ausentes não são estimados." right={
        <div className="flex items-center gap-2">
          <select value={session} onChange={(e) => setSession(e.target.value as Session | "ALL")} className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"><option value="ALL">Última análise</option>{SESSIONS.map((s) => <option key={s} value={s}>{SESSION_LABEL[s]}</option>)}</select>
          <Btn variant="ghost" onClick={refresh} title="Atualiza os rankings carregados"><RefreshCw size={14} /></Btn>
          <Btn variant="ghost" onClick={recompute} disabled={!!busy} title="Reaplica pesos/decaimento aos eventos já interpretados — não chama IA nem reenvia imagens">Recalcular</Btn>
        </div>
      } />
      <div className="mb-4"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      {err && <div className="mb-4"><Notice kind="error">{err}</Notice></div>}
      {busy && <div className="mb-4"><Spinner label={busy} /></div>}
      {latest && tab !== "preco" && <p className="text-[11px] text-text-muted mb-3">Base do score macro: análise #{latest.analysis_id} · {latest.date} · {SESSION_LABEL[latest.session]} · scoring {latest.meta.scoring_version}</p>}

      {tab === "ranking" && (
        <div className="space-y-4">
          {latest && <MacroSummary result={latest} />}
          <div className="grid gap-4 xl:grid-cols-3">
            <Section className="xl:col-span-2" title="Score macro por eventos" sub="Evidência econômica confirmada, não força de preço. Moedas sem evidência ficam em “sem dado”, sem posição macro.">
              {scores ? <G8Ranking scores={scores} history={scoreHistory} /> : <Spinner />}
              {(latest?.extra_currencies?.length ?? 0) > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-bold text-text-primary">Moedas fora do G8 com evidência disponível</p>
                  <p className="text-[11px] text-text-muted mb-2">Mesmo motor, mostradas à parte — não entram no ranking G8 nem nos pares. Contexto útil para AUD/NZD (CNY) e para o módulo B3 (BRL).</p>
                  <G8Ranking scores={latest!.extra_currencies!} clean />
                </div>
              )}
            </Section>
            <Section title="Como ler" sub="Evidência, não contagem de eventos">
              <ul className="text-xs text-text-secondary space-y-1.5 list-disc pl-4">
                <li><b>Poucos eventos ≠ moeda fraca.</b> Sem dado vivo, a moeda fica sem score macro e nunca é penalizada.</li>
                <li><b>Moedas sem evidência ficam em “sem dado”.</b> Para ver as oito moedas G8 ordenadas por força de preço, use a aba <i>Pares D1/W1</i>.</li>
                <li>Escala <b>−5..+5</b>: força da EVIDÊNCIA macro — <b>não</b> é probabilidade de o preço subir.</li>
                <li>Força relativa do par = base − cotada. Bandas: &lt;0.5 neutro · 0.6–1.0 muito fraco · 1.1–1.5 moderado · 1.6–2.5 forte · 2.6+ muito forte.</li>
                <li><b>Score ≠ confiança.</b> Score expressa direção/força média ponderada dos eventos; confiança mede robustez da evidência e não é probabilidade de alta, lucro ou acerto.</li>
                <li><b>Viés:</b> ≥ +1.50 forte positivo · +0.75 positivo · +0.25 levemente positivo · neutro · −0.25 levemente negativo · −0.75 negativo · ≤ −1.50 forte negativo.</li>
                <li><b>Ordem do ranking = força macro</b> (score), nunca o percentual de confiança. Conflito entre indicadores reduz a confiança, não some com o dado.</li>
                <li><b>NARRATIVE_SHIFT</b>: reavalie posições abertas naquela moeda.</li>
                <li>Macro define <i>o que procurar</i> no SMC/ICT; <b>nunca</b> é gatilho de entrada.</li>
              </ul>
            </Section>
          </div>
        </div>
      )}
      {tab === "preco" && (
        <Section title="Força G8 e pares candidatos" sub="Ranking D1/W1 e maior diferencial entre moedas; separado do score macro por eventos.">
          {priceErr && <div className="mb-3"><Notice kind="error">{priceErr}</Notice></div>}
          {priceBusy && <div className="mb-3"><Spinner label="Consultando rankings D1/W1…" /></div>}
          {marketStrength && <div className="space-y-3"><PricePairCandidates market={marketStrength} /><CurrencyStrengthRankings market={marketStrength} /></div>}
          {!marketStrength && !priceBusy && !priceErr && <Spinner label="Preparando rankings de preço…" />}
        </Section>
      )}
      {tab === "matriz" && <Section title="Macro Divergence Matrix" sub="Todas as 56 combinações (escala nativa). A lista de candidatos aplica as bandas de força relativa e a confiança da evidência.">{scores ? <DivergenceMatrix scores={scores} /> : <Spinner />}</Section>}
      {tab === "candidatos" && <Section title="Trade Candidates" sub="symbol · direction · strong/weak · divergência · confiança · prioridade · event risk. Clique para levar ao módulo SMC/ICT.">{candidates ? <TradeCandidates candidates={candidates} onPick={(c) => router.push(`/smc-ict?symbol=${c.symbol}&bias=${c.bias}&div=${c.macro_divergence}`)} onPlan={(c) => router.push(`/planejamento/novo?symbol=${encodeURIComponent(c.symbol)}&bias=${c.bias}&div=${c.macro_divergence}&eventRisk=${c.event_risk}&reason=${encodeURIComponent(c.reason.slice(0, 500))}&invalidations=${encodeURIComponent((c.invalidation_events || []).join("; ").slice(0, 300))}`)} /> : <Spinner />}</Section>}
      {tab === "risco" && <Section title="Event Risk" sub="LOW · MEDIUM · HIGH · EXTREME (as duas pernas do par com evento de alto impacto iminente)">{latest ? <EventRiskPanel eventRisk={latest.event_risk} pending={latest.pending_events} pairsToAvoid={latest.pairs_to_avoid} /> : <p className="text-xs text-text-muted">Sem análise salva para esta sessão.</p>}</Section>}
      {tab === "historico" && <Section title="Evolução dos scores" sub="Um ponto por moeda a cada análise/recalculo persistido"><ScoreHistoryChart /></Section>}
    </div>
  );
}
