"use client";
import { useCallback, useEffect, useState } from "react";
import { Trophy, Grid3X3, Siren, LineChart as LineChartIcon, RefreshCw, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import G8Ranking from "@/components/ai/G8Ranking";
import MacroSummary from "@/components/ai/MacroSummary";
import { DivergenceMatrix, TradeCandidates } from "@/components/ai/DivergenceMatrix";
import EventRiskPanel from "@/components/ai/EventRiskPanel";
import ScoreHistoryChart from "@/components/ai/ScoreHistoryChart";
import { Btn, Notice, PageHeader, Section, Spinner, Tabs, SESSION_LABEL } from "@/components/ai/ui";
import { apiFetch } from "@/lib/ai/client";
import type { CurrencyScoreView, MacroAnalysisResult, TradeCandidateView } from "@/lib/ai/types";
import { SESSIONS, type Session } from "@/lib/ai/types";

type Tab = "ranking" | "matriz" | "candidatos" | "risco" | "historico";

export default function RankingG8Page() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ranking");
  const [scores, setScores] = useState<CurrencyScoreView[] | null>(null);
  const [latest, setLatest] = useState<MacroAnalysisResult | null>(null);
  const [candidates, setCandidates] = useState<TradeCandidateView[] | null>(null);
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

  const recompute = async () => {
    setBusy("Recalculando scores com os eventos já interpretados (sem IA)..."); setErr(null);
    try { const r = await apiFetch<MacroAnalysisResult>("/api/macro/scores/recompute", { method: "POST", body: JSON.stringify({ session: session === "ALL" ? "LONDON" : session, persist: true }) }); setLatest({ ...r, analysis_id: r.analysis_id ?? "recalc" }); setScores(r.currencies); setCandidates(r.trade_candidates); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const tabs = [
    { id: "ranking" as Tab, label: "Ranking G8", icon: Trophy }, { id: "matriz" as Tab, label: "Divergence Matrix", icon: Grid3X3 }, { id: "candidatos" as Tab, label: "Trade Candidates", icon: Target },
    { id: "risco" as Tab, label: "Event Risk", icon: Siren }, { id: "historico" as Tab, label: "Histórico 7D/30D/90D", icon: LineChartIcon }
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <PageHeader icon={Trophy} title="Ranking G8" sub="Força relativa das 8 moedas calculada no backend a partir da QUALIDADE da evidência (nunca da quantidade de eventos). Escala −5..+5, com confiança 0–100%, momentum, drivers e histórico." right={
        <div className="flex items-center gap-2">
          <select value={session} onChange={(e) => setSession(e.target.value as Session | "ALL")} className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"><option value="ALL">Última análise</option>{SESSIONS.map((s) => <option key={s} value={s}>{SESSION_LABEL[s]}</option>)}</select>
          <Btn variant="ghost" onClick={load}><RefreshCw size={14} /></Btn>
          <Btn variant="ghost" onClick={recompute} disabled={!!busy} title="Reaplica pesos/decaimento aos eventos já interpretados — não chama IA nem reenvia imagens">Recalcular</Btn>
        </div>
      } />
      <div className="mb-4"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      {err && <div className="mb-4"><Notice kind="error">{err}</Notice></div>}
      {busy && <div className="mb-4"><Spinner label={busy} /></div>}
      {latest && <p className="text-[11px] text-text-muted mb-3">Base: análise #{latest.analysis_id} · {latest.date} · {SESSION_LABEL[latest.session]} · scoring {latest.meta.scoring_version}</p>}

      {tab === "ranking" && (
        <div className="space-y-4">
          {latest && <MacroSummary result={latest} />}
          <div className="grid gap-4 xl:grid-cols-3">
            <Section className="xl:col-span-2" title="Ranking de moedas" sub="Verde = forte · cinza = neutro · vermelho = fraca. Toque numa moeda para ver POR QUE ela recebeu esse score.">{scores ? <G8Ranking scores={scores} /> : <Spinner />}</Section>
            <Section title="Como ler" sub="Evidência, não contagem de eventos">
              <ul className="text-xs text-text-secondary space-y-1.5 list-disc pl-4">
                <li><b>Poucos eventos ≠ moeda fraca.</b> Sem dado vivo a moeda fica <i>neutra por ausência de evidência</i>, nunca penalizada.</li>
                <li>Escala <b>−5..+5</b>: força da EVIDÊNCIA macro — <b>não</b> é probabilidade de o preço subir.</li>
                <li>Força relativa do par = base − cotada. Bandas: &lt;0.5 neutro · 0.6–1.0 muito fraco · 1.1–1.5 moderado · 1.6–2.5 forte · 2.6+ muito forte.</li>
                <li><b>Confiança 0–100%</b> cai com evidência escassa, indicadores conflitantes e evento de alto impacto iminente.</li>
                <li><b>NARRATIVE_SHIFT</b>: reavalie posições abertas naquela moeda.</li>
                <li>Macro define <i>o que procurar</i> no SMC/ICT; <b>nunca</b> é gatilho de entrada.</li>
              </ul>
            </Section>
          </div>
        </div>
      )}
      {tab === "matriz" && <Section title="Macro Divergence Matrix" sub="Todas as 56 combinações (escala nativa). A lista de candidatos aplica as bandas de força relativa e a confiança da evidência.">{scores ? <DivergenceMatrix scores={scores} /> : <Spinner />}</Section>}
      {tab === "candidatos" && <Section title="Trade Candidates" sub="symbol · direction · strong/weak · divergência · confiança · prioridade · event risk. Clique para levar ao módulo SMC/ICT.">{candidates ? <TradeCandidates candidates={candidates} onPick={(c) => router.push(`/smc-ict?symbol=${c.symbol}&bias=${c.bias}&div=${c.macro_divergence}`)} /> : <Spinner />}</Section>}
      {tab === "risco" && <Section title="Event Risk" sub="LOW · MEDIUM · HIGH · EXTREME (as duas pernas do par com evento de alto impacto iminente)">{latest ? <EventRiskPanel eventRisk={latest.event_risk} pending={latest.pending_events} pairsToAvoid={latest.pairs_to_avoid} /> : <p className="text-xs text-text-muted">Sem análise salva para esta sessão.</p>}</Section>}
      {tab === "historico" && <Section title="Evolução dos scores" sub="Um ponto por moeda a cada análise/recalculo persistido"><ScoreHistoryChart /></Section>}
    </div>
  );
}
