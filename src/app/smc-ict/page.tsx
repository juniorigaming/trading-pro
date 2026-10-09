"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Crosshair, Sparkles, History, Landmark, Save } from "lucide-react";
import ImageDropzone from "@/components/ai/ImageDropzone";
import SmcChecklist from "@/components/ai/SmcChecklist";
import CurrencyExposure from "@/components/ai/CurrencyExposure";
import { Badge, Btn, Notice, PageHeader, Section, Spinner, Tabs, SESSION_LABEL, inputCls, selectCls, riskColor, classColor } from "@/components/ai/ui";
import { apiFetch, type LocalImage } from "@/lib/ai/client";
import { SESSIONS, TIMEFRAMES, type Session } from "@/lib/ai/types";
import type { TechnicalAnalysis } from "@/lib/ai/schemas";
import type { ChecklistResult } from "@/lib/smc/checklist";

interface SmcResult { id: number; analysis: TechnicalAnalysis; checklist: ChecklistResult; event_risk: { level: string; events: { currency: string; event: string; minutes_until: number }[] }; intermarket: { regime: string; interpretation: string } | null; meta: { provider: string; model: string; prompt_version: string; latency_ms: number } }
interface SmcListItem { id: number; createdAt: string; symbol: string; session: string | null; macroBias: string | null; status: string | null; setupGradeFinal: string | null; entryModelFinal: string | null; timeframes: string[]; htfBias: string | null; eventRisk: string | null }

function SmcPageInner() {
  const sp = useSearchParams(); const router = useRouter();
  const [tab, setTab] = useState<"nova" | "historico" | "intermarket">("nova");
  const [symbol, setSymbol] = useState(sp.get("symbol") ?? "");
  const [bias, setBias] = useState<"LONG" | "SHORT" | "NEUTRAL" | "">((sp.get("bias") as "LONG" | "SHORT") ?? "");
  const [div, setDiv] = useState(sp.get("div") ?? "");
  const [session, setSession] = useState<Session>("LONDON");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [result, setResult] = useState<SmcResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<SmcListItem[] | null>(null);
  const [im, setIm] = useState({ dxy: "", dxyChangePct: "", us02y: "", us10y: "", realYield: "", us02yChangeBp: "", us10yChangeBp: "", note: "" });
  const [imList, setImList] = useState<Record<string, unknown>[] | null>(null);

  useEffect(() => { if (tab === "historico") apiFetch<SmcListItem[]>("/api/smc/analyses").then(setHistory).catch((e) => setErr(e.message)); if (tab === "intermarket") apiFetch<Record<string, unknown>[]>("/api/intermarket").then(setImList).catch((e) => setErr(e.message)); }, [tab]);

  const analyze = async () => {
    setErr(null); setBusy("Analisando estrutura (HTF → LTF) com IA e aplicando regras duras do checklist...");
    try {
      const fd = new FormData();
      images.forEach((i) => fd.append("images", i.file, i.file.name));
      fd.append("labels", JSON.stringify(images.map((i) => i.label ?? "H1")));
      fd.append("symbol", symbol.toUpperCase()); fd.append("session", session);
      if (bias) fd.append("macroBias", bias); if (div) fd.append("macroDivergence", div);
      const r = await apiFetch<SmcResult>("/api/ai/smc/analyze", { method: "POST", body: fd });
      setResult(r);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const openOld = async (id: number) => {
    setErr(null);
    try { const r = await apiFetch<{ id: number; resultJson: TechnicalAnalysis; checklistJson: ChecklistResult; eventRisk: string | null; model: string | null; promptVersion: string | null; provider?: string }>(`/api/smc/analyses?id=${id}`); setResult({ id: r.id, analysis: r.resultJson, checklist: r.checklistJson, event_risk: { level: r.eventRisk ?? "LOW", events: [] }, intermarket: null, meta: { provider: "db", model: r.model ?? "", prompt_version: r.promptVersion ?? "", latency_ms: 0 } }); setTab("nova"); }
    catch (e) { setErr((e as Error).message); }
  };
  const saveIntermarket = async () => {
    setErr(null);
    try { const num = (v: string) => (v.trim() === "" ? null : Number(v)); await apiFetch("/api/intermarket", { method: "POST", body: JSON.stringify({ dxy: num(im.dxy), dxyChangePct: num(im.dxyChangePct), us02y: num(im.us02y), us10y: num(im.us10y), realYield: num(im.realYield), us02yChangeBp: num(im.us02yChangeBp), us10yChangeBp: num(im.us10yChangeBp), note: im.note || null }) }); setImList(null); const l = await apiFetch<Record<string, unknown>[]>("/api/intermarket"); setImList(l); }
    catch (e) { setErr((e as Error).message); }
  };
  const toJournal = () => { if (!result) return; const a = result.analysis; const q = new URLSearchParams({ symbol: a.symbol, direction: a.suggested_direction === "SHORT" ? "SELL" : "BUY", technical_analysis_id: String(result.id), htf_bias: a.htf_bias, mss_timeframe: a.mss.timeframe ?? "", mss_type: a.mss.type, entry_model: result.checklist.entry_model, setup_grade: result.checklist.setup_grade, liquidity_sweep: String(a.liquidity_sweep), displacement: String(a.displacement), fvg: String(a.displacement_detail.created_fvg), draw_on_liquidity: a.draw_on_liquidity.map((d) => d.target).join("; "), poi: a.location.poi_description ?? "", macro_divergence: div }); if (/^(WIN|IND|WDO|DOL)/i.test(a.symbol)) q.set("b3", "1"); router.push(`/journal?new=1&${q}`); };

  const a = result?.analysis;
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <PageHeader icon={Crosshair} title="SMC / ICT" sub="Screenshots por timeframe → leitura estrutural pela IA → checklist com regras duras no backend. MACRO → HTF DRAW → LOCATION → LIQUIDITY → DISPLACEMENT → MSS → RETRACEMENT → EXECUTION." />
      <div className="mb-4"><Tabs tabs={[{ id: "nova", label: "Nova análise", icon: Sparkles }, { id: "historico", label: "Histórico", icon: History }, { id: "intermarket", label: "Intermarket (XAU/NAS/BTC)", icon: Landmark }]} value={tab} onChange={setTab} /></div>
      {err && <div className="mb-4"><Notice kind="error">{err}</Notice></div>}
      {busy && <div className="mb-4"><Spinner label={busy} /></div>}

      {tab === "nova" && (
        <div className="space-y-4">
          <Section title="1. Contexto e screenshots" sub="Rotule cada imagem com o timeframe (MN → M1). A direção macro vem do Ranking G8 — informe para o checklist validar alinhamento.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-3">
              <label className="text-xs text-text-muted">Ativo<input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="EURAUD, XAUUSD, NAS100, WINZ26, WDOF27..." className={`${inputCls} mt-1`} /></label>
              <label className="text-xs text-text-muted">Direção macro<select value={bias} onChange={(e) => setBias(e.target.value as typeof bias)} className={`${selectCls} mt-1 w-full`}><option value="">não informada</option><option value="LONG">LONG</option><option value="SHORT">SHORT</option><option value="NEUTRAL">NEUTRAL</option></select></label>
              <label className="text-xs text-text-muted">Divergência macro<input value={div} onChange={(e) => setDiv(e.target.value)} placeholder="ex.: 2.5" className={`${inputCls} mt-1`} /></label>
              <label className="text-xs text-text-muted">Sessão<select value={session} onChange={(e) => setSession(e.target.value as Session)} className={`${selectCls} mt-1 w-full`}>{SESSIONS.map((s) => <option key={s} value={s}>{SESSION_LABEL[s]}</option>)}</select></label>
            </div>
            <ImageDropzone images={images} onChange={setImages} max={10} labels={TIMEFRAMES} labelTitle="Timeframe" hint="Envie do maior para o menor timeframe (ex.: D1, H4, H1, M15, M5). Até 10 imagens." />
            <div className="mt-4 flex flex-wrap gap-3"><Btn onClick={analyze} disabled={!symbol || !images.length || !!busy}><Sparkles size={16} />Analisar estrutura</Btn></div>
          </Section>

          {result && a && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Section title={`Checklist · ${a.symbol}`} sub={`análise #${result.id} · ${result.meta.provider} ${result.meta.model} · ${result.meta.prompt_version} · qualidade das imagens: ${a.image_quality}`} right={<Badge className={riskColor(result.event_risk.level)}>event risk {result.event_risk.level}</Badge>}>
                <SmcChecklist c={result.checklist} />
                {result.event_risk.events.length > 0 && <p className="text-[11px] text-amber mt-2">⚠ {result.event_risk.events.map((e) => `${e.currency} ${e.event} em ${e.minutes_until}min`).join(" · ")}</p>}
                {result.intermarket && <Notice kind="info"><b>{result.intermarket.regime}</b>: {result.intermarket.interpretation}</Notice>}
                <div className="mt-3 flex gap-2"><Btn variant="ghost" onClick={toJournal} disabled={result.checklist.entry_model === "NONE"}><Save size={14} />Registrar no Journal com esses dados</Btn></div>
              </Section>
              <Section title="Leitura estrutural" sub={`HTF bias ${a.htf_bias} · direção sugerida ${a.suggested_direction} · confiança ${a.confidence}`}>
                <div className="space-y-3 text-xs">
                  <div><p className="font-bold text-text-primary mb-1">Draw on Liquidity</p>{a.draw_on_liquidity.length ? <ul className="space-y-0.5">{a.draw_on_liquidity.map((d, i) => <li key={i} className="text-text-secondary">{d.direction === "UP" ? "▲" : "▼"} {d.target} <span className="text-text-muted">({d.timeframe}, {d.confidence})</span></li>)}</ul> : <p className="text-text-muted">—</p>}</div>
                  <div><p className="font-bold text-text-primary mb-1">Localização</p><p className="text-text-secondary">HTF: <b className={a.location.htf_premium_discount === "DISCOUNT" ? "text-emerald" : a.location.htf_premium_discount === "PREMIUM" ? "text-rose" : ""}>{a.location.htf_premium_discount}</b> · POI {a.location.poi_reached ? "alcançado" : "não alcançado"}{a.location.poi_description ? ` (${a.location.poi_description})` : ""}{a.location.is_extended ? " · preço estendido" : ""}</p></div>
                  <div className="grid grid-cols-2 gap-2">
                    <p className="text-text-secondary">Sweep: <b className={a.liquidity_sweep ? "text-emerald" : "text-rose"}>{a.liquidity_sweep ? "sim" : "não"}</b>{a.liquidity_sweep_detail.description ? ` — ${a.liquidity_sweep_detail.description}` : ""}</p>
                    <p className="text-text-secondary">Displacement: <b className={a.displacement ? "text-emerald" : "text-rose"}>{a.displacement ? "sim" : "não"}</b>{a.displacement_detail.timeframe ? ` (${a.displacement_detail.timeframe}${a.displacement_detail.created_fvg ? ", FVG" : ""})` : ""}</p>
                    <p className="text-text-secondary">MSS: <b className={a.mss.present ? "text-emerald" : "text-rose"}>{a.mss.present ? `${a.mss.type} ${a.mss.timeframe ?? ""}` : "não"}</b>{a.mss.broke_what ? ` — ${a.mss.broke_what}` : ""}{a.mss.present && !a.mss.follow_through ? " · sem follow-through" : ""}</p>
                    <p className="text-text-secondary">Retest: <b>{a.retest.occurred ? a.retest.poi_type : "não"}</b>{a.retest.description ? ` — ${a.retest.description}` : ""}</p>
                  </div>
                  {a.poi.length > 0 && <div><p className="font-bold text-text-primary mb-1">POIs</p><ul className="space-y-0.5">{a.poi.map((p, i) => <li key={i} className="text-text-secondary"><span className={classColor(p.direction)}>{p.direction}</span> {p.type} {p.timeframe} · {p.location} · <span className="text-text-muted">{p.status}</span>{p.quality_note ? ` — ${p.quality_note}` : ""}</li>)}</ul></div>}
                  <div><p className="font-bold text-text-primary mb-1">Por timeframe</p><div className="space-y-1">{a.timeframes.map((t) => <details key={t.timeframe} className="rounded-lg bg-surface-2/60 px-2 py-1"><summary className="cursor-pointer text-text-primary font-semibold">{t.timeframe} · <span className={classColor(t.structure)}>{t.structure}</span> · {t.premium_discount}{t.protected_high ? ` · PH ${t.protected_high}` : ""}{t.protected_low ? ` · PL ${t.protected_low}` : ""}</summary><p className="text-text-secondary mt-1">{t.observations}</p>{t.liquidity_pools.length > 0 && <p className="text-text-muted mt-1">Liquidez: {t.liquidity_pools.map((l) => `${l.type} ${l.location} (${l.status})`).join("; ")}</p>}</details>)}</div></div>
                  <div><p className="font-bold text-text-primary">Invalidação</p><p className="text-text-secondary">{a.invalidation}</p></div>
                  <div><p className="font-bold text-text-primary">Alvos (liquidez)</p><p className="text-text-secondary">{a.targets.join(" → ") || "—"}</p></div>
                  {a.wait_for.length > 0 && <div><p className="font-bold text-amber">Aguardar</p><ul className="list-disc pl-4 text-text-secondary">{a.wait_for.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
                  <div><p className="font-bold text-text-primary">Gestão</p><p className="text-text-secondary">{a.management_notes}</p></div>
                  {a.warnings.length > 0 && <Notice kind="warn">{a.warnings.join(" · ")}</Notice>}
                </div>
              </Section>
            </div>
          )}
          <Section title="Exposição atual por moeda" sub="O checklist rebaixa setups que aumentam concentração correlacionada"><CurrencyExposure compact /></Section>
        </div>
      )}

      {tab === "historico" && (
        <Section title="Análises técnicas anteriores">
          {!history ? <Spinner /> : history.length === 0 ? <p className="text-xs text-text-muted">Nenhuma análise ainda.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-text-muted text-[10px] uppercase"><tr><th className="text-left px-2 py-1">Quando</th><th className="text-left px-2 py-1">Ativo</th><th className="text-left px-2 py-1">Sessão</th><th className="text-left px-2 py-1">Macro</th><th className="text-left px-2 py-1">HTF</th><th className="text-left px-2 py-1">Status</th><th className="text-left px-2 py-1">Grade</th><th className="text-left px-2 py-1">Modelo</th><th className="text-left px-2 py-1">TFs</th><th></th></tr></thead>
              <tbody>{history.map((h) => <tr key={h.id} className="border-t border-border"><td className="px-2 py-1.5">{new Date(h.createdAt).toLocaleString("pt-BR")}</td><td className="px-2 py-1.5 font-bold text-text-primary">{h.symbol}</td><td className="px-2 py-1.5">{h.session ? SESSION_LABEL[h.session] ?? h.session : "—"}</td><td className="px-2 py-1.5">{h.macroBias ?? "—"}</td><td className={`px-2 py-1.5 ${classColor(h.htfBias ?? "")}`}>{h.htfBias ?? "—"}</td><td className="px-2 py-1.5">{h.status}</td><td className="px-2 py-1.5">{h.setupGradeFinal}</td><td className="px-2 py-1.5">{h.entryModelFinal}</td><td className="px-2 py-1.5 text-text-muted">{(h.timeframes ?? []).join(", ")}</td><td className="px-2 py-1.5"><button onClick={() => openOld(h.id)} className="text-accent font-bold">abrir</button></td></tr>)}</tbody></table></div>
          )}
        </Section>
      )}

      {tab === "intermarket" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Snapshot intermarket (manual)" sub="Para XAUUSD / NAS100 / BTCUSD: DXY, US02Y, US10Y e real yield. É contexto — nunca gatilho.">
            <div className="grid grid-cols-2 gap-2">
              {([["dxy", "DXY"], ["dxyChangePct", "DXY var. %"], ["us02y", "US02Y %"], ["us02yChangeBp", "US02Y var. bp"], ["us10y", "US10Y %"], ["us10yChangeBp", "US10Y var. bp"], ["realYield", "Real yield 10y %"]] as const).map(([k, l]) => <label key={k} className="text-xs text-text-muted">{l}<input value={im[k]} onChange={(e) => setIm({ ...im, [k]: e.target.value })} className={`${inputCls} mt-1`} inputMode="decimal" /></label>)}
              <label className="text-xs text-text-muted col-span-2">Nota<input value={im.note} onChange={(e) => setIm({ ...im, note: e.target.value })} className={`${inputCls} mt-1`} /></label>
            </div>
            <Btn className="mt-3" onClick={saveIntermarket}><Save size={14} />Salvar snapshot</Btn>
          </Section>
          <Section title="Últimos snapshots">
            {!imList ? <Spinner /> : imList.length === 0 ? <p className="text-xs text-text-muted">Nenhum snapshot.</p> : <ul className="text-xs space-y-1.5">{imList.map((s) => <li key={String(s.id)} className="rounded-lg bg-surface-2/60 px-2 py-1.5"><span className="text-text-muted">{new Date(String(s.capturedAt)).toLocaleString("pt-BR")}</span> · DXY {String(s.dxy ?? "—")} ({String(s.dxyChangePct ?? "—")}%) · 2Y {String(s.us02y ?? "—")} · 10Y {String(s.us10y ?? "—")} · <b>{String(s.regime ?? "")}</b><p className="text-text-secondary">{String(s.interpretation ?? "")}</p></li>)}</ul>}
          </Section>
        </div>
      )}
    </div>
  );
}

export default function SmcPage() { return <Suspense fallback={<div className="p-8"><Spinner /></div>}><SmcPageInner /></Suspense>; }
