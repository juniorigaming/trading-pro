"use client";
/** Entradas de dados do B3: curva DI (manual) e leituras de mercado (manual + OCR de screenshots). Nada é inventado: campo vazio = null. */
import { useEffect, useState } from "react";
import { ScanLine, Save, Trash2 } from "lucide-react";
import ImageDropzone from "@/components/ai/ImageDropzone";
import { Badge, Btn, Notice, Section, Spinner, inputCls, selectCls } from "@/components/ai/ui";
import { apiFetch, type LocalImage } from "@/lib/ai/client";
import type { DiContractConfig } from "@/lib/b3/config";
import type { DiCause, DiContractInput, DiTenor } from "@/lib/b3/types";
import type { MarketSnapshotInput } from "@/lib/b3/providers";

export const MARKET_LABEL: Record<string, string> = { IBOV: "Ibovespa", WIN: "WIN (mini índice)", DOL: "DOL (dólar cheio)", WDO: "WDO (mini dólar)", USDBRL: "USD/BRL spot", SPX: "S&P 500", NAS100: "Nasdaq 100", DXY: "DXY", US02Y: "US 2Y (bp)", US10Y: "US 10Y (bp)", BRENT: "Brent", WTI: "WTI", IRON_ORE: "Minério de ferro", COPPER: "Cobre", VIX: "VIX", FOREIGN_FLOW: "Fluxo estrangeiro (R$ mi)" };
export const MARKET_ORDER = ["IBOV", "WIN", "USDBRL", "DOL", "WDO", "SPX", "NAS100", "DXY", "US10Y", "US02Y", "VIX", "BRENT", "WTI", "IRON_ORE", "COPPER", "FOREIGN_FLOW"] as const;
const BP_SYMBOLS = new Set(["US02Y", "US10Y"]);
const num = (v: string): number | null => { const t = v.trim().replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };

export type DiDraft = { code: string; tenor: DiTenor; rate: string; change_bp: string };
export type MarketDraft = { symbol: string; value: string; change: string; source: MarketSnapshotInput["source"]; requires_manual_confirmation?: boolean; label_seen?: string; ocr_confidence?: number | null };

export const toDiInputs = (d: DiDraft[]): DiContractInput[] => d.filter((c) => c.code.trim()).map((c) => ({ code: c.code.trim().toUpperCase(), tenor: c.tenor, rate: num(c.rate), change_bp: num(c.change_bp) }));
export const toMarketInputs = (d: MarketDraft[]): MarketSnapshotInput[] => d.filter((m) => m.value.trim() || m.change.trim()).map((m) => ({ symbol: m.symbol, value: num(m.value), change_pct: BP_SYMBOLS.has(m.symbol) ? null : num(m.change), change_bp: BP_SYMBOLS.has(m.symbol) ? num(m.change) : null, source: m.source, requires_manual_confirmation: false, label_seen: m.label_seen, ocr_confidence: m.ocr_confidence ?? null }));
export const emptyMarkets = (): MarketDraft[] => MARKET_ORDER.map((s) => ({ symbol: s, value: "", change: "", source: "manual" }));

const CAUSES: { v: DiCause | ""; l: string }[] = [{ v: "", l: "Causa: não sei (motor infere pelos dados)" }, { v: "INFLATION", l: "Inflação (IPCA/expectativas)" }, { v: "FISCAL_RISK", l: "Risco fiscal (arcabouço, gastos, dívida)" }, { v: "BCB_HAWKISH", l: "BCB hawkish (guidance/Selic)" }, { v: "BCB_DOVISH", l: "BCB dovish" }, { v: "GLOBAL_YIELDS", l: "Yields globais (Treasuries)" }, { v: "RISK_PREMIUM", l: "Prêmio de risco / político" }, { v: "GROWTH", l: "Atividade (PIB/IBC-Br forte)" }];

/** Formulário da curva DI. `contracts` vem de /api/b3/settings (configurável). */
export function DiCurveForm({ contracts, value, onChange, cause, onCause, onSave, saving }: { contracts: DiContractConfig[]; value: DiDraft[]; onChange: (d: DiDraft[]) => void; cause: DiCause | ""; onCause: (c: DiCause | "") => void; onSave?: () => void; saving?: boolean }) {
  useEffect(() => { if (!value.length && contracts.length) onChange(contracts.map((c) => ({ code: c.code, tenor: c.tenor, rate: "", change_bp: "" }))); }, [contracts, value.length, onChange]);
  const upd = (i: number, p: Partial<DiDraft>) => onChange(value.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <Section title="Curva DI — entrada manual" sub="Taxa (% a.a.) e variação do dia em bp dos contratos configurados. Deixe em branco o que não tiver: o motor marca como sem dado.">
      <div className="grid gap-2">
        {value.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
            <input value={c.code} onChange={(e) => upd(i, { code: e.target.value.toUpperCase() })} placeholder="DI1F27" className={inputCls} />
            <select value={c.tenor} onChange={(e) => upd(i, { tenor: e.target.value as DiTenor })} className={selectCls}><option value="SHORT">Curto</option><option value="MID">Médio</option><option value="LONG">Longo</option></select>
            <input value={c.rate} onChange={(e) => upd(i, { rate: e.target.value })} placeholder="taxa % (14,85)" className={inputCls} inputMode="decimal" />
            <input value={c.change_bp} onChange={(e) => upd(i, { change_bp: e.target.value })} placeholder="Δ bp (−5)" className={inputCls} inputMode="decimal" />
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-text-muted hover:text-rose" title="Remover"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Btn variant="ghost" onClick={() => onChange([...value, { code: "", tenor: "MID", rate: "", change_bp: "" }])}>+ contrato</Btn>
        <select value={cause} onChange={(e) => onCause(e.target.value as DiCause | "")} className={selectCls}>{CAUSES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
        {onSave && <Btn onClick={onSave} disabled={saving || !toDiInputs(value).length}><Save size={14} />{saving ? "Salvando..." : "Salvar curva"}</Btn>}
      </div>
    </Section>
  );
}

/** Grade de leituras de mercado (exterior, câmbio, commodities, fluxo) + OCR de screenshots. */
export function MarketForm({ value, onChange, onDi, onSave, saving }: { value: MarketDraft[]; onChange: (d: MarketDraft[]) => void; onDi?: (rows: DiContractInput[]) => void; onSave?: () => void; saving?: boolean }) {
  const [images, setImages] = useState<LocalImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const upd = (symbol: string, p: Partial<MarketDraft>) => onChange(value.map((m) => (m.symbol === symbol ? { ...m, ...p, requires_manual_confirmation: false } : m)));
  const extract = async () => {
    setErr(null); setBusy(true); setOcrNote(null);
    try {
      const fd = new FormData(); images.forEach((i) => fd.append("images", i.file, i.file.name));
      const r = await apiFetch<{ rows: MarketSnapshotInput[]; di_contracts: DiContractInput[]; meta: { model: string; overallConfidence: number; notes?: string | null } }>("/api/ai/b3/extract-market", { method: "POST", body: fd });
      const next = value.map((m) => {
        const hit = r.rows.find((x) => x.symbol === m.symbol); if (!hit) return m;
        const ch = BP_SYMBOLS.has(m.symbol) ? hit.change_bp : hit.change_pct;
        return { ...m, value: hit.value == null ? "" : String(hit.value), change: ch == null ? "" : String(ch), source: "screenshot_ai" as const, requires_manual_confirmation: hit.requires_manual_confirmation ?? (hit.ocr_confidence != null && hit.ocr_confidence < 0.7), label_seen: hit.label_seen, ocr_confidence: hit.ocr_confidence ?? null };
      });
      onChange(next);
      if (r.di_contracts.length && onDi) onDi(r.di_contracts);
      setOcrNote(`OCR ${r.meta.model} · confiança ${(r.meta.overallConfidence * 100).toFixed(0)}% · ${r.rows.length} leitura(s)${r.di_contracts.length ? ` + ${r.di_contracts.length} contrato(s) DI` : ""}. Confira os valores marcados antes de salvar.${r.meta.notes ? ` Nota: ${r.meta.notes}` : ""}`);
      setImages([]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Section title="Screenshots de painéis" sub="TradingView / Profit / MT5 / Investing / B3: DXY, US10Y, US02Y, S&P500, NAS100, Brent, minério, VIX, USD/BRL, IBOV, curva DI, fluxo. A IA só lê; você confirma.">
        <ImageDropzone images={images} onChange={setImages} max={8} hint="Arraste, clique ou Ctrl+V" />
        <div className="mt-3 flex items-center gap-3"><Btn onClick={extract} disabled={!images.length || busy}><ScanLine size={14} />{busy ? "Lendo..." : "Ler com IA"}</Btn>{busy && <Spinner />}</div>
        {err && <div className="mt-2"><Notice kind="error">{err}</Notice></div>}
        {ocrNote && <div className="mt-2"><Notice kind="info">{ocrNote}</Notice></div>}
      </Section>
      <Section title="Leituras de mercado" sub="Valor e variação do dia (% — ou bp para US02Y/US10Y; fluxo em R$ milhões, saldo líquido do dia). Em branco = sem dado." right={onSave && <Btn onClick={onSave} disabled={saving || !toMarketInputs(value).length}><Save size={14} />{saving ? "Salvando..." : "Salvar leituras"}</Btn>}>
        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {value.map((m) => (
            <div key={m.symbol} className={`grid grid-cols-[1.3fr_1fr_1fr] gap-1.5 items-center rounded-lg px-1 ${m.requires_manual_confirmation ? "bg-amber/10" : ""}`} title={m.label_seen ? `OCR leu: ${m.label_seen}` : undefined}>
              <span className="text-[11px] font-bold text-text-primary truncate">{MARKET_LABEL[m.symbol] ?? m.symbol}{m.source === "screenshot_ai" && <Badge className="ml-1 bg-sky/10 text-sky border-sky/30">ocr</Badge>}</span>
              <input value={m.value} onChange={(e) => upd(m.symbol, { value: e.target.value })} placeholder={m.symbol === "FOREIGN_FLOW" ? "R$ mi" : "valor"} className={inputCls} inputMode="decimal" />
              <input value={m.change} onChange={(e) => upd(m.symbol, { change: e.target.value })} placeholder={BP_SYMBOLS.has(m.symbol) ? "Δ bp" : m.symbol === "FOREIGN_FLOW" ? "—" : "Δ %"} disabled={m.symbol === "FOREIGN_FLOW"} className={inputCls} inputMode="decimal" />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
