"use client";
import { Plus, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { G8, type AnyCurrency, type EconomicEventInput } from "@/lib/ai/types";
import { inputCls, selectCls, Btn, Badge } from "./ui";

export type OcrRow = EconomicEventInput & { _id: string; _confirmed: boolean; _original?: Partial<EconomicEventInput> };
const IMPACTS = ["high", "medium", "low", "holiday", "unknown"] as const;

interface Props { rows: OcrRow[]; onChange: (rows: OcrRow[]) => void; currencies?: readonly AnyCurrency[]; defaultCurrency?: AnyCurrency }

/** Tela de validação do OCR: tudo editável; linhas com baixa confiança exigem confirmação explícita antes de interpretar. */
export default function OcrValidationTable({ rows, onChange, currencies = G8, defaultCurrency = "USD" }: Props) {
  const upd = (id: string, patch: Partial<OcrRow>) => onChange(rows.map((r) => (r._id === id ? { ...r, ...patch, user_edited: r.user_edited || Object.keys(patch).some((k) => !k.startsWith("_")) } : r)));
  const add = () => onChange([...rows, { _id: Math.random().toString(36).slice(2), _confirmed: true, date: new Date().toISOString().slice(0, 10), time: null, currency: defaultCurrency, event: "", impact: "medium", actual: null, forecast: null, previous: null, source: "manual", ocr_confidence: 1, requires_manual_confirmation: false, user_edited: true }]);
  const remove = (id: string) => onChange(rows.filter((r) => r._id !== id));
  const confirmAll = () => onChange(rows.map((r) => ({ ...r, _confirmed: true })));
  const pendingConfirm = rows.filter((r) => r.requires_manual_confirmation && !r._confirmed).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>{rows.length} eventos</span>
          {pendingConfirm > 0 ? <Badge className="bg-amber/15 text-amber border-amber/40"><AlertTriangle size={11} />{pendingConfirm} a confirmar</Badge> : <Badge className="bg-emerald/15 text-emerald border-emerald/40"><CheckCircle2 size={11} />tudo confirmado</Badge>}
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={add}><Plus size={14} />Adicionar evento</Btn>
          <Btn variant="ghost" onClick={confirmAll} disabled={pendingConfirm === 0}><CheckCircle2 size={14} />Confirmar todos</Btn>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-text-muted uppercase text-[10px] tracking-wider">
            <tr>{["OK", "Data", "Hora", "Moeda", "Evento", "Impacto", "Actual", "Forecast", "Previous", "Conf.", ""].map((h) => <th key={h} className="px-2 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const low = (r.ocr_confidence ?? 1) < 0.7 || r.requires_manual_confirmation;
              const released = r.actual != null && r.actual !== "";
              return (
                <tr key={r._id} className={`border-t border-border ${low && !r._confirmed ? "bg-amber/5" : ""}`}>
                  <td className="px-2 py-1"><input type="checkbox" checked={r._confirmed} onChange={(e) => upd(r._id, { _confirmed: e.target.checked })} className="accent-[var(--user-accent)]" title="Confirmar leitura" /></td>
                  <td className="px-2 py-1"><input value={r.date ?? ""} onChange={(e) => upd(r._id, { date: e.target.value || null })} className={`${inputCls} min-w-[6.5rem]`} placeholder="AAAA-MM-DD" /></td>
                  <td className="px-2 py-1"><input value={r.time ?? ""} onChange={(e) => upd(r._id, { time: e.target.value || null })} className={`${inputCls} min-w-[4.5rem]`} placeholder="HH:MM" /></td>
                  <td className="px-2 py-1"><select value={r.currency} onChange={(e) => upd(r._id, { currency: e.target.value as OcrRow["currency"] })} className={selectCls}>{currencies.map((c) => <option key={c}>{c}</option>)}</select></td>
                  <td className="px-2 py-1"><input value={r.event} onChange={(e) => upd(r._id, { event: e.target.value })} className={`${inputCls} min-w-[12rem]`} /></td>
                  <td className="px-2 py-1"><select value={r.impact} onChange={(e) => upd(r._id, { impact: e.target.value as OcrRow["impact"] })} className={`${selectCls} ${r.impact === "high" ? "text-rose" : r.impact === "medium" ? "text-amber" : ""}`}>{IMPACTS.map((i) => <option key={i} value={i}>{i}</option>)}</select></td>
                  <td className="px-2 py-1"><input value={r.actual ?? ""} onChange={(e) => upd(r._id, { actual: e.target.value || null })} className={`${inputCls} min-w-[4.5rem] ${released ? "font-bold" : ""}`} placeholder="—" /></td>
                  <td className="px-2 py-1"><input value={r.forecast ?? ""} onChange={(e) => upd(r._id, { forecast: e.target.value || null })} className={`${inputCls} min-w-[4.5rem]`} placeholder="—" /></td>
                  <td className="px-2 py-1"><input value={r.previous ?? ""} onChange={(e) => upd(r._id, { previous: e.target.value || null })} className={`${inputCls} min-w-[4.5rem]`} placeholder="—" /></td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <span className={`font-bold ${(r.ocr_confidence ?? 1) >= 0.85 ? "text-emerald" : (r.ocr_confidence ?? 1) >= 0.7 ? "text-amber" : "text-rose"}`}>{r.ocr_confidence == null ? "—" : `${Math.round(r.ocr_confidence * 100)}%`}</span>
                    {r.user_edited && <span className="ml-1 text-[9px] text-sky font-bold" title="Editado por você">ED</span>}
                    {!released && <span className="ml-1 text-[9px] text-text-muted" title="Sem actual: será tratado como pendente">PEND</span>}
                  </td>
                  <td className="px-2 py-1"><button onClick={() => remove(r._id)} className="text-text-muted hover:text-rose" title="Remover"><Trash2 size={13} /></button></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={11} className="px-3 py-6 text-center text-text-muted">Nenhum evento. Envie screenshots ou adicione manualmente.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-text-muted mt-2">Regra: o OCR nunca inventa números. Campos vazios ficam <b>null</b> e o evento é tratado como <b>pendente</b>. Linhas com confiança &lt; 70% precisam da sua confirmação. O que você editar é salvo como auditoria junto da análise.</p>
    </div>
  );
}
