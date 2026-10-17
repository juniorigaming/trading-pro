"use client";
/**
 * Registro rápido (modal do Dashboard): 6 campos e pronto.
 * Detalhes (setup, SMC, emoções, prints) continuam no formulário completo.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Zap, Loader2 } from "lucide-react";
import { useTrades, useConfig, invalidateTradeCaches } from "@/hooks/useTradeData";
import { usePortfolio } from "@/components/PortfolioProvider";
import { getCurrentSession } from "@/lib/session";

interface Props { onClose: () => void }

type Result = "WIN" | "LOSS" | "BE";

function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

/** Montado só enquanto aberto (o pai faz `{open && <QuickTradeModal/>}`), então o estado nasce limpo a cada abertura. */
export default function QuickTradeModal({ onClose }: Props) {
  const { trades } = useTrades();
  const { config } = useConfig();
  const { portfolio } = usePortfolio();
  // Sugere o último ativo usado na carteira
  const [form, setForm] = useState(() => ({ ...todayLocal(), asset: trades[0]?.asset || "", direction: "BUY" as "BUY" | "SELL", result: "WIN" as Result, amount: "", risk: "", followedPlan: true, tags: "", notes: "" }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const defaultRisk = config && config.riskPercent && config.initialCapital ? ((config.riskPercent / 100) * config.initialCapital).toFixed(2) : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const asset = form.asset.trim().toUpperCase();
    if (!asset) { setError("Informe o ativo"); return; }
    const amountAbs = Math.abs(Number(String(form.amount).replace(",", ".")) || 0);
    const signed = form.result === "WIN" ? amountAbs : form.result === "LOSS" ? -amountAbs : 0;
    const risk = Number(String(form.risk || defaultRisk).replace(",", "."));
    const session = getCurrentSession(config, portfolio).session;
    setSaving(true);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolio,
          date: form.date,
          time: form.time,
          asset,
          direction: form.direction,
          session,
          resultAmount: signed,
          riskAmount: Number.isFinite(risk) && risk > 0 ? risk : undefined,
          followedPlan: form.followedPlan,
          tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
          notes: form.notes || undefined,
          status: "CLOSED",
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
      if (!res.ok) throw new Error(d.details || d.error || `Erro ${res.status}`);
      invalidateTradeCaches();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent";
  const lbl = "text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-1 block";

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md glass-card-strong rounded-t-2xl md:rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text-primary flex items-center gap-2"><Zap size={16} className="text-accent" /> Registro rápido · {portfolio}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Data</label><input type="date" className={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
          <div><label className={lbl}>Hora</label><input type="time" className={input} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
          <div><label className={lbl}>Ativo</label><input className={input} placeholder="EURUSD" value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} list="quick-assets" required /></div>
          <div>
            <label className={lbl}>Direção</label>
            <div className="grid grid-cols-2 gap-1">
              {(["BUY", "SELL"] as const).map((d) => (
                <button key={d} type="button" onClick={() => setForm({ ...form, direction: d })} className={`py-2 rounded-lg text-xs font-extrabold border transition ${form.direction === d ? (d === "BUY" ? "bg-emerald/15 text-emerald border-emerald/30" : "bg-rose/15 text-rose border-rose/30") : "border-border text-text-muted hover:bg-surface-3"}`}>{d === "BUY" ? "COMPRA" : "VENDA"}</button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className={lbl}>Resultado</label>
          <div className="grid grid-cols-3 gap-1">
            {(["WIN", "LOSS", "BE"] as const).map((r) => (
              <button key={r} type="button" onClick={() => setForm({ ...form, result: r })} className={`py-2 rounded-lg text-xs font-extrabold border transition ${form.result === r ? (r === "WIN" ? "bg-emerald/15 text-emerald border-emerald/30" : r === "LOSS" ? "bg-rose/15 text-rose border-rose/30" : "bg-sky/15 text-sky border-sky/30") : "border-border text-text-muted hover:bg-surface-3"}`}>{r === "BE" ? "EMPATE" : r}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Valor ({config?.currency || "USD"})</label><input inputMode="decimal" className={input} placeholder="0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} disabled={form.result === "BE"} /></div>
          <div><label className={lbl}>Risco (1R em {config?.currency || "USD"})</label><input inputMode="decimal" className={input} placeholder={defaultRisk || "opcional"} value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })} /></div>
        </div>

        <div>
          <label className={lbl}>Etiquetas (opcional)</label>
          <input className={input} placeholder="FOMO, notícia, A+ setup" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </div>

        <div>
          <label className={lbl}>Nota (opcional)</label>
          <input className={input} placeholder="ex.: FVG H1 após CPI" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={form.followedPlan} onChange={(e) => setForm({ ...form, followedPlan: e.target.checked })} className="accent-emerald-500" /> Segui o plano
        </label>

        {error && <p className="text-xs text-rose">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-1">
          <Link href="/operacoes/novo" className="text-[11px] text-sky hover:underline">Formulário completo →</Link>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-bold rounded-xl shadow-lg shadow-accent/20 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} Salvar
          </button>
        </div>
        <datalist id="quick-assets">
          {Array.from(new Set(trades.map((t) => t.asset))).slice(0, 30).map((a) => <option key={a} value={a} />)}
        </datalist>
      </form>
    </div>
  );
}
