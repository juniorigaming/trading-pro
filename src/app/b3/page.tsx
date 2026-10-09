"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, BarChart3, CalendarClock, DollarSign, Gauge, Globe2, Landmark, LineChart, RefreshCw, ScanLine, Sparkles, Target } from "lucide-react";
import ImageDropzone from "@/components/ai/ImageDropzone";
import OcrValidationTable, { type OcrRow } from "@/components/ai/OcrValidationTable";
import ScoreHistoryChart from "@/components/ai/ScoreHistoryChart";
import { Badge, Btn, Notice, PageHeader, Section, Spinner, Tabs, fmtScore, inputCls, scoreBg, scoreColor } from "@/components/ai/ui";
import { AlertList, CandidateCards, ComponentTable, DiCurvePanel, EventRiskB3, InstrumentHeader, IntermarketTable, REGIME_LABEL, ScoreCards, regimeColor } from "@/components/b3/B3Cards";
import { DiCurveForm, MarketForm, emptyMarkets, toDiInputs, toMarketInputs, type DiDraft, type MarketDraft } from "@/components/b3/B3Inputs";
import { apiFetch, uid, type LocalImage } from "@/lib/ai/client";
import type { EconomicEventInput } from "@/lib/ai/types";
import type { DiContractConfig } from "@/lib/b3/config";
import { B3_SESSIONS, B3_SESSION_LABEL, guessB3Session, type B3AnalysisResult, type B3Candidate, type B3Session, type DiCause, type DiContractInput } from "@/lib/b3/types";

const TABS = [
  { id: "overview", label: "Visão Geral", icon: Gauge }, { id: "win", label: "WIN", icon: BarChart3 }, { id: "dol", label: "DOL/WDO", icon: DollarSign }, { id: "brasil", label: "Brasil Macro", icon: Landmark },
  { id: "exterior", label: "Exterior", icon: Globe2 }, { id: "di", label: "Curva DI", icon: LineChart }, { id: "intermarket", label: "Intermarket", icon: Activity }, { id: "candidates", label: "Trade Candidates", icon: Target }, { id: "event-risk", label: "Event Risk", icon: CalendarClock },
] as const;
type TabId = (typeof TABS)[number]["id"];
const B3_CCY = ["BRL", "USD", "CNY"] as const;
const classBg = (c: string) => (/BULLISH/.test(c) ? "bg-emerald/15 text-emerald border-emerald/40" : /BEARISH/.test(c) ? "bg-rose/15 text-rose border-rose/40" : "bg-surface-2 text-text-secondary border-border");
interface HistItem { id: number; analysis_date: string; session: string; created_at: string; input_type: string; events_count: number; regime: string | null; win_score: number | null; dol_divergence: number | null; model: string | null }

function B3Inner() {
  const sp = useSearchParams(); const router = useRouter();
  const tab = (TABS.some((t) => t.id === sp.get("tab")) ? sp.get("tab") : "overview") as TabId;
  const setTab = (t: TabId) => router.replace(`/b3?tab=${t}`);
  const [session, setSession] = useState<B3Session>(() => guessB3Session());
  const [latest, setLatest] = useState<B3AnalysisResult | null | undefined>(undefined);
  const [history, setHistory] = useState<HistItem[] | null>(null);
  const [contracts, setContracts] = useState<DiContractConfig[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // entradas
  const [images, setImages] = useState<LocalImage[]>([]);
  const [rows, setRows] = useState<OcrRow[]>([]);
  const [di, setDi] = useState<DiDraft[]>([]);
  const [diCause, setDiCause] = useState<DiCause | "">("");
  const [markets, setMarkets] = useState<MarketDraft[]>(emptyMarkets);
  const [withBrief, setWithBrief] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [contractDraft, setContractDraft] = useState("");

  const load = useCallback(() => {
    apiFetch<B3AnalysisResult | null>("/api/b3/analyses?latest=1").then((r) => { setLatest(r); setErr(null); }).catch((e) => { setLatest(null); setErr(`Não consegui carregar a última análise B3: ${e.message}`); });
    apiFetch<{ di_contracts: DiContractConfig[] }>("/api/b3/settings").then((s) => { setContracts(s.di_contracts); setContractDraft(s.di_contracts.map((c) => `${c.code}:${c.tenor}`).join(", ")); }).catch(() => undefined);
    apiFetch<HistItem[]>("/api/b3/analyses?limit=20").then(setHistory).catch(() => setHistory([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setOk(m); setTimeout(() => setOk(null), 4000); };
  const run = async (opts: { events?: EconomicEventInput[]; inputType: "screenshot" | "manual" | "recompute" | "structured" } = { inputType: "recompute" }) => {
    setErr(null); setBusy(opts.events?.length ? "Salvando eventos → interpretando (prompt Brasil) → scores USD/BRL → DI → WIN/DOL..." : "Recalculando WIN/DOL com os dados persistidos...");
    try {
      const diInputs = toDiInputs(di); const mk = toMarketInputs(markets);
      const r = await apiFetch<B3AnalysisResult>("/api/ai/b3/analyze", { method: "POST", body: JSON.stringify({ session, events: opts.events, inputType: opts.inputType, imagesCount: images.length, tzOffsetMinutes: -new Date().getTimezoneOffset(), withBrief, diCurve: diInputs.length ? { contracts: diInputs, cause: diCause || null } : null, markets: mk.length ? mk : null }) });
      setLatest(r); setRows([]); setImages([]); setMarkets(emptyMarkets()); setDi([]); setTab("overview"); flash(`Análise ${r.analysis_id ?? ""} concluída — regime ${REGIME_LABEL[r.regime]}.`);
      apiFetch<HistItem[]>("/api/b3/analyses?limit=20").then(setHistory).catch(() => undefined);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const extractCalendar = async () => {
    setErr(null); setBusy("Lendo calendário (BR / EUA / China) com IA...");
    try {
      const fd = new FormData(); images.forEach((i) => fd.append("images", i.file, i.file.name));
      fd.append("timezone", `${Intl.DateTimeFormat().resolvedOptions().timeZone} (GMT${-new Date().getTimezoneOffset() / 60})`); fd.append("referenceDate", new Date().toISOString().slice(0, 10)); fd.append("currencies", B3_CCY.join(","));
      const r = await apiFetch<{ events: EconomicEventInput[] }>("/api/ai/macro/extract", { method: "POST", body: fd });
      setRows(r.events.map((e) => ({ ...e, _id: uid(), _confirmed: !e.requires_manual_confirmation, _original: { actual: e.actual, forecast: e.forecast, previous: e.previous, event: e.event } })));
      if (!r.events.length) setErr("Nenhum evento legível nas imagens. Confira se o print mostra data, hora, moeda e valores.");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const analyzeWithEvents = () => {
    const unconfirmed = rows.filter((r) => r.requires_manual_confirmation && !r._confirmed).length;
    if (unconfirmed > 0 && !confirm(`${unconfirmed} evento(s) de baixa confiança não confirmados. Continuar?`)) return;
    const events = rows.filter((r) => r.event.trim()).map(({ _id, _confirmed, _original, ...e }) => { void _id; void _confirmed; void _original; return e; });
    void run({ events, inputType: images.length ? "screenshot" : "manual" });
  };
  const saveDi = async () => { setErr(null); setBusy("Salvando curva DI..."); try { await apiFetch("/api/b3/di-curve", { method: "POST", body: JSON.stringify({ contracts: toDiInputs(di), cause: diCause || null, source: "manual" }) }); flash("Curva DI salva. Rode 'Recalcular' para atualizar WIN/DOL."); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); } };
  const saveMarkets = async () => { setErr(null); setBusy("Salvando leituras..."); try { const r = await apiFetch<{ saved: number }>("/api/b3/markets", { method: "POST", body: JSON.stringify({ rows: toMarketInputs(markets) }) }); flash(`${r.saved} leitura(s) salva(s). Rode 'Recalcular' para atualizar.`); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); } };
  const saveContracts = async () => {
    const list = contractDraft.split(",").map((s) => s.trim()).filter(Boolean).map((s) => { const [code, tenor] = s.split(":"); return { code: code.toUpperCase(), tenor: (tenor ?? "MID").toUpperCase() }; });
    setErr(null); try { const r = await apiFetch<{ di_contracts: DiContractConfig[] }>("/api/b3/settings", { method: "PUT", body: JSON.stringify({ di_contracts: list }) }); setContracts(r.di_contracts); setDi([]); flash("Contratos DI atualizados."); } catch (e) { setErr((e as Error).message); }
  };
  const onDiFromOcr = (c: DiContractInput[]) => setDi(c.map((x) => ({ code: x.code, tenor: x.tenor, rate: x.rate == null ? "" : String(x.rate), change_bp: x.change_bp == null ? "" : String(x.change_bp) })));
  const openSmc = (c: B3Candidate) => router.push(`/smc-ict?symbol=${c.instrument}&bias=${c.bias}&div=${c.score}`);
  const r = latest ?? null;
  const brazilCats = useMemo(() => (r ? Object.entries(r.brazil_macro.categories).sort((a, b) => b[1].n - a[1].n) : []), [r]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <PageHeader icon={Landmark} title="B3 Macro — WIN & DOL" sub="Macro Brasil + EUA + Curva DI + Câmbio + Commodities + China + Risk sentiment + Fluxo → regime B3 → viés WIN → viés DOL → SMC/ICT. Macro é contexto; o gatilho é sempre técnico." right={
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="ghost" onClick={() => void run()} disabled={!!busy} title="Recalcula com eventos, DI e mercados já salvos (sem IA nova se nada pendente)"><RefreshCw size={14} />Recalcular</Btn>
          <Btn variant="ghost" onClick={() => setShowSettings((s) => !s)} title="Contratos DI configuráveis">DI: {contracts.map((c) => c.code).join("/") || "..."}</Btn>
        </div>
      } />
      {showSettings && <div className="glass-card p-4 mb-4 flex flex-wrap items-center gap-2 text-xs"><span className="text-text-muted">Contratos (código:vértice, separados por vírgula)</span><input value={contractDraft} onChange={(e) => setContractDraft(e.target.value)} className={`${inputCls} max-w-md`} placeholder="DI1F27:SHORT, DI1F29:MID, DI1F31:LONG" /><Btn onClick={saveContracts}>Salvar</Btn></div>}

      <div className="flex flex-col gap-3 mb-4">
        <Tabs tabs={[...TABS]} value={tab} onChange={setTab} wrap />
        <div className="flex items-center gap-1.5 text-xs flex-wrap"><span className="text-text-muted mr-1">Sessão</span>{B3_SESSIONS.map((s) => <button key={s} onClick={() => setSession(s)} className={`px-2.5 py-1.5 rounded-lg border font-bold ${session === s ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary"}`}>{B3_SESSION_LABEL[s]}</button>)}</div>
      </div>

      {busy && <div className="mb-3"><Spinner label={busy} /></div>}
      {err && <div className="mb-3"><Notice kind="error">{err} <button className="underline font-bold ml-1" onClick={() => { setErr(null); load(); }}>Tentar de novo</button></Notice></div>}
      {ok && <div className="mb-3"><Notice kind="info">{ok}</Notice></div>}
      {latest === undefined && <Spinner label="Carregando última análise..." />}
      {latest === null && tab !== "brasil" && tab !== "exterior" && tab !== "di" && <div className="mb-4"><Notice kind="warn">Ainda não há análise B3. Comece em <button className="underline font-bold" onClick={() => setTab("brasil")}>Brasil Macro</button> (calendário BR/EUA), <button className="underline font-bold" onClick={() => setTab("di")}>Curva DI</button> e <button className="underline font-bold" onClick={() => setTab("exterior")}>Exterior</button> — depois clique em Recalcular.</Notice></div>}

      {/* ---------------- Visão Geral ---------------- */}
      {tab === "overview" && r && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs"><Badge className={regimeColor(r.regime)}>regime: {REGIME_LABEL[r.regime]}</Badge><Badge className="bg-surface-2 text-text-secondary border-border">{r.date} · {B3_SESSION_LABEL[r.session]}</Badge><Badge className="bg-surface-2 text-text-secondary border-border">motor {r.meta.scoring_version}{r.meta.model ? ` · ${r.meta.model}` : ""}</Badge><Badge className="bg-surface-2 text-text-secondary border-border">{r.meta.events_interpreted} eventos interpretados</Badge></div>
          <ScoreCards r={r} />
          <AlertList alerts={r.alerts} />
          {r.brief && <Section title={r.brief.headline} sub="Brief gerado pela IA sobre os números calculados pelo motor (não altera scores)."><div className="grid md:grid-cols-3 gap-3 text-sm text-text-secondary leading-relaxed"><div><div className="text-[11px] uppercase font-bold text-text-muted mb-1">Regime</div>{r.brief.regime_narrative}</div><div><div className="text-[11px] uppercase font-bold text-text-muted mb-1">WIN</div>{r.brief.win_view}</div><div><div className="text-[11px] uppercase font-bold text-text-muted mb-1">DOL</div>{r.brief.dol_view}</div></div>{r.brief.conflicts.length > 0 && <div className="mt-3 text-xs text-amber">Conflitos: {r.brief.conflicts.join(" · ")}</div>}</Section>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Mudanças vs análise anterior" sub="Spec: cada sessão registra o que mudou.">{r.changes_since_previous.length ? <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">{r.changes_since_previous.map((c, i) => <li key={i}>{c}</li>)}</ul> : <p className="text-xs text-text-muted">Primeira análise ou sem mudanças relevantes.</p>}</Section>
            <Section title="Avisos do motor">{r.warnings.length ? <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : <p className="text-xs text-text-muted">Sem avisos.</p>}</Section>
          </div>
          <Section title="Histórico de scores (USD · BRL · WIN · DOL)" sub="USD vem do motor G8 (idêntico ao Ranking G8). DOL = divergência USD − BRL."><ScoreHistoryChart endpoint="/api/b3/scores/history" series={["USD", "BRL", "WIN", "DOL"]} /></Section>
          {history && history.length > 0 && <Section title="Análises recentes"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-text-muted border-b border-border"><th className="py-1.5 pr-2">#</th><th className="py-1.5 pr-2">Data</th><th className="py-1.5 pr-2">Sessão</th><th className="py-1.5 pr-2">Regime</th><th className="py-1.5 pr-2">WIN</th><th className="py-1.5 pr-2">DOL div.</th><th className="py-1.5 pr-2">Eventos</th><th className="py-1.5">Modelo</th></tr></thead><tbody>{history.map((h) => <tr key={h.id} className="border-b border-border/50 hover:bg-surface-2 cursor-pointer" onClick={() => { setBusy("Carregando..."); apiFetch<B3AnalysisResult>(`/api/b3/analyses?id=${h.id}`).then(setLatest).catch((e) => setErr(e.message)).finally(() => setBusy(null)); }}><td className="py-1.5 pr-2 text-text-muted">{h.id}</td><td className="py-1.5 pr-2">{h.analysis_date}</td><td className="py-1.5 pr-2">{B3_SESSION_LABEL[h.session as B3Session] ?? h.session}</td><td className="py-1.5 pr-2">{h.regime ? <Badge className={regimeColor(h.regime)}>{REGIME_LABEL[h.regime]}</Badge> : "—"}</td><td className={`py-1.5 pr-2 font-bold ${scoreColor(h.win_score ?? 0)}`}>{fmtScore(h.win_score)}</td><td className={`py-1.5 pr-2 font-bold ${scoreColor(h.dol_divergence ?? 0)}`}>{fmtScore(h.dol_divergence)}</td><td className="py-1.5 pr-2">{h.events_count}</td><td className="py-1.5 text-text-muted">{h.model ?? "—"}</td></tr>)}</tbody></table></div></Section>}
        </div>
      )}

      {/* ---------------- WIN ---------------- */}
      {tab === "win" && r && (
        <div className="space-y-4">
          <InstrumentHeader name="WIN Macro Score" s={r.win} extra={<Badge className={regimeColor(r.regime)}>{REGIME_LABEL[r.regime]}</Badge>} />
          <ComponentTable comps={r.win.components} title="Componentes do WIN (pesos configuráveis em /api/b3/settings)" sub="score × peso, só com dado. BRAZIL_* e BCB vêm dos eventos; DI da curva; US_*/DXY/commodities das leituras; BRL do score BRL." />
          <Section title="Intermarket relevante para o WIN"><IntermarketTable rows={r.intermarket} filter="WIN" /></Section>
          <Section title="Candidatos WIN" sub="Só aparece com |score| ≥ 0.75 e event risk abaixo de EXTREME."><CandidateCards cands={r.trade_candidates.filter((c) => c.instrument === "WIN")} onOpenSmc={openSmc} /></Section>
          <Notice kind="info">Checklist WIN (aplicado no SMC/ICT): macro alinhada · DI não contra · DOL não contra · exterior não contra · sem evento-chave ≤ 60 min · sweep → displacement → MSS → reteste. ≥2 itens macro contra ⇒ READY vira WAIT e grade A vira B.</Notice>
        </div>
      )}

      {/* ---------------- DOL ---------------- */}
      {tab === "dol" && r && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="glass-card p-4"><div className="text-[11px] uppercase font-bold text-text-muted">USD (motor G8)</div><div className={`text-3xl font-extrabold ${scoreColor(r.usd.score)}`}>{fmtScore(r.usd.score)}</div><div className="text-xs text-text-muted">{r.usd.bias} · conf. {r.usd.confidence} · {r.usd.live_events} eventos vivos</div>{r.usd.b3_context_note && <div className="text-xs text-text-secondary mt-1">{r.usd.b3_context_note}</div>}</div>
            <div className="glass-card p-4"><div className="text-[11px] uppercase font-bold text-text-muted">BRL</div><div className={`text-3xl font-extrabold ${scoreColor(r.brl.score)}`}>{fmtScore(r.brl.score)}</div><div className="text-xs text-text-muted">{r.brl.bias} · conf. {r.brl.confidence} · cobertura {(r.brl.coverage * 100).toFixed(0)}%</div></div>
            <div className="glass-card p-4 border border-accent/30"><div className="text-[11px] uppercase font-bold text-text-muted">DOL Divergence = USD − BRL</div><div className={`text-3xl font-extrabold ${scoreColor(r.dol.divergence)}`}>{fmtScore(r.dol.divergence)} <span className="text-base">{r.dol.bias}</span></div><div className="text-xs text-text-muted">LONG ≥ +1.0 · SHORT ≤ −1.0 · conf. {r.dol.confidence}{r.dol.previous_divergence != null ? ` · anterior ${fmtScore(r.dol.previous_divergence)}` : ""}</div></div>
          </div>
          {r.dol.drivers.length > 0 && <Section title="Drivers do DOL"><ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">{r.dol.drivers.map((d, i) => <li key={i}>{d}</li>)}</ul></Section>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Drivers do USD (eventos G8)">{r.usd.drivers.length ? <ul className="text-xs text-text-secondary space-y-1">{r.usd.drivers.map((d, i) => <li key={i} className="flex justify-between gap-2 border-b border-border/40 pb-1"><span className="truncate">{d.event}</span><Badge className={classBg(d.classification)}>{d.classification} · w {d.weight.toFixed(2)}</Badge></li>)}</ul> : <p className="text-xs text-text-muted">Sem eventos USD vivos — rode a Análise Macro IA (G8) ou inclua eventos EUA aqui.</p>}</Section>
            <ComponentTable comps={r.brl.components} title="Componentes do BRL" sub="Selic/Copom, inflação, atividade, fiscal, DI, fluxo, commodities, China, carry, risk sentiment, pressão USD." />
          </div>
          <Section title="Intermarket relevante para o DOL"><IntermarketTable rows={r.intermarket} filter="DOL" /></Section>
          <Section title="Candidatos DOL / WDO"><CandidateCards cands={r.trade_candidates.filter((c) => c.instrument !== "WIN")} onOpenSmc={openSmc} /></Section>
          <Notice kind="info">Checklist DOL: USD bias · BRL bias · divergência ≥ limiar · DXY/US10Y não contra · DI curto coerente · sem evento USD/BRL ≤ 60 min · estrutura SMC/ICT confirmada.</Notice>
        </div>
      )}

      {/* ---------------- Brasil Macro ---------------- */}
      {tab === "brasil" && (
        <div className="space-y-4">
          <Section title="Calendário econômico (Brasil / EUA / China)" sub="Mesmo pipeline OCR do módulo G8, agora com BRL e CNY. Prints do Investing, Forex Factory, MyFXBook, Valor, agenda BCB, etc." right={<label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer"><input type="checkbox" checked={withBrief} onChange={(e) => setWithBrief(e.target.checked)} />brief IA</label>}>
            {!rows.length && <><ImageDropzone images={images} onChange={setImages} max={10} hint="Arraste, clique ou Ctrl+V" /><div className="mt-3 flex items-center gap-2"><Btn onClick={extractCalendar} disabled={!images.length || !!busy}><ScanLine size={14} />Ler calendário com IA</Btn><Btn variant="ghost" onClick={() => setRows([{ _id: uid(), _confirmed: true, date: new Date().toISOString().slice(0, 10), time: null, currency: "BRL", event: "", impact: "high", actual: null, forecast: null, previous: null, source: "manual", requires_manual_confirmation: false }])}>Digitar manualmente</Btn></div></>}
            {rows.length > 0 && <><OcrValidationTable rows={rows} onChange={setRows} currencies={B3_CCY} defaultCurrency="BRL" /><div className="mt-3 flex flex-wrap items-center gap-2"><Btn onClick={analyzeWithEvents} disabled={!!busy || !rows.some((x) => x.event.trim())}><Sparkles size={14} />Interpretar e calcular WIN/DOL</Btn><Btn variant="ghost" onClick={() => { setRows([]); setImages([]); }}>Cancelar</Btn><span className="text-[11px] text-text-muted">Eventos BRL → prompt Brasil (BCB/COPOM, fiscal, DI); USD → mesmo motor do G8; CNY → China.</span></div></>}
          </Section>
          {r && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Brasil macro — eventos vivos" sub={`${r.brazil_macro.live_events} evento(s) BRL com peso temporal · score agregado ${r.brazil_macro.score_from_events != null ? fmtScore(r.brazil_macro.score_from_events) : "n/d"}`}>
                {brazilCats.length ? <table className="w-full text-xs"><thead><tr className="text-left text-text-muted border-b border-border"><th className="py-1.5 pr-2">Categoria</th><th className="py-1.5 pr-2">Score</th><th className="py-1.5">n</th></tr></thead><tbody>{brazilCats.map(([k, v]) => <tr key={k} className="border-b border-border/50"><td className="py-1.5 pr-2 font-bold text-text-primary">{k}</td><td className="py-1.5 pr-2">{v.score == null ? "—" : <Badge className={scoreBg(v.score)}>{fmtScore(v.score)}</Badge>}</td><td className="py-1.5 text-text-muted">{v.n}</td></tr>)}</tbody></table> : <p className="text-xs text-text-muted">Sem eventos BRL interpretados ainda.</p>}
              </Section>
              <Section title="Drivers BRL (ACTUAL vs FORECAST)">{r.brazil_macro.drivers.length ? <ul className="text-xs text-text-secondary space-y-1">{r.brazil_macro.drivers.map((d, i) => <li key={i} className="flex justify-between gap-2 border-b border-border/40 pb-1"><span className="truncate">{d.event}<span className="text-text-muted"> · {new Date(d.released_at).toLocaleDateString("pt-BR")}</span></span><Badge className={classBg(d.classification)}>{d.classification} · w {d.weight.toFixed(2)}</Badge></li>)}</ul> : <p className="text-xs text-text-muted">—</p>}</Section>
              <div className="lg:col-span-2"><ComponentTable comps={r.brl.components} title="Score BRL — componentes" /></div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- Exterior ---------------- */}
      {tab === "exterior" && (
        <div className="space-y-4">
          <MarketForm value={markets} onChange={setMarkets} onDi={onDiFromOcr} onSave={saveMarkets} saving={!!busy} />
          {r && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="glass-card p-4"><div className="text-[11px] uppercase font-bold text-text-muted">Global risk</div><div className="text-2xl font-extrabold text-text-primary">{r.global_risk.regime_hint}</div><div className="text-xs text-text-muted">score {r.global_risk.score != null ? fmtScore(r.global_risk.score) : "n/d"}</div></div>
              <div className="glass-card p-4"><div className="text-[11px] uppercase font-bold text-text-muted">China</div><div className={`text-2xl font-extrabold ${r.china.score != null ? scoreColor(r.china.score) : "text-text-muted"}`}>{r.china.score != null ? fmtScore(r.china.score) : "n/d"}</div><div className="text-xs text-text-muted">{r.china.note}</div>{r.china.drivers.length > 0 && <div className="text-[11px] text-text-secondary mt-1">{r.china.drivers.join(" · ")}</div>}</div>
              <div className="glass-card p-4"><div className="text-[11px] uppercase font-bold text-text-muted">Commodities</div><div className={`text-2xl font-extrabold ${r.commodities.score != null ? scoreColor(r.commodities.score) : "text-text-muted"}`}>{r.commodities.score != null ? fmtScore(r.commodities.score) : "n/d"}</div><div className="text-xs text-text-muted">{r.commodities.note}</div></div>
            </div>
          )}
          {r && <Section title="Leituras globais usadas"><IntermarketTable rows={r.global_risk.readings} /></Section>}
        </div>
      )}

      {/* ---------------- Curva DI ---------------- */}
      {tab === "di" && (
        <div className="space-y-4">
          <DiCurveForm contracts={contracts} value={di} onChange={setDi} cause={diCause} onCause={setDiCause} onSave={saveDi} saving={!!busy} />
          <DiCurvePanel di={r?.di_curve ?? null} />
        </div>
      )}

      {/* ---------------- Intermarket ---------------- */}
      {tab === "intermarket" && r && <Section title="Painel Intermarket WIN / DOL" sub="Direção, variação diária, contribuição de score e avisos de correlação (ex.: WIN subindo com DI longo subindo = atenção)."><IntermarketTable rows={r.intermarket} /></Section>}

      {/* ---------------- Candidatos ---------------- */}
      {tab === "candidates" && r && <div className="space-y-4"><CandidateCards cands={r.trade_candidates} onOpenSmc={openSmc} /><Notice kind="warn">Fluxo obrigatório: candidato macro → SMC/ICT (sweep, displacement, MSS, reteste) → checklist READY → execução com gestão → Journal com contexto B3. Sem estrutura técnica, não há operação.</Notice></div>}

      {/* ---------------- Event risk ---------------- */}
      {tab === "event-risk" && r && <EventRiskB3 risks={r.event_risk} />}
    </div>
  );
}

export default function B3Page() { return <Suspense fallback={<div className="p-8"><Spinner /></div>}><B3Inner /></Suspense>; }
