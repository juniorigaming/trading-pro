"use client";
import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, ScanText, Sparkles, History, KeyRound, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import ImageDropzone from "@/components/ai/ImageDropzone";
import AiWaitPanel from "@/components/ai/AiWaitPanel";
import OcrValidationTable, { type OcrRow } from "@/components/ai/OcrValidationTable";
import G8Ranking from "@/components/ai/G8Ranking";
import { CandidateList } from "@/components/ai/DivergenceMatrix";
import EventRiskPanel from "@/components/ai/EventRiskPanel";
import { Btn, Notice, PageHeader, Section, Spinner, Tabs, SESSION_LABEL, inputCls, riskColor } from "@/components/ai/ui";
import { apiFetch, getToken, setToken, uid, type LocalImage } from "@/lib/ai/client";
import { SESSIONS, type EconomicEventInput, type MacroAnalysisResult, type Session } from "@/lib/ai/types";
import { useRouter } from "next/navigation";

type Step = "upload" | "validate" | "result";
interface AnalysisListItem { id: number; analysisDate: string; session: string; createdAt: string; inputType: string; imagesCount: number; eventsCount: number; model: string | null; promptVersion: string | null; scoringVersion: string | null; warnings: string[] }

function guessSession(): Session { const h = new Date().getUTCHours(); return h >= 22 || h < 7 ? "ASIA" : h < 12 ? "LONDON" : "NEW_YORK"; }

export default function AnaliseMacroPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"nova" | "historico">("nova");
  const [step, setStep] = useState<Step>("upload");
  const [session, setSession] = useState<Session>(guessSession());
  const [images, setImages] = useState<LocalImage[]>([]);
  const [rows, setRows] = useState<OcrRow[]>([]);
  const [ocrMeta, setOcrMeta] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<MacroAnalysisResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<"extract" | "analyze" | "open" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<AnalysisListItem[] | null>(null);
  const [token, setTok] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [withBrief, setWithBrief] = useState(true);
  const [showWarnings, setShowWarnings] = useState(false);
  const [showEvents, setShowEvents] = useState(false);

  useEffect(() => { const id = setTimeout(() => setTok(getToken()), 0); return () => clearTimeout(id); }, []);
  const loadHistory = useCallback(() => { apiFetch<AnalysisListItem[]>("/api/macro/analyses?limit=30").then(setHistory).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (tab === "historico") loadHistory(); }, [tab, loadHistory]);

  const extract = async () => {
    setErr(null); setBusy("Lendo screenshots com IA (OCR estruturado)..."); setBusyKind("extract");
    try {
      const fd = new FormData();
      images.forEach((i) => fd.append("images", i.file, i.file.name));
      fd.append("timezone", `${Intl.DateTimeFormat().resolvedOptions().timeZone} (GMT${-new Date().getTimezoneOffset() / 60})`);
      fd.append("referenceDate", new Date().toISOString().slice(0, 10));
      const r = await apiFetch<{ events: EconomicEventInput[]; meta: Record<string, unknown> }>("/api/ai/macro/extract", { method: "POST", body: fd });
      setRows(r.events.map((e) => ({ ...e, _id: uid(), _confirmed: !e.requires_manual_confirmation, _original: { actual: e.actual, forecast: e.forecast, previous: e.previous, event: e.event } })));
      setOcrMeta(r.meta); setStep("validate");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); setBusyKind(null); }
  };

  const analyze = async () => {
    const unconfirmed = rows.filter((r) => r.requires_manual_confirmation && !r._confirmed).length;
    if (unconfirmed > 0 && !confirm(`${unconfirmed} evento(s) de baixa confiança ainda não confirmados. Continuar mesmo assim?`)) return;
    setErr(null); setBusy("Salvando RAW → interpretando eventos → recalculando scores G8..."); setBusyKind("analyze");
    try {
      const userEdits: Record<string, unknown> = {};
      for (const r of rows) if (r.user_edited) userEdits[`${r.currency}|${r.event}`] = { from: r._original ?? null, to: { actual: r.actual, forecast: r.forecast, previous: r.previous, event: r.event } };
      const events = rows.filter((r) => r.event.trim()).map(({ _id, _confirmed, _original, ...e }) => { void _id; void _confirmed; void _original; return e; });
      const r = await apiFetch<MacroAnalysisResult>("/api/ai/macro/analyze", { method: "POST", body: JSON.stringify({ session, events, inputType: images.length ? "screenshot" : "manual", imagesCount: images.length, tzOffsetMinutes: -new Date().getTimezoneOffset(), userEdits: Object.keys(userEdits).length ? userEdits : null, withBrief }) });
      setResult(r); setStep("result");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); setBusyKind(null); }
  };

  const openAnalysis = async (id: number) => {
    setErr(null); setBusy("Carregando análise..."); setBusyKind("open");
    try { const r = await apiFetch<{ resultJson: MacroAnalysisResult }>(`/api/macro/analyses?id=${id}`); setResult(r.resultJson); setStep("result"); setTab("nova"); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); setBusyKind(null); }
  };

  const reset = () => { setStep("upload"); setImages([]); setRows([]); setResult(null); setOcrMeta(null); setErr(null); };
  const brief = result?.warnings.find((w) => w.startsWith("Brief: "));

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <PageHeader icon={BrainCircuit} title="Análise Macro IA" sub="Screenshots do calendário → OCR validado por você → interpretação ACTUAL vs FORECAST → Ranking G8, candidatos e risco de eventos. A IA apoia; não executa." right={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowToken((s) => !s)} className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary" title="Token de acesso às rotas IA (APP_API_TOKEN)"><KeyRound size={14} />{token ? "token ok" : "token"}</button>
          {showToken && <input value={token} onChange={(e) => { setTok(e.target.value); setToken(e.target.value); }} placeholder="APP_API_TOKEN (opcional)" className={`${inputCls} w-56`} type="password" />}
        </div>
      } />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Tabs tabs={[{ id: "nova", label: "Nova análise", icon: Sparkles }, { id: "historico", label: "Histórico", icon: History }]} value={tab} onChange={setTab} />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Sessão</span>
          {SESSIONS.map((s) => <button key={s} onClick={() => setSession(s)} className={`px-3 py-1.5 rounded-lg border font-bold ${session === s ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary"}`}>{SESSION_LABEL[s]}</button>)}
        </div>
      </div>

      {err && <div className="mb-4"><Notice kind="error">{err}</Notice></div>}
      {busyKind === "extract" && (
        <div className="mb-4">
          <AiWaitPanel
            steps={[
              "Enviando os screenshots para leitura",
              "Lendo data, hora, moeda e evento (OCR estruturado)",
              "Extraindo actual, forecast e previous",
              "Conferindo a confiança de cada campo",
              "Organizando os eventos para você validar",
            ]}
          />
        </div>
      )}
      {busyKind === "analyze" && (
        <div className="mb-4">
          <AiWaitPanel
            steps={[
              "Salvando os eventos (RAW)",
              "Interpretando ACTUAL vs FORECAST de cada evento",
              "Recalculando o Ranking G8",
              "Procurando divergências e candidatos",
              "Avaliando o risco de eventos por par",
            ]}
          />
        </div>
      )}
      {busy && busyKind !== "extract" && busyKind !== "analyze" && <div className="mb-4"><Spinner label={busy} /></div>}

      {tab === "historico" && (
        <Section title="Análises anteriores" sub="RAW e interpretação ficam separados; cada análise guarda modelo, prompt_version, scoring_version e suas edições." right={<Btn variant="ghost" onClick={loadHistory}><RefreshCw size={14} /></Btn>}>
          {!history ? <Spinner /> : history.length === 0 ? <p className="text-xs text-text-muted">Nenhuma análise ainda.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead className="text-text-muted text-[10px] uppercase"><tr><th className="text-left px-2 py-1">Data</th><th className="text-left px-2 py-1">Sessão</th><th className="text-left px-2 py-1">Origem</th><th className="text-left px-2 py-1">Eventos</th><th className="text-left px-2 py-1">Modelo</th><th className="text-left px-2 py-1">Versões</th><th></th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.id} className="border-t border-border">
                  <td className="px-2 py-1.5 text-text-primary">{new Date(h.createdAt).toLocaleString("pt-BR")}</td><td className="px-2 py-1.5">{SESSION_LABEL[h.session] ?? h.session}</td><td className="px-2 py-1.5">{h.inputType} ({h.imagesCount} img)</td><td className="px-2 py-1.5">{h.eventsCount}</td>
                  <td className="px-2 py-1.5 text-text-muted">{h.model ?? "—"}</td><td className="px-2 py-1.5 text-text-muted">{h.promptVersion ?? "—"} · {h.scoringVersion ?? "—"}</td>
                  <td className="px-2 py-1.5"><button onClick={() => openAnalysis(h.id)} className="text-accent font-bold">abrir</button></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Section>
      )}

      {tab === "nova" && step === "upload" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Section className="lg:col-span-2" title="1. Screenshots do calendário (Forex Factory ou similar)" sub="Envie quantos prints precisar (semana inteira, páginas diferentes). Eventos sem 'Actual' são tratados como pendentes.">
            <ImageDropzone images={images} onChange={setImages} max={10} />
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <Btn onClick={extract} disabled={!images.length || !!busy} loading={busyKind === "extract"} loadingLabel="Aguarde, analisando as informações..."><ScanText size={16} />Ler com IA ({images.length})</Btn>
              <Btn variant="ghost" onClick={() => { setRows([]); setStep("validate"); }}>Inserir eventos manualmente</Btn>
            </div>
          </Section>
          <Section title="Como funciona" sub="Pipeline determinístico com IA só onde é necessária">
            <ol className="text-xs text-text-secondary space-y-1.5 list-decimal pl-4">
              <li><b>OCR estruturado</b>: a IA lê data, hora, moeda, evento, impacto, actual/forecast/previous. Nunca inventa — campos ilegíveis ficam <i>null</i> com confiança baixa.</li>
              <li><b>Validação</b>: você confere, edita, adiciona ou remove. Suas edições são auditadas.</li>
              <li><b>RAW salvo</b> em <code>economic_events</code> (deduplicado por evento/horário; revisões substituem a versão anterior).</li>
              <li><b>Interpretação</b> (IA, 1x por evento): ACTUAL vs FORECAST prioritário, categoria, importância, confiança, implicação para a moeda. Nada de regra simplista “juros sobem = moeda sobe”.</li>
              <li><b>Score G8</b> (backend, sem IA): pesos por categoria/impacto/confiança, decaimento temporal, revisão por evento. Persistido com previous_score/delta/momentum.</li>
              <li><b>Candidatos</b>: 28 pares, divergência ≥ 1.0, prioridade por divergência × confiança, risco de eventos por perna.</li>
            </ol>
          </Section>
        </div>
      )}

      {tab === "nova" && step === "validate" && (
        <Section title="2. Validar leitura do OCR" sub={ocrMeta ? `${String(ocrMeta.provider ?? "")} · ${String(ocrMeta.model ?? "")} · ${String(ocrMeta.promptVersion ?? ocrMeta.prompt_version ?? "")} · fuso detectado: ${String(ocrMeta.detectedTimezone ?? "n/d")}${ocrMeta.notes ? ` · ${String(ocrMeta.notes)}` : ""}` : "Entrada manual"} right={<Btn variant="ghost" onClick={reset}>Recomeçar</Btn>}>
          <OcrValidationTable rows={rows} onChange={setRows} />
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Btn onClick={analyze} disabled={!rows.length || !!busy} loading={busyKind === "analyze"} loadingLabel="Aguarde, analisando as informações..."><Sparkles size={16} />Confirmar e analisar ({SESSION_LABEL[session]})</Btn>
            <label className="inline-flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={withBrief} onChange={(e) => setWithBrief(e.target.checked)} className="accent-[var(--user-accent)]" />Gerar brief narrativo da sessão (1 chamada extra de IA)</label>
          </div>
        </Section>
      )}

      {tab === "nova" && step === "result" && result && (() => {
        const otherWarnings = result.warnings.filter((w) => !w.startsWith("Brief: "));
        const risky = result.event_risk.filter((r) => r.level !== "LOW");
        const top = [...result.currencies].sort((a, b) => a.rank - b.rank);
        return (
          <div className="space-y-4">
            {/* Resumo em uma linha */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span className="text-text-primary font-bold">{SESSION_LABEL[result.session]} · {result.date}</span>
              <span>análise #{result.analysis_id}</span>
              <span>{result.meta.events_interpreted} eventos interpretados</span>
              {otherWarnings.length > 0 && (
                <button onClick={() => setShowWarnings((v) => !v)} className="inline-flex items-center gap-1 text-amber font-bold"><AlertTriangle size={12} />{otherWarnings.length} aviso{otherWarnings.length > 1 ? "s" : ""}{showWarnings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button>
              )}
              <div className="ml-auto flex gap-2"><Btn variant="ghost" onClick={() => router.push("/ranking-g8")}>Ranking completo</Btn><Btn variant="ghost" onClick={reset}>Nova análise</Btn></div>
            </div>
            {showWarnings && <div className="space-y-1.5">{otherWarnings.map((w, i) => <Notice key={i} kind="warn">{w}</Notice>)}</div>}

            {/* Leitura: forte vs fraca + brief curto */}
            <div className="glass-card p-4 flex flex-wrap items-center gap-4">
              <div><p className="text-[10px] uppercase tracking-wider text-text-muted">Mais forte</p><p className="text-xl font-extrabold text-emerald">{top[0].currency} <span className="text-sm">{top[0].score > 0 ? "+" : ""}{top[0].score.toFixed(2)}</span></p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-text-muted">Mais fraca</p><p className="text-xl font-extrabold text-rose">{top[7].currency} <span className="text-sm">{top[7].score > 0 ? "+" : ""}{top[7].score.toFixed(2)}</span></p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-text-muted">Candidatos</p><p className="text-xl font-extrabold text-text-primary">{result.trade_candidates.length}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-text-muted">Risco de eventos</p><p className="text-xl font-extrabold text-text-primary">{risky.length === 0 ? <span className="text-emerald">baixo</span> : risky.map((r) => <span key={r.currency} className={`inline-block mr-1 px-1.5 rounded text-xs border ${riskColor(r.level)}`}>{r.currency}</span>)}</p></div>
              {brief && <p className="basis-full text-xs text-text-secondary leading-snug border-t border-border pt-3 mt-1">{brief.replace("Brief: ", "").split(" — ")[0]}</p>}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Section title="Ranking G8" sub="Toque numa moeda para ver o que puxou o score"><G8Ranking scores={result.currencies} clean /></Section>
              <Section title="Trade Candidates" sub="Direção macro para buscar setup no SMC/ICT — não é entrada"><CandidateList candidates={result.trade_candidates} onPick={(c) => router.push(`/smc-ict?symbol=${c.symbol}&bias=${c.bias}&div=${c.macro_divergence}`)} /></Section>
            </div>

            <button onClick={() => setShowEvents((v) => !v)} className="w-full glass-card px-4 py-3 flex items-center justify-between text-sm font-bold text-text-primary">
              <span>Eventos pendentes e risco por moeda <span className="text-text-muted font-normal">({result.pending_events.length} pendentes)</span></span>{showEvents ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showEvents && <Section title="Event Risk" sub="Calculado por perna do par a partir dos eventos pendentes informados"><EventRiskPanel eventRisk={result.event_risk} pending={result.pending_events} pairsToAvoid={result.pairs_to_avoid} /></Section>}
          </div>
        );
      })()}
    </div>
  );
}
