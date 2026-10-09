"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NotebookPen, Plus, Save, Sparkles, Trash2, Lock, Camera } from "lucide-react";
import ImageDropzone from "@/components/ai/ImageDropzone";
import CurrencyExposure from "@/components/ai/CurrencyExposure";
import { Badge, Btn, Notice, PageHeader, Section, Spinner, SESSION_LABEL, inputCls, selectCls, classColor } from "@/components/ai/ui";
import { apiFetch, fileToDataUrl, type LocalImage } from "@/lib/ai/client";
import { ERROR_TAGS, SESSIONS, TIMEFRAMES } from "@/lib/ai/types";
import type { JournalEntry } from "@/lib/journal/service";
import type { TradeReview } from "@/lib/ai/schemas";
import { B3_SESSIONS, B3_SESSION_LABEL, b3InstrumentOf, guessB3Session, type B3AnalysisResult } from "@/lib/b3/types";

const B3_FIELDS = ["win_macro_score", "dol_macro_score", "usd_score", "brl_score", "di_short", "di_long", "risk_regime", "dxy_state", "us10y_state", "sp500_state", "nasdaq_state", "iron_ore_state", "oil_state", "event_risk_at_entry", "b3_analysis_id"] as const;
const STATES = ["", "UP", "DOWN", "FLAT", "UNKNOWN"];
const REGIMES = ["", "RISK_ON", "RISK_OFF", "DOMESTIC_BULLISH", "DOMESTIC_BEARISH", "MIXED", "HIGH_EVENT_RISK"];
/** Preenche os campos B3 do formulário a partir de uma análise B3 (snapshot do contexto no momento do trade). */
function b3ToForm(r: B3AnalysisResult, inst: "WIN" | "DOL" | "WDO"): Partial<Form> {
  const st = (sym: string) => r.intermarket.find((x) => x.symbol === sym)?.direction ?? "UNKNOWN";
  const er = r.event_risk.find((e) => e.instrument === (inst === "WIN" ? "WIN" : "DOL"))?.level ?? "";
  return { win_macro_score: String(r.win.score), dol_macro_score: String(r.dol.divergence), usd_score: String(r.usd.score), brl_score: String(r.brl.score), di_short: r.di_curve?.short.change_bp == null ? "" : String(r.di_curve.short.change_bp), di_long: r.di_curve?.long.change_bp == null ? "" : String(r.di_curve.long.change_bp),
    risk_regime: r.regime, dxy_state: st("DXY"), us10y_state: st("US10Y"), sp500_state: st("SPX"), nasdaq_state: st("NAS100"), iron_ore_state: st("IRON_ORE"), oil_state: st("BRENT") === "UNKNOWN" ? st("WTI") : st("BRENT"), event_risk_at_entry: er, b3_analysis_id: r.analysis_id ?? "", macro_divergence: inst === "WIN" ? String(r.win.score) : String(r.dol.divergence) };
}

interface Form { [k: string]: string | boolean | string[] | null | undefined; error_tags?: string[] }
const BOOL = ["", "true", "false"];
const num = (v: unknown) => (v === "" || v == null ? null : Number(v));
const b = (v: unknown) => (v === "" || v == null ? null : v === "true" || v === true);

function entryToForm(e: JournalEntry | null, sp?: URLSearchParams): Form {
  const g = (k: string) => sp?.get(k) ?? "";
  if (!e) return { date: new Date().toISOString().slice(0, 10), time: new Date().toTimeString().slice(0, 5), session: b3InstrumentOf(g("symbol")) ? guessB3Session() : "LONDON", symbol: g("symbol"), direction: g("direction") || "BUY", status: "OPEN", technical_analysis_id: g("technical_analysis_id"), htf_bias: g("htf_bias"), mss_timeframe: g("mss_timeframe"), mss_type: g("mss_type").replace("NONE", ""), entry_model: g("entry_model").replace("NONE", ""), setup_grade: g("setup_grade").replace("NO_TRADE", ""), liquidity_sweep: g("liquidity_sweep"), displacement: g("displacement"), fvg: g("fvg"), draw_on_liquidity: g("draw_on_liquidity"), poi: g("poi"), macro_divergence: g("macro_divergence"), error_tags: [] };
  const s = (v: unknown) => (v == null ? "" : String(v));
  const sess = e.session === "Londres" ? "LONDON" : e.session === "Nova York" ? "NEW_YORK" : e.session === "Ásia" || e.session === "Asia" ? "ASIA" : (e.session ?? "");
  return { date: e.date.slice(0, 10), time: e.time ?? "", session: sess, symbol: e.symbol, direction: e.direction, status: e.status, entry: s(e.entry), stop_loss: s(e.stop_loss), take_profit: s(e.take_profit), position_size: s(e.position_size), pnl: s(e.pnl), result: s(e.result), notes: s(e.notes),
    strong_currency: s(e.strong_currency), weak_currency: s(e.weak_currency), macro_divergence: s(e.macro_divergence), htf_bias: s(e.htf_bias), draw_on_liquidity: s(e.draw_on_liquidity), poi: s(e.poi), liquidity_sweep: s(e.liquidity_sweep), mss_timeframe: s(e.mss_timeframe), mss_type: s(e.mss_type), displacement: s(e.displacement), fvg: s(e.fvg), entry_model: s(e.entry_model), setup_grade: s(e.setup_grade),
    planned_rr: s(e.planned_rr), risk_usd: s(e.risk_usd), risk_percent: s(e.risk_percent), realized_r: s(e.realized_r), mae_r: s(e.mae_r), mfe_r: s(e.mfe_r), mae_price: s(e.mae_price), mfe_price: s(e.mfe_price), lesson: s(e.lesson), technical_analysis_id: s(e.technical_analysis_id), error_tags: e.error_tags,
    ...Object.fromEntries(B3_FIELDS.map((k) => [k, s((e as unknown as Record<string, unknown>)[k])])) };
}
function formToBody(f: Form, shots: { kind: string; timeframe: string | null; data_url: string }[]) {
  const str = (k: string) => { const v = f[k]; return v === "" || v == null || Array.isArray(v) ? null : String(v); };
  return { date: str("date") ?? undefined, time: str("time") ?? undefined, session: str("session") ?? undefined, symbol: str("symbol") ?? undefined, direction: str("direction") ?? undefined, status: str("status") ?? undefined,
    entry: num(f.entry), stop_loss: num(f.stop_loss), take_profit: num(f.take_profit), position_size: num(f.position_size), pnl: num(f.pnl), result: str("result"), notes: str("notes"),
    strong_currency: str("strong_currency"), weak_currency: str("weak_currency"), macro_divergence: num(f.macro_divergence), htf_bias: str("htf_bias"), draw_on_liquidity: str("draw_on_liquidity"), poi: str("poi"), liquidity_sweep: b(f.liquidity_sweep), mss_timeframe: str("mss_timeframe"), mss_type: str("mss_type"), displacement: b(f.displacement), fvg: b(f.fvg), entry_model: str("entry_model"), setup_grade: str("setup_grade"),
    planned_rr: num(f.planned_rr), risk_usd: num(f.risk_usd), risk_percent: num(f.risk_percent), realized_r: num(f.realized_r), mae_r: num(f.mae_r), mfe_r: num(f.mfe_r), mae_price: num(f.mae_price), mfe_price: num(f.mfe_price), lesson: str("lesson"), technical_analysis_id: num(f.technical_analysis_id), error_tags: f.error_tags ?? [], screenshots: shots,
    // B3 (só envia se preenchido)
    win_macro_score: num(f.win_macro_score), dol_macro_score: num(f.dol_macro_score), usd_score: num(f.usd_score), brl_score: num(f.brl_score), di_short: num(f.di_short), di_long: num(f.di_long), b3_analysis_id: num(f.b3_analysis_id),
    risk_regime: str("risk_regime"), dxy_state: str("dxy_state"), us10y_state: str("us10y_state"), sp500_state: str("sp500_state"), nasdaq_state: str("nasdaq_state"), iron_ore_state: str("iron_ore_state"), oil_state: str("oil_state"), event_risk_at_entry: str("event_risk_at_entry") };
}

function Field({ label, k, f, set, type = "text", options, wide }: { label: string; k: string; f: Form; set: (k: string, v: string) => void; type?: string; options?: readonly string[]; wide?: boolean }) {
  return (
    <label className={`text-[11px] text-text-muted ${wide ? "col-span-2" : ""}`}>{label}
      {options ? <select value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value)} className={`${selectCls} mt-0.5 w-full`}>{options.map((o) => <option key={o} value={o}>{o === "" ? "—" : o}</option>)}</select>
        : type === "textarea" ? <textarea value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value)} rows={2} className={`${inputCls} mt-0.5`} />
        : <input type={type} value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value)} className={`${inputCls} mt-0.5`} />}
    </label>
  );
}

function JournalInner() {
  const sp = useSearchParams();
  const [list, setList] = useState<JournalEntry[] | null>(null);
  const [sel, setSel] = useState<JournalEntry | null>(null);
  const [isNew, setIsNew] = useState(() => sp.get("new") === "1");
  const [f, setF] = useState<Form>(() => (sp.get("new") === "1" ? entryToForm(null, sp) : {}));
  const [newShots, setNewShots] = useState<LocalImage[]>([]);
  const [shotKind, setShotKind] = useState<"BEFORE" | "AFTER" | "OTHER">("BEFORE");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => { try { setList(await apiFetch<JournalEntry[]>("/api/journal?limit=300")); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const open = async (id: number) => { setErr(null); try { const e = await apiFetch<JournalEntry>(`/api/journal/${id}`); setSel(e); setIsNew(false); setF(entryToForm(e)); setNewShots([]); } catch (e) { setErr((e as Error).message); } };
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const toggleTag = (t: string) => setF((p) => ({ ...p, error_tags: (p.error_tags ?? []).includes(t) ? (p.error_tags ?? []).filter((x) => x !== t) : [...(p.error_tags ?? []), t] }));

  const inst = b3InstrumentOf(String(f.symbol ?? ""));
  const fillB3 = useCallback(async () => {
    const i = b3InstrumentOf(String(f.symbol ?? "")); if (!i) return; setErr(null); setBusy("Buscando última análise B3...");
    try { const r = await apiFetch<B3AnalysisResult | null>("/api/b3/analyses?latest=1"); if (!r) { setErr("Nenhuma análise B3 disponível. Rode uma em B3 Macro."); return; } setF((p) => ({ ...p, ...b3ToForm(r, i) })); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }, [f.symbol]);
  // Vindo do SMC/ICT com ?b3=1: pré-carrega o contexto B3 (assíncrono — setState só no callback do fetch)
  const autoB3 = isNew && !!inst && sp.get("b3") === "1";
  const [autoDone, setAutoDone] = useState(false);
  useEffect(() => { if (autoB3 && !autoDone) void Promise.resolve().then(() => { setAutoDone(true); return fillB3(); }); }, [autoB3, autoDone, fillB3]);

  const save = async () => {
    setErr(null); setBusy("Salvando...");
    try {
      const shots = await Promise.all(newShots.map(async (s) => ({ kind: shotKind, timeframe: s.label ?? null, data_url: await fileToDataUrl(s.file) })));
      const body = formToBody(f, shots);
      if (isNew) { const r = await apiFetch<{ id: number }>("/api/journal", { method: "POST", body: JSON.stringify(body) }); await load(); await open(r.id); }
      else if (sel) { await apiFetch(`/api/journal/${sel.id}`, { method: "PUT", body: JSON.stringify(body) }); await load(); await open(sel.id); }
      setNewShots([]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const delShot = async (shotId: number) => { if (!sel) return; try { await apiFetch(`/api/journal/${sel.id}?screenshot=${shotId}`, { method: "DELETE" }); await open(sel.id); } catch (e) { setErr((e as Error).message); } };
  const review = async () => { if (!sel) return; setErr(null); setBusy("Pedindo revisão de processo à IA (independente do resultado)..."); try { await apiFetch(`/api/ai/journal/review`, { method: "POST", body: JSON.stringify({ trade_id: sel.id }) }); await open(sel.id); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); } };

  const filtered = useMemo(() => (list ?? []).filter((e) => !filter || e.symbol.includes(filter.toUpperCase()) || (e.session ?? "").includes(filter.toUpperCase())), [list, filter]);
  const rv = sel?.ai_review as (TradeReview & { reviewed_at?: string; model?: string }) | null;
  const locked = !!sel?.setup_grade_locked_at;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <PageHeader icon={NotebookPen} title="Trading Journal" sub="Contexto macro + estrutura SMC + execução + MAE/MFE + tags de erro. A grade do setup é travada no primeiro registro — antes do resultado." right={<Btn onClick={() => { setIsNew(true); setSel(null); setF(entryToForm(null)); setNewShots([]); }}><Plus size={16} />Novo registro</Btn>} />
      {err && <div className="mb-4"><Notice kind="error">{err}</Notice></div>}
      {busy && <div className="mb-4"><Spinner label={busy} /></div>}
      <div className="grid gap-4 xl:grid-cols-5">
        <Section className="xl:col-span-2" title="Operações" sub="Todas as operações (inclui as importadas do MT5); clique para enriquecer." right={<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filtrar ativo/sessão" className={`${inputCls} w-36`} />}>
          {!list ? <Spinner /> : (
            <div className="max-h-[70vh] overflow-y-auto space-y-1">
              {filtered.map((e) => (
                <button key={e.id} onClick={() => open(e.id)} className={`w-full text-left rounded-lg px-2.5 py-2 border text-xs transition ${sel?.id === e.id ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted w-20">{e.date.slice(0, 10)}</span>
                    <span className="font-extrabold text-text-primary">{e.symbol}</span>
                    <span className={e.direction === "BUY" ? "text-emerald font-bold" : "text-rose font-bold"}>{e.direction}</span>
                    <span className="text-text-muted">{SESSION_LABEL[e.session ?? ""] ?? B3_SESSION_LABEL[e.session as keyof typeof B3_SESSION_LABEL] ?? e.session ?? ""}</span>
                    <span className="ml-auto flex items-center gap-1">
                      {e.setup_grade && <Badge className="border-border text-text-secondary">{e.setup_grade}</Badge>}
                      {e.entry_model && <Badge className="border-border text-text-muted">{e.entry_model === "MODEL_A_AGGRESSIVE" ? "A-agr" : "B-conf"}</Badge>}
                      {e.error_tags.length > 0 && <Badge className="border-amber/40 text-amber">{e.error_tags.length} erro</Badge>}
                      <span className={`font-bold tabular-nums ${(e.realized_r ?? 0) > 0 ? "text-emerald" : (e.realized_r ?? 0) < 0 ? "text-rose" : "text-text-muted"}`}>{e.realized_r != null ? `${e.realized_r > 0 ? "+" : ""}${e.realized_r.toFixed(2)}R` : e.pnl != null ? `${e.pnl > 0 ? "+" : ""}${e.pnl.toFixed(2)}` : e.status}</span>
                    </span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-xs text-text-muted py-4 text-center">Nenhuma operação.</p>}
            </div>
          )}
        </Section>

        <div className="xl:col-span-3 space-y-4">
          {!sel && !isNew ? <Section title="Selecione uma operação" sub="ou crie um novo registro"><CurrencyExposure /></Section> : (
            <>
              <Section title={isNew ? "Novo registro" : `${sel!.symbol} ${sel!.direction} · #${sel!.id}`} sub={isNew ? "Campos mínimos: ativo e direção. O restante pode ser preenchido depois." : `${sel!.status} · ${sel!.result ?? "sem resultado"}${locked ? ` · grade travada em ${new Date(sel!.setup_grade_locked_at!).toLocaleString("pt-BR")}` : ""}`} right={<div className="flex gap-2">{!isNew && <Btn variant="ghost" onClick={review} disabled={!!busy}><Sparkles size={14} />Revisão IA</Btn>}<Btn onClick={save} disabled={!!busy || !f.symbol}><Save size={14} />Salvar</Btn></div>}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Field label="Data" k="date" f={f} set={set} type="date" /><Field label="Hora" k="time" f={f} set={set} type="time" /><Field label="Sessão" k="session" f={f} set={set} options={inst ? ["", ...B3_SESSIONS] : ["", ...SESSIONS]} /><Field label="Ativo" k="symbol" f={f} set={set} />
                  <Field label="Direção" k="direction" f={f} set={set} options={["BUY", "SELL"]} /><Field label="Status" k="status" f={f} set={set} options={["OPEN", "CLOSED"]} /><Field label="Resultado" k="result" f={f} set={set} options={["", "WIN", "LOSS", "BREAK EVEN"]} /><Field label="PnL" k="pnl" f={f} set={set} />
                  <Field label="Entrada" k="entry" f={f} set={set} /><Field label="Stop" k="stop_loss" f={f} set={set} /><Field label="Alvo" k="take_profit" f={f} set={set} /><Field label="Lote" k="position_size" f={f} set={set} />
                  <Field label="Risco $" k="risk_usd" f={f} set={set} /><Field label="Risco %" k="risk_percent" f={f} set={set} /><Field label="R:R planejado" k="planned_rr" f={f} set={set} /><Field label="R realizado" k="realized_r" f={f} set={set} />
                </div>
                <p className="text-[11px] font-extrabold text-text-primary mt-4 mb-1">Contexto macro</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2"><Field label="Moeda forte" k="strong_currency" f={f} set={set} /><Field label="Moeda fraca" k="weak_currency" f={f} set={set} /><Field label="Divergência" k="macro_divergence" f={f} set={set} /><Field label="Análise técnica #" k="technical_analysis_id" f={f} set={set} /></div>
                {inst && (
                  <>
                    <p className="text-[11px] font-extrabold text-text-primary mt-4 mb-1 flex items-center justify-between">Contexto B3 — {inst}<button onClick={fillB3} className="text-accent font-bold text-[11px] hover:underline">Preencher com última análise B3</button></p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Field label="WIN macro score" k="win_macro_score" f={f} set={set} /><Field label="DOL divergência" k="dol_macro_score" f={f} set={set} /><Field label="USD score" k="usd_score" f={f} set={set} /><Field label="BRL score" k="brl_score" f={f} set={set} />
                      <Field label="DI curto (Δ bp)" k="di_short" f={f} set={set} /><Field label="DI longo (Δ bp)" k="di_long" f={f} set={set} /><Field label="Regime" k="risk_regime" f={f} set={set} options={REGIMES} /><Field label="Event risk na entrada" k="event_risk_at_entry" f={f} set={set} options={["", "LOW", "MEDIUM", "HIGH", "EXTREME"]} />
                      <Field label="DXY" k="dxy_state" f={f} set={set} options={STATES} /><Field label="US10Y" k="us10y_state" f={f} set={set} options={STATES} /><Field label="S&P500" k="sp500_state" f={f} set={set} options={STATES} /><Field label="Nasdaq" k="nasdaq_state" f={f} set={set} options={STATES} />
                      <Field label="Minério" k="iron_ore_state" f={f} set={set} options={STATES} /><Field label="Petróleo" k="oil_state" f={f} set={set} options={STATES} /><Field label="Análise B3 #" k="b3_analysis_id" f={f} set={set} />
                    </div>
                  </>
                )}
                <p className="text-[11px] font-extrabold text-text-primary mt-4 mb-1 flex items-center gap-1">Estrutura SMC/ICT {locked && <Lock size={11} className="text-amber" />}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Field label="HTF bias" k="htf_bias" f={f} set={set} options={["", "BULLISH", "BEARISH", "RANGING", "UNCLEAR"]} /><Field label="Sweep" k="liquidity_sweep" f={f} set={set} options={BOOL} /><Field label="Displacement" k="displacement" f={f} set={set} options={BOOL} /><Field label="FVG" k="fvg" f={f} set={set} options={BOOL} />
                  <Field label="MSS timeframe" k="mss_timeframe" f={f} set={set} options={["", ...TIMEFRAMES]} /><Field label="MSS tipo" k="mss_type" f={f} set={set} options={["", "INTERNAL_MSS", "EXTERNAL_MSS"]} /><Field label="Modelo" k="entry_model" f={f} set={set} options={["", "MODEL_A_AGGRESSIVE", "MODEL_B_CONFIRMED"]} /><Field label={`Grade${locked ? " (travada)" : ""}`} k="setup_grade" f={f} set={set} options={["", "A", "B", "C"]} />
                  <Field label="Draw on liquidity" k="draw_on_liquidity" f={f} set={set} wide /><Field label="POI" k="poi" f={f} set={set} wide />
                </div>
                <p className="text-[11px] font-extrabold text-text-primary mt-4 mb-1">MAE / MFE</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2"><Field label="MAE (R)" k="mae_r" f={f} set={set} /><Field label="MFE (R)" k="mfe_r" f={f} set={set} /><Field label="MAE preço" k="mae_price" f={f} set={set} /><Field label="MFE preço" k="mfe_price" f={f} set={set} /></div>
                <p className="text-[11px] font-extrabold text-text-primary mt-4 mb-1">Tags de erro</p>
                <div className="flex flex-wrap gap-1.5">{ERROR_TAGS.map((t) => <button key={t} onClick={() => toggleTag(t)} className={`px-2 py-1 rounded-md text-[10px] font-bold border ${(f.error_tags ?? []).includes(t) ? "border-amber/50 bg-amber/15 text-amber" : "border-border text-text-muted hover:text-text-primary"}`}>{t}</button>)}</div>
                <div className="grid gap-2 mt-4"><Field label="Lição" k="lesson" f={f} set={set} type="textarea" /><Field label="Notas" k="notes" f={f} set={set} type="textarea" /></div>
              </Section>

              <Section title="Screenshots" sub="Antes/depois por timeframe (comprimidos; máx. 6 por salvamento)">
                {sel && sel.screenshots.length > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">{sel.screenshots.map((s) => <div key={s.id} className="relative group rounded-lg overflow-hidden border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.data_url} alt={s.kind} className="w-full h-24 object-cover" /><span className="absolute left-1 bottom-1 text-[9px] font-bold bg-black/60 text-white px-1 rounded">{s.kind}{s.timeframe ? ` ${s.timeframe}` : ""}</span><button onClick={() => delShot(s.id)} className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"><Trash2 size={11} /></button></div>)}</div>}
                <div className="flex items-center gap-2 mb-2 text-xs text-text-muted"><Camera size={14} />Tipo:<select value={shotKind} onChange={(e) => setShotKind(e.target.value as typeof shotKind)} className={selectCls}><option>BEFORE</option><option>AFTER</option><option>OTHER</option></select></div>
                <ImageDropzone images={newShots} onChange={setNewShots} max={6} labels={TIMEFRAMES} labelTitle="Timeframe" maxPx={1280} hint="PNG/JPEG/WebP · até 6 por salvamento · reduzidas para ≤1280px (ficam no banco, por isso o limite)" />
              </Section>

              {rv && (
                <Section title="Revisão de processo (IA)" sub={`${rv.model ?? ""} · ${rv.reviewed_at ? new Date(rv.reviewed_at).toLocaleString("pt-BR") : ""} · confiança ${rv.confidence}`}>
                  <div className="flex flex-wrap gap-2 mb-2"><Badge className={rv.process_grade === "A" ? "border-emerald/40 text-emerald" : rv.process_grade === "B" ? "border-sky/40 text-sky" : "border-amber/40 text-amber"}>processo {rv.process_grade}</Badge><Badge className="border-border text-text-secondary">{rv.execution_vs_plan}</Badge><Badge className="border-border text-text-secondary">stop {rv.stop_placement}</Badge>{rv.error_tags.map((t) => <Badge key={t} className="border-amber/40 text-amber">{t}</Badge>)}</div>
                  <p className="text-xs text-text-secondary mb-2">{rv.process_grade_reasoning}</p>
                  <div className="grid md:grid-cols-2 gap-3 text-xs">
                    <div><p className="font-bold text-emerald mb-1">Acertos</p><ul className="list-disc pl-4 text-text-secondary">{rv.what_went_right.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                    <div><p className="font-bold text-rose mb-1">Erros</p><ul className="list-disc pl-4 text-text-secondary">{rv.what_went_wrong.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  </div>
                  <p className="text-xs text-text-secondary mt-2"><b>MAE/MFE:</b> {rv.mae_mfe_comment}</p>
                  <p className="text-xs text-text-secondary mt-1"><b>Gestão:</b> {rv.management_assessment}</p>
                  <p className={`text-xs mt-2 font-semibold ${classColor("")} text-text-primary`}><b>Lição:</b> {rv.lesson}</p>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export default function JournalPage() { return <Suspense fallback={<div className="p-8"><Spinner /></div>}><JournalInner /></Suspense>; }
