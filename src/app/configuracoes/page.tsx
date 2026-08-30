"use client";

import { useEffect, useState } from "react";
import { Save, Trash2, Database, CheckCircle2, Palette, Wallet, ShieldAlert, Beaker } from "lucide-react";
import { useConfig, useTrades } from "@/hooks/useTradeData";
import { useTheme } from "@/components/ThemeProvider";
import AppearanceControls from "@/components/AppearanceControls";
import NumberInput from "@/components/NumberInput";

export default function ConfiguracoesPage() {
  const { config, save } = useConfig();
  const { trades, refetch } = useTrades();
  const { prefs } = useTheme();
  const [form, setForm] = useState({
    accountName: "Minha Conta",
    initialCapital: 10000,
    currency: "USD",
    riskPerTrade: 250,
    riskPercent: 2.5,
    dailyGoal: 500,
    dailyLossLimit: 350,
    maxDrawdown: 15,
    totalDeposits: 0,
    totalWithdrawals: 0,
    weeklyRiskLimit: 5,
    monthlyDrawdownLimit: 10,
    maxOpenRisk: 2,
    maxCorrelatedExposure: 3,
    maxTradesPerDay: 5,
    sampleSizeWarning: 30,
    sampleSizeLow: 10,
    sessionAsiaStart: "21:00",
    sessionAsiaEnd: "01:00",
    sessionLondonStart: "03:00",
    sessionLondonEnd: "06:00",
    sessionNYStart: "08:00",
    sessionNYEnd: "13:00",
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) setForm(config as never);
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        ...prefs,
      };
      await save(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const removeDemoData = async () => {
    if (!confirm("Remover todos os dados de demonstração?")) return;
    await fetch("/api/trades/demo", { method: "DELETE" });
    refetch();
  };

  const loadDemoData = async () => {
    await fetch("/api/trades/demo", { method: "POST" });
    refetch();
  };

  const hasDemo = trades.some((t) => t.isDemo);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Configurações</h1>
        <p className="text-sm text-text-muted mt-1">Personalize sua conta, aparência e preferências</p>
      </header>

      {/* APARÊNCIA */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Palette size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Aparência</h2>
          <span className="text-[10px] text-text-muted ml-auto">Aplicado em tempo real</span>
        </div>
        <AppearanceControls />
      </section>

      {/* CONTA */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Wallet size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Conta &amp; Capital</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome da Conta" value={form.accountName} onChange={(v) => setForm({ ...form, accountName: String(v) })} />
          <SelectField label="Moeda" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={["USD", "BRL", "EUR", "GBP"]} />
          <Field label="Capital Inicial" type="number" value={String(form.initialCapital)} onChange={(v) => setForm({ ...form, initialCapital: Number(v) })} />
          <Field label="Depósitos" type="number" value={String(form.totalDeposits)} onChange={(v) => setForm({ ...form, totalDeposits: Number(v) })} />
          <Field label="Retiradas" type="number" value={String(form.totalWithdrawals)} onChange={(v) => setForm({ ...form, totalWithdrawals: Number(v) })} />
          <Field label="Risco Padrão ($)" type="number" value={String(form.riskPerTrade)} onChange={(v) => setForm({ ...form, riskPerTrade: Number(v) })} />
          <Field label="Risco Percentual (%)" type="number" step="0.1" value={String(form.riskPercent)} onChange={(v) => setForm({ ...form, riskPercent: Number(v) })} />
          <Field label="Meta Diária ($)" type="number" value={String(form.dailyGoal)} onChange={(v) => setForm({ ...form, dailyGoal: Number(v) })} />
          <Field label="Limite de Perda Diária ($)" type="number" value={String(form.dailyLossLimit)} onChange={(v) => setForm({ ...form, dailyLossLimit: Number(v) })} />
          <Field label="Drawdown Máximo (%)" type="number" value={String(form.maxDrawdown)} onChange={(v) => setForm({ ...form, maxDrawdown: Number(v) })} />
        </div>
      </section>

      {/* RISCO AVANÇADO */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><ShieldAlert size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Limites de Risco (Risk Engine)</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Limite de Risco Semanal (%)" type="number" value={String(form.weeklyRiskLimit)} onChange={(v) => setForm({ ...form, weeklyRiskLimit: Number(v) })} />
          <Field label="Limite Drawdown Mensal (%)" type="number" value={String(form.monthlyDrawdownLimit)} onChange={(v) => setForm({ ...form, monthlyDrawdownLimit: Number(v) })} />
          <Field label="Risco Máximo em Aberto (%)" type="number" value={String(form.maxOpenRisk)} onChange={(v) => setForm({ ...form, maxOpenRisk: Number(v) })} />
          <Field label="Exposição Correlacionada Máx." type="number" value={String(form.maxCorrelatedExposure)} onChange={(v) => setForm({ ...form, maxCorrelatedExposure: Number(v) })} />
          <Field label="Máx. Trades / Dia" type="number" value={String(form.maxTradesPerDay)} onChange={(v) => setForm({ ...form, maxTradesPerDay: Number(v) })} />
        </div>
      </section>

      {/* ESTATÍSTICA */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Beaker size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Limites de Amostra Estatística</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Amostra Baixa Confiabilidade (N)" type="number" value={String(form.sampleSizeLow)} onChange={(v) => setForm({ ...form, sampleSizeLow: Number(v) })} />
          <Field label="Amostra com Aviso (N)" type="number" value={String(form.sampleSizeWarning)} onChange={(v) => setForm({ ...form, sampleSizeWarning: Number(v) })} />
        </div>
      </section>

      {/* HORÁRIOS */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <h2 className="text-base font-bold text-text-primary mb-4">Horários das Sessões (Brasília)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 rounded-xl bg-surface-2 border border-border">
            <p className="text-xs font-bold text-text-primary mb-2">Ásia</p>
            <div className="flex gap-2">
              <Field label="Início" type="time" value={form.sessionAsiaStart} onChange={(v) => setForm({ ...form, sessionAsiaStart: String(v) })} />
              <Field label="Fim" type="time" value={form.sessionAsiaEnd} onChange={(v) => setForm({ ...form, sessionAsiaEnd: String(v) })} />
            </div>
          </div>
          <div className="p-3 rounded-xl bg-surface-2 border border-border">
            <p className="text-xs font-bold text-text-primary mb-2">Londres</p>
            <div className="flex gap-2">
              <Field label="Início" type="time" value={form.sessionLondonStart} onChange={(v) => setForm({ ...form, sessionLondonStart: String(v) })} />
              <Field label="Fim" type="time" value={form.sessionLondonEnd} onChange={(v) => setForm({ ...form, sessionLondonEnd: String(v) })} />
            </div>
          </div>
          <div className="p-3 rounded-xl bg-surface-2 border border-border">
            <p className="text-xs font-bold text-text-primary mb-2">Nova York</p>
            <div className="flex gap-2">
              <Field label="Início" type="time" value={form.sessionNYStart} onChange={(v) => setForm({ ...form, sessionNYStart: String(v) })} />
              <Field label="Fim" type="time" value={form.sessionNYEnd} onChange={(v) => setForm({ ...form, sessionNYEnd: String(v) })} />
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end mb-6">
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-bold rounded-xl shadow-lg shadow-accent/20 transition active:scale-[0.98] disabled:opacity-60">
          {saved ? <CheckCircle2 size={16} /> : <Save size={16} />} {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar Configurações"}
        </button>
      </div>

      <section className="glass-card-strong p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database size={16} className="text-sky" />
          <h2 className="text-base font-bold text-text-primary">Dados de Demonstração</h2>
        </div>
        <p className="text-xs text-text-muted mb-4">Use dados fictícios para testar o dashboard, gráficos e métricas. Eles são claramente identificados e podem ser removidos a qualquer momento.</p>
        <div className="flex gap-3">
          <button onClick={loadDemoData} disabled={hasDemo} className="text-xs font-bold text-sky hover:underline disabled:opacity-40 disabled:no-underline">Carregar dados de demonstração</button>
          <button onClick={removeDemoData} disabled={!hasDemo} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose hover:underline disabled:opacity-40 disabled:no-underline">
            <Trash2 size={13} /> Remover dados de demonstração
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, step }: { label: string; type?: string; value: string; onChange: (v: string | number) => void; step?: string }) {
  const base = "w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40 transition";
  if (type === "number") {
    return (
      <div className="flex flex-col gap-1.5 flex-1">
        <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">{label}</label>
        <NumberInput value={value} onChange={onChange} className={base} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 flex-1">
      <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">{label}</label>
      <input type={type} value={String(value)} onChange={(e) => onChange(e.target.value)} className={base} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40 transition appearance-none cursor-pointer">
        {options.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}
