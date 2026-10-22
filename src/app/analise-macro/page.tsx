"use client";
import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, ScanText, Sparkles, History, KeyRound, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import ImageDropzone from "@/components/ai/ImageDropzone";
import AiWaitPanel from "@/components/ai/AiWaitPanel";
import AuditPanel from "@/components/ai/AuditPanel";
import MacroSummary from "@/components/ai/MacroSummary";
import OcrValidationTable, { type OcrRow } from "@/components/ai/OcrValidationTable";
import G8Ranking from "@/components/ai/G8Ranking";
import { CandidateList } from "@/components/ai/DivergenceMatrix";
import { filterEligibleTradeCandidates } from "@/lib/macro/pairs";
import EventRiskPanel from "@/components/ai/EventRiskPanel";
import { Btn, Notice, PageHeader, Section, Spinner, Tabs, SESSION_LABEL, inputCls } from "@/components/ai/ui";
import { apiFetch, getToken, setToken, uid, type LocalImage } from "@/lib/ai/client";
import { announceAiDataUpdated, subscribeAiDataUpdated } from "@/lib/ai/refresh-events";
import { ALL_CURRENCIES, G8, SESSIONS, type EconomicEventInput, type MacroAnalysisResult, type Session } from "@/lib/ai/types";
import MacroMarketAnalysisView from "@/components/ai/MacroMarketAnalysisView";
import type { MarketMacroAnalysisResponse } from "@/lib/macro/market-analysis-types";
import { useRouter } from "next/navigation";

type Step = "upload" | "validate" | "result" | "market";
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
  const [marketResult, setMarketResult] = useState<MarketMacroAnalysisResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<"extract" | "analyze" | "market" | "open" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<AnalysisListItem[] | null>(null);
  const [token, setTok] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [withBrief, setWithBrief] = useState(true);
  const [showWarnings, setShowWarnings] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [auditMode, setAuditMode] = useState(false);
  const [extractionAudit, setExtractionAudit] = useState<unknown>(null);
  const [extractionRejected, setExtractionRejected] = useState(0);

  useEffect(() => { const id = setTimeout(() => setTok(getToken()), 0); return () => clearTimeout(id); }, []);
  const loadHistory = useCallback(() => { apiFetch<AnalysisListItem[]>("/api/macro/analyses?limit=30").then(setHistory).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (tab === "historico") loadHistory(); }, [tab, loadHistory]);
  useEffect(() => subscribeAiDataUpdated(() => { if (tab === "historico") loadHistory(); }), [tab, loadHistory]);

  const extract = async () => {
    setErr(null); setBusy("Lendo screenshots com IA (OCR estruturado)..."); setBusyKind("extract");
    try {
      const fd = new FormData();
      images.forEach((i) => fd.append("images", i.file, i.file.name));
      fd.append("timezone", `${Intl.DateTimeFormat().resolvedOptions().timeZone} (GMT${-new Date().getTimezoneOffset() / 60})`);
      fd.append("referenceDate", new Date().toISOString().slice(0, 10));
      const r = await apiFetch<{ events: EconomicEventInput[]; meta: Record<string, unknown>; audit?: { rejected?: unknown[] } & Record<string, unknown> }>("/api/ai/macro/extract", { method: "POST", body: fd });
      setExtractionAudit(r.audit ?? null); setExtractionRejected(r.audit?.rejected?.length ?? 0);
      setRows(r.events.map((e) => ({ ...e, _id: uid(), _confirmed: !e.requires_manual_confirmation, _original: { actual: e.actual, forecast: e.forecast, previous: e.previous, event: e.event } })));
      setOcrMeta(r.meta); setStep("validate");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); setBusyKind(null); }
  };

  const analyze = async () => {
    const unconfirmed = rows.filter((r) => r.requires_manual_confirmation && !r._confirmed).length;
    if (unconfirmed > 0 && !confirm(`${unconfirmed} evento(s) de baixa confiança ainda não confirmados. Continuar mesmo assim?`)) return;
    setErr(null); setBusy("Salvando RAW → classificando por regra → recalculando scores da análise → checando consistência..."); setBusyKind("analyze");
    try {
      const userEdits: Record<string, unknown> = {};
      for (const r of rows) if (r.user_edited) userEdits[`${r.currency}|${r.event}`] = { from: r._original ?? null, to: { actual: r.actual, forecast: r.forecast, previous: r.previous, event: r.event } };
      const events = rows.filter((r) => r.event.trim()).map(({ _id, _confirmed, _original, ...e }) => { void _id; void _confirmed; void _original; return e; });
      const r = await apiFetch<MacroAnalysisResult>("/api/ai/macro/analyze", { method: "POST", body: JSON.stringify({ session, events, inputType: images.length ? "screenshot" : "manual", imagesCount: images.length, tzOffsetMinutes: -new Date().getTimezoneOffset(), userEdits: Object.keys(userEdits).length ? userEdits : null, withBrief, extraction: extractionAudit }) });
      setMarketResult(null); setResult(r); setStep("result"); announceAiDataUpdated();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); setBusyKind(null); }
  };

  const analyzeMarket = async () => {
    const excludedUnconfirmedCount = rows.filter((r) => r.event.trim() && (G8 as readonly string[]).includes(r.currency) && !r._confirmed).length;
    const supplementalEvents = rows
      .filter((r) => r._confirmed && (G8 as readonly string[]).includes(r.currency) && r.event.trim())
      .map((r) => ({
        date: r.date, time: r.time, currency: r.currency as (typeof G8)[number], event: r.event.trim(), impact: r.impact,
        actual: r.actual, forecast: r.forecast, previous: r.previous, source: r.source,
        ocrConfidence: r.ocr_confidence ?? null, userConfirmed: true as const,
      }));
    setErr(null);
    setBusy("Consultando dados de força e contexto macro...");
    setBusyKind("market");
    try {
      const report = await apiFetch<MarketMacroAnalysisResponse>("/api/ai/macro/market-analysis", {
        method: "POST",
        body: JSON.stringify({ supplementalEvents, excludedUnconfirmedCount, session, tzOffsetMinutes: -new Date().getTimezoneOffset() }),
      });
      setResult(null); setMarketResult(report); setStep("market"); announceAiDataUpdated();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); setBusyKind(null); }
  };

  const openAnalysis = async (id: number) => {
    setErr(null); setBusy("Carregando análise..."); setBusyKind("open");
    try { const r = await apiFetch<{ resultJson: MacroAnalysisResult }>(`/api/macro/analyses?id=${id}`); setMarketResult(null); setResult(r.resultJson); setStep("result"); setTab("nova"); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); setBusyKind(null); }
  };

  const reset = () => { setStep("upload"); setImages([]); setRows([]); setResult(null); setMarketResult(null); setOcrMeta(null); setErr(null); };
  const brief = result?.warnings.find((w) => w.startsWith("Brief: "));

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <PageHeader icon={BrainCircuit} title="Análise Macro IA" sub="Ranking de força das oito moedas G8 em D1/W1. Print do calendário é opcional." right={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowToken((s) => !s)} className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary" title="Token de acesso às rotas IA (APP_API_TOKEN)"><KeyRound size={14} />{token ? "token ok" : "token"}</button>
          {showToken && <input value={token} onChange={(e) => { setTok(e.target.value); setToken(e.target.value); }} placeholder="APP_API_TOKEN (opcional)" className={`${inputCls} w-56`} type="password" />}
        </div>
      } />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Tabs tabs={[{ id: "nova", label: "Nova análise", icon: Sparkles }, { id: "historico", label: "Histórico", icon: History }]} value={tab} onChange={setTab} />
        {tab === "nova" && step === "validate" && <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Sessão do calendário</span>
          {SESSIONS.map((s) => <button key={s} onClick={() => setSession(s)} className={`px-3 py-1.5 rounded-lg border font-bold ${session === s ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary"}`}>{SESSION_LABEL[s]}</button>)}
        </div>}
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
      {busyKind === "market" && (
        <div className="mb-4">
          <AiWaitPanel
            steps={[
              "Carregando a força D1 e W1 para as oito moedas G8",
              "Validando atualização e completude dos dados",
              "Preparando o ranking e a visualização",
            ]}
          />
        </div>
      )}
      {busy && busyKind !== "extract" && busyKind !== "analyze" && busyKind !== "market" && <div className="mb-4"><Spinner label={busy} /></div>}

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
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Section className="lg:col-span-2" title="Leitura atual do mercado" sub="Gere o ranking de força D1/W1 agora. Nenhum print é necessário.">
              <p className="max-w-3xl text-xs leading-relaxed text-text-secondary">A leitura combina os rankings de força D1/W1 com o contexto macro disponível. Prints do calendário são opcionais e não bloqueiam a análise.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Btn onClick={analyzeMarket} disabled={!!busy} loading={busyKind === "market"} loadingLabel="Carregando dados atuais..."><BrainCircuit size={16} />Gerar análise atual</Btn>
                <Btn variant="ghost" onClick={() => { setRows([]); setStep("validate"); }}>Adicionar eventos manualmente (opcional)</Btn>
              </div>
              <p className="mt-3 text-[10px] text-text-muted">Ao concluir, os eventos confirmados são salvos e o score macro é recalculado sem chamada extra de IA. Força D1/W1 permanece separada.</p>
            </Section>
            <Section title="O que você verá" sub="Visão resumida e acionável">
              <ul className="space-y-2 text-xs text-text-secondary">
                <li><b>Ranking:</b> oito moedas ordenadas por força, com alternância D1/W1.</li>
                <li><b>Top 3 pares:</b> na página Ranking G8, com confirmação nos dois períodos.</li>
                <li><b>Dados ausentes:</b> ficam sem score; não são estimados.</li>
              </ul>
            </Section>
          </div>

          <details className="glass-card p-4 md:p-5">
            <summary className="cursor-pointer text-sm font-bold text-text-primary">Complementar com print ou evento de calendário (opcional)</summary>
            <p className="mt-2 text-xs text-text-muted">Use apenas para acrescentar eventos confirmados. A imagem é complementar e não é necessária para gerar os rankings.</p>
            <div className="mt-3"><ImageDropzone images={images} onChange={setImages} max={10} /></div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Btn onClick={extract} disabled={!images.length || !!busy} loading={busyKind === "extract"} loadingLabel="Lendo print..."> <ScanText size={16} />Ler print e revisar eventos{images.length ? ` (${images.length})` : ""}</Btn>
              <Btn variant="ghost" onClick={() => { setRows([]); setStep("validate"); }}>Adicionar evento sem print</Btn>
            </div>
          </details>
        </div>
      )}

      {tab === "nova" && step === "validate" && (
        <Section title="2. Validar leitura do OCR" sub={ocrMeta ? `${String(ocrMeta.provider ?? "")} · ${String(ocrMeta.model ?? "")} · ${String(ocrMeta.promptVersion ?? ocrMeta.prompt_version ?? "")} · fuso detectado: ${String(ocrMeta.detectedTimezone ?? "n/d")}${ocrMeta.notes ? ` · ${String(ocrMeta.notes)}` : ""}` : "Entrada manual"} right={<Btn variant="ghost" onClick={reset}>Recomeçar</Btn>}>
          <OcrValidationTable rows={rows} onChange={setRows} currencies={ALL_CURRENCIES} />
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {extractionRejected > 0 && <p className="text-[11px] text-amber mb-2">{extractionRejected} linha(s) foram rejeitadas pela validação do código (moeda/evento/valor não constam no texto transcrito ou não foram confirmadas na imagem). Veja no modo auditoria após analisar.</p>}
            <Btn onClick={analyze} disabled={!rows.length || !!busy} loading={busyKind === "analyze"} loadingLabel="Salvando e recalculando..."><Sparkles size={16} />Salvar eventos e atualizar Ranking G8</Btn>
            <Btn variant="ghost" onClick={analyzeMarket} disabled={!!busy} loading={busyKind === "market"} loadingLabel="Carregando dados atuais..."><BrainCircuit size={16} />Gerar resumo atual com estes eventos</Btn>
            <label className="inline-flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={withBrief} onChange={(e) => setWithBrief(e.target.checked)} className="accent-[var(--user-accent)]" />Gerar brief narrativo da sessão (1 chamada extra de IA)</label>
            <p className="w-full text-[10px] text-text-muted">Somente eventos confirmados atualizam o score por eventos; o recálculo é determinístico e não faz chamada extra de IA. A força D1/W1 continua em aba separada.</p>
          </div>
        </Section>
      )}

      {tab === "nova" && step === "market" && marketResult && <MacroMarketAnalysisView report={marketResult} onBack={() => setStep(rows.length ? "validate" : "upload")} />}

      {tab === "nova" && step === "result" && result && (() => {
        const otherWarnings = result.warnings.filter((w) => !w.startsWith("Brief: "));
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
              <div className="ml-auto flex gap-2"><Btn variant={auditMode ? "primary" : "ghost"} onClick={() => setAuditMode((v) => !v)}>{auditMode ? "Fechar auditoria" : "Modo auditoria"}</Btn><Btn variant="ghost" onClick={() => router.push("/ranking-g8")}>Ranking completo</Btn><Btn variant="ghost" onClick={reset}>Nova análise</Btn></div>
            </div>
            {showWarnings && <div className="space-y-1.5">{otherWarnings.map((w, i) => <Notice key={i} kind="warn">{w}</Notice>)}</div>}

            {result.analysis_status === "ANALISE_INSUFICIENTE" && (
              <div className="glass-card p-4 border border-rose/50">
                <p className="text-sm font-extrabold text-rose mb-1">ANÁLISE INSUFICIENTE</p>
                <p className="text-xs text-text-secondary mb-2">A validação de consistência falhou, então este resultado <b>não</b> é apresentado como ranking confiável. Nenhuma moeda recebeu score sem evidência.</p>
                <ul className="space-y-0.5">{(result.audit?.checks ?? []).filter((c) => !c.passed).map((c) => <li key={c.id} className="text-[11px] text-text-muted">• {c.label}: {c.detail}</li>)}</ul>
              </div>
            )}
            {auditMode && result.audit && <Section title="Modo auditoria" sub="Do screenshot ao ranking: cada etapa, cada rejeição e cada score"><AuditPanel result={result} previews={images.map((i) => ({ id: i.id, previewUrl: i.previewUrl, name: i.label }))} /></Section>}
            {result.analysis_status !== "ANALISE_INSUFICIENTE" && <>
            {/* Resumo macro consolidado (backend): forte/fraca, risco, Top 3 long/short, pares a evitar, alertas */}
            <MacroSummary result={result} compact />
            {brief && <p className="glass-card p-4 text-xs text-text-secondary leading-snug">{brief.replace("Brief: ", "").split(" — ")[0]}</p>}

            <div className="grid gap-4 xl:grid-cols-2">
              <Section title="Ranking G8" sub="Toque numa moeda para ver o que puxou o score"><G8Ranking scores={result.currencies} clean /></Section>
              <Section title="Trade Candidates" sub="Direção macro para buscar setup no SMC/ICT — não é entrada"><CandidateList candidates={filterEligibleTradeCandidates(result.trade_candidates, result.analysis_status === "OK", result.pairs_to_avoid.map((p) => p.symbol))} calendarProvided={result.calendar_status === "PROVIDED"} onPick={(c) => router.push(`/smc-ict?symbol=${c.symbol}&bias=${c.bias}&div=${c.macro_divergence}`)} /></Section>
            </div>
            {(result.extra_currencies?.length ?? 0) > 0 && (
              <Section title="Moedas fora do G8 com evidência disponível" sub="Avaliadas pelo mesmo motor (surpresa × impacto × confiança). Não entram no ranking G8 nem nos pares — servem de contexto (ex.: CNY para AUD/NZD).">
                <G8Ranking scores={result.extra_currencies!} clean />
              </Section>
            )}

            <button onClick={() => setShowEvents((v) => !v)} className="w-full glass-card px-4 py-3 flex items-center justify-between text-sm font-bold text-text-primary">
              <span>Eventos pendentes e risco por moeda <span className="text-text-muted font-normal">({result.pending_events.length} pendentes)</span></span>{showEvents ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showEvents && <Section title="Event Risk" sub="Risco por moeda: janela intraday de 4h; pares: 14h. Sem calendário informado, o risco não é tratado como LOW."><EventRiskPanel eventRisk={result.event_risk} pending={result.pending_events} pairsToAvoid={result.pairs_to_avoid} calendarStatus={result.calendar_status} /></Section>}
            </>}
          </div>
        );
      })()}
    </div>
  );
}
