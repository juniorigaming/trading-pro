"use client";
import { useCallback, useEffect, useState } from "react";
import { Trophy, Grid3X3, Siren, LineChart as LineChartIcon, RefreshCw, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import G8Ranking from "@/components/ai/G8Ranking";
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
      <PageHeader icon={Trophy} title="Ranking G8" sub="Força relativa das 8 moedas calculada no backend a partir dos eventos interpretados. Score −2..+2, com momentum, drivers e histórico." right={
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
        <div className="grid gap-4 xl:grid-cols-3">
          <Section className="xl:col-span-2" title="Ranking" sub="Verde = forte · cinza = neutro · vermelho = fraca. Seta = variação vs score anterior.">{scores ? <G8Ranking scores={scores} /> : <Spinner />}</Section>
          <Section title="Leitura" sub="Como usar sem virar sinal">
            <ul className="text-xs text-text-secondary space-y-1.5 list-disc pl-4">
              <li>Procure <b>divergência ≥ 1.0</b> entre moeda forte e fraca; ≥ 1.5 é prioridade.</li>
              <li><b>NARRATIVE_SHIFT</b> = delta ≥ 1.0 numa única atualização: reavalie posições abertas naquela moeda.</li>
              <li>Confiança LOW = poucos eventos interpretados; não force operações.</li>
              <li>O score só muda com novos dados interpretados ou mudança de pesos — não com preço.</li>
              <li>Direção macro define <i>o que procurar</i> no SMC/ICT; <b>nunca</b> é gatilho de entrada.</li>
            </ul>
          </Section>
        </div>
      )}
      {tab === "matriz" && <Section title="Macro Divergence Matrix" sub="Todas as 56 combinações; a tabela de candidatos abaixo lista apenas pares negociáveis com |Δ| ≥ 1.0">{scores ? <DivergenceMatrix scores={scores} /> : <Spinner />}</Section>}
      {tab === "candidatos" && <Section title="Trade Candidates" sub="symbol · direction · strong/weak · divergência · confiança · prioridade · event risk. Clique para levar ao módulo SMC/ICT.">{candidates ? <TradeCandidates candidates={candidates} onPick={(c) => router.push(`/smc-ict?symbol=${c.symbol}&bias=${c.bias}&div=${c.macro_divergence}`)} /> : <Spinner />}</Section>}
      {tab === "risco" && <Section title="Event Risk" sub="LOW · MEDIUM · HIGH · EXTREME (as duas pernas do par com evento de alto impacto iminente)">{latest ? <EventRiskPanel eventRisk={latest.event_risk} pending={latest.pending_events} pairsToAvoid={latest.pairs_to_avoid} /> : <p className="text-xs text-text-muted">Sem análise salva para esta sessão.</p>}</Section>}
      {tab === "historico" && <Section title="Evolução dos scores" sub="Um ponto por moeda a cada análise/recalculo persistido"><ScoreHistoryChart /></Section>}
    </div>
  );
}
