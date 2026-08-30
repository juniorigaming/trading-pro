"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Check, X, Target } from "lucide-react";
import Link from "next/link";
import { setupScore } from "@/lib/scores";
import { ASSET_SPECS } from "@/lib/position-size";

const ASSETS = Object.keys(ASSET_SPECS);
const PLAYBOOKS = ["NY Liquidity Reversal", "London Continuation", "HTF POI Reversal", "AMD", "Silver Bullet", "News Displacement", "Custom"];

const READINESS_ITEMS: { key: string; label: string }[] = [
  { key: "macro", label: "Macro" },
  { key: "dxy", label: "DXY" },
  { key: "htf", label: "HTF" },
  { key: "liquidity", label: "Liquidity" },
  { key: "poi", label: "POI" },
  { key: "displacement", label: "Displacement" },
  { key: "mss", label: "MSS" },
  { key: "retracement", label: "Retracement" },
];

export default function NovoPlanejamentoPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
    asset: "EURUSD",
    direction: "BUY" as "BUY" | "SELL",
    session: "Nova York",
    status: "WAITING_TRIGGER",
    playbook: "NY Liquidity Reversal",
    macroBias: "Bullish",
    dxyBias: "Bullish",
    htfBias: "Bullish",
    drawOnLiquidity: "Fundo de Londres",
    poi: "",
    entryZone: "",
    invalidation: "",
    target: "",
    riskPercent: 2.5,
    accountBalanceAtTrade: 10000,
    expectedSession: "NY AM",
    timeStop: "",
    notes: "",
  });
  const [readiness, setReadiness] = useState<Record<string, boolean>>({ macro: true, dxy: true, htf: true, liquidity: true, poi: true, displacement: true, mss: false, retracement: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = useMemo(() => {
    const fake = {
      macroBias: form.macroBias,
      dxyBias: form.dxyBias,
      htfBias: form.htfBias,
      drawOnLiquidity: form.drawOnLiquidity,
      poi: form.poi,
      entryZone: form.entryZone,
      displacement: readiness.displacement,
      choch: readiness.mss,
      fvg: true,
      orderBlock: true,
      premiumDiscount: form.direction === "BUY" ? "Discount" : "Premium",
      plannedRR: 2,
      riskPercent: form.riskPercent,
    };
    return setupScore(fake as never);
  }, [form, readiness]);

  const readyCount = Object.values(readiness).filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        date: form.date,
        time: form.time,
        asset: form.asset,
        direction: form.direction,
        session: form.session,
        status: form.status,
        playbook: form.playbook,
        macroBias: form.macroBias,
        dxyBias: form.dxyBias,
        htfBias: form.htfBias,
        drawOnLiquidity: form.drawOnLiquidity,
        poi: form.poi,
        entryZone: form.entryZone,
        invalidation: form.invalidation,
        riskPercent: Number(form.riskPercent),
        accountBalanceAtTrade: Number(form.accountBalanceAtTrade),
        expectedSession: form.expectedSession,
        timeStop: form.timeStop,
        notes: form.notes,
        resultAmount: 0,
        resultType: "BREAK EVEN",
        setupScore: score?.score ?? null,
        followedPlan: true,
      };
      const res = await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao salvar planejamento");
      }
      router.push("/planejamento");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
      <header className="mb-6 md:mb-8">
        <Link href="/planejamento" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary mb-3 transition"><ArrowLeft size={14} /> Voltar</Link>
        <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Planejar Trade</h1>
        <p className="text-sm text-text-muted mt-1">Registre o contexto antes da entrada. Sem resultado financeiro nesta etapa.</p>
      </header>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card-strong p-5 md:p-6">
          {error && <div className="mb-4 p-3 rounded-xl bg-rose/10 border border-rose/20 text-xs text-rose font-medium">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Data" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
            <Field label="Horário" type="time" value={form.time} onChange={(v) => setForm({ ...form, time: v })} />
            <Select label="Ativo" value={form.asset} onChange={(v) => setForm({ ...form, asset: v })} options={ASSETS} />
            <Select label="Direção" value={form.direction} onChange={(v) => setForm({ ...form, direction: v as "BUY" | "SELL" })} options={["BUY", "SELL"]} />
            <Select label="Sessão" value={form.session} onChange={(v) => setForm({ ...form, session: v })} options={["Ásia", "Londres", "Nova York", "Outro"]} />
            <Select label="Playbook" value={form.playbook} onChange={(v) => setForm({ ...form, playbook: v })} options={PLAYBOOKS} />
            <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={["WATCHLIST", "PLANNED", "WAITING_TRIGGER", "READY"]} />
            <Select label="Expected Expansion" value={form.expectedSession} onChange={(v) => setForm({ ...form, expectedSession: v })} options={["Asia", "London", "NY AM", "NY PM"]} />
            <Select label="Macro Bias" value={form.macroBias} onChange={(v) => setForm({ ...form, macroBias: v })} options={["Bullish", "Bearish", "Neutro"]} />
            <Select label="DXY Bias" value={form.dxyBias} onChange={(v) => setForm({ ...form, dxyBias: v })} options={["Bullish", "Bearish", "Neutro"]} />
            <Select label="HTF Bias" value={form.htfBias} onChange={(v) => setForm({ ...form, htfBias: v })} options={["Bullish", "Bearish", "Neutro"]} />
            <Field label="Draw on Liquidity" value={form.drawOnLiquidity} onChange={(v) => setForm({ ...form, drawOnLiquidity: v })} />
            <Field label="POI" value={form.poi} onChange={(v) => setForm({ ...form, poi: v })} />
            <Field label="Entry Zone" value={form.entryZone} onChange={(v) => setForm({ ...form, entryZone: v })} />
            <Field label="Invalidation" value={form.invalidation} onChange={(v) => setForm({ ...form, invalidation: v })} />
            <Field label="Risco %" type="number" value={String(form.riskPercent)} onChange={(v) => setForm({ ...form, riskPercent: Number(v) })} />
            <Field label="Saldo da Conta" type="number" value={String(form.accountBalanceAtTrade)} onChange={(v) => setForm({ ...form, accountBalanceAtTrade: Number(v) })} />
            <Field label="Time Stop" value={form.timeStop} onChange={(v) => setForm({ ...form, timeStop: v })} placeholder="Ex: 12:00" />
          </div>
        </div>

        <div className="glass-card-strong p-5 md:p-6 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Target size={16} className="text-accent" /></div>
            <h2 className="text-base font-bold text-text-primary">Setup Readiness</h2>
          </div>
          <div className="space-y-1.5 mb-4">
            {READINESS_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center justify-between p-2 rounded-lg bg-surface-2 border border-border hover:bg-surface-3 transition cursor-pointer text-xs">
                <span className="flex items-center gap-2 text-text-secondary">{readiness[item.key] ? <Check size={13} className="text-emerald" /> : <X size={13} className="text-text-muted" />} {item.label}</span>
                <input type="checkbox" checked={!!readiness[item.key]} onChange={(e) => setReadiness({ ...readiness, [item.key]: e.target.checked })} className="w-4 h-4 accent-[var(--user-accent)]" />
              </label>
            ))}
          </div>

          <div className="glass-card p-4 rounded-xl text-center mb-4">
            <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Setup Score</p>
            <p className={`text-3xl font-extrabold ${score && score.score >= 70 ? "text-emerald" : score && score.score >= 60 ? "text-amber" : "text-rose"}`}>{score ? score.score : 0}/100</p>
            <p className={`text-xs font-bold mt-1 ${score && score.score >= 70 ? "text-emerald" : "text-rose"}`}>{score ? score.grade : "—"}</p>
          </div>
          <p className="text-[11px] text-text-muted text-center mb-4">{readyCount}/8 critérios atendidos · {score ? score.breakdown.filter((b) => b.ok).length : 0} confluências</p>

          <button type="submit" disabled={saving} className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-bold rounded-xl transition disabled:opacity-60">
            <Save size={16} /> {saving ? "Salvando..." : "Salvar Planejamento"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, placeholder }: { label: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40 transition" />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40 appearance-none cursor-pointer">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
