"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, CheckCircle2, Palette, Wallet, ShieldAlert, Beaker, FileUp, Globe2, Landmark, Bitcoin } from "lucide-react";
import { useConfig, useTrades } from "@/hooks/useTradeData";
import { useTheme } from "@/components/ThemeProvider";
import { usePortfolio } from "@/components/PortfolioProvider";
import AppearanceControls from "@/components/AppearanceControls";
import NumberInput from "@/components/NumberInput";
import BrokerConnect from "@/components/BrokerConnect";
import ImportTrades from "@/components/ImportTrades";
import { PORTFOLIOS, PORTFOLIO_META, type PortfolioId } from "@/lib/portfolio";
import { computeAccount } from "@/lib/account";
import { formatCurrency } from "@/lib/utils";

const WALLET_ICONS: Record<PortfolioId, typeof Globe2> = { FOREX: Globe2, B3: Landmark, CRYPTO: Bitcoin };
const CURRENCIES: Record<PortfolioId, string[]> = { FOREX: ["USD", "EUR", "GBP", "BRL"], B3: ["BRL"], CRYPTO: ["USDT", "USD", "USDC", "BRL"] };

export default function ConfiguracoesPage() {
  const { portfolio: active, setPortfolio: setActivePortfolio } = usePortfolio();
  const [selected, setSelected] = useState<PortfolioId>(active);
  const { config, save, loading: configLoading } = useConfig(selected);
  const { trades } = useTrades(selected);
  const { prefs } = useTheme();
  const meta = PORTFOLIO_META[selected];
  const account = useMemo(() => computeAccount(trades, config), [trades, config]);
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

  // sincroniza a aba selecionada com a carteira ativa quando o usuário troca no menu lateral
  useEffect(() => { Promise.resolve().then(() => setSelected(active)); }, [active]);
  useEffect(() => {
    if (config) Promise.resolve().then(() => setForm(config as never));
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

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Configurações</h1>
        <p className="text-sm text-text-muted mt-1">Carteiras (Forex · B3 · Cripto), importação de operações, aparência e limites</p>
      </header>

      {/* CARTEIRAS */}
      <section className="glass-card-strong p-5 md:p-6 mb-6 scroll-mt-6" id="carteira">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Wallet size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Carteiras</h2>
          <span className="text-[10px] text-text-muted ml-auto">Cada carteira tem saldo, moeda e limites próprios</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5" role="tablist">
          {PORTFOLIOS.map((id) => {
            const m = PORTFOLIO_META[id]; const Icon = WALLET_ICONS[id]; const on = id === selected;
            return (
              <button key={id} type="button" role="tab" aria-selected={on} onClick={() => setSelected(id)} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${on ? `${m.accent.bg} ${m.accent.border}` : "border-border bg-surface-2 hover:bg-surface-3"}`}>
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${on ? `${m.accent.bg} ${m.accent.text}` : "bg-surface-3 text-text-muted"}`}><Icon size={16} /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-text-primary">{m.label} <span className="text-[10px] text-text-muted font-semibold">· {m.currency}</span>{id === active && <span className={`ml-2 text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded ${m.accent.bg} ${m.accent.text}`}>ativa</span>}</span>
                  <span className="block text-[10px] text-text-muted truncate">{m.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="glass-card p-3 rounded-xl"><p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Saldo atual</p><p className="text-sm font-extrabold text-text-primary mt-0.5">{configLoading ? "…" : formatCurrency(account.realizedBalance, form.currency || meta.currency)}</p></div>
          <div className="glass-card p-3 rounded-xl"><p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Resultado</p><p className={`text-sm font-extrabold mt-0.5 ${account.realizedPnl >= 0 ? "text-emerald" : "text-rose"}`}>{account.realizedPnl >= 0 ? "+" : ""}{formatCurrency(account.realizedPnl, form.currency || meta.currency)}</p></div>
          <div className="glass-card p-3 rounded-xl"><p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Operações</p><p className="text-sm font-extrabold text-text-primary mt-0.5">{trades.length}</p></div>
          <div className="glass-card p-3 rounded-xl"><p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Drawdown atual</p><p className="text-sm font-extrabold text-text-primary mt-0.5">-{account.currentDrawdown.toFixed(2)}%</p></div>
        </div>
        <p className="text-[11px] text-text-muted mb-4">Saldo = capital inicial + depósitos − retiradas + resultado das operações da carteira <b className="text-text-primary">{meta.label}</b>. Para &quot;zerar&quot; ou corrigir o saldo, ajuste o capital inicial abaixo.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome da Carteira" value={form.accountName} onChange={(v) => setForm({ ...form, accountName: String(v) })} />
          <SelectField label="Moeda" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={CURRENCIES[selected].includes(form.currency) ? CURRENCIES[selected] : [form.currency, ...CURRENCIES[selected]]} />
          <Field label={`Capital Inicial (${form.currency || meta.currency})`} type="number" value={String(form.initialCapital)} onChange={(v) => setForm({ ...form, initialCapital: Number(v) })} />
          <Field label="Depósitos" type="number" value={String(form.totalDeposits)} onChange={(v) => setForm({ ...form, totalDeposits: Number(v) })} />
          <Field label="Retiradas" type="number" value={String(form.totalWithdrawals)} onChange={(v) => setForm({ ...form, totalWithdrawals: Number(v) })} />
          <Field label={`Risco Padrão (${form.currency || meta.currency})`} type="number" value={String(form.riskPerTrade)} onChange={(v) => setForm({ ...form, riskPerTrade: Number(v) })} />
          <Field label="Risco Percentual (%)" type="number" step="0.1" value={String(form.riskPercent)} onChange={(v) => setForm({ ...form, riskPercent: Number(v) })} />
          <Field label={`Meta Diária (${form.currency || meta.currency})`} type="number" value={String(form.dailyGoal)} onChange={(v) => setForm({ ...form, dailyGoal: Number(v) })} />
          <Field label={`Limite de Perda Diária (${form.currency || meta.currency})`} type="number" value={String(form.dailyLossLimit)} onChange={(v) => setForm({ ...form, dailyLossLimit: Number(v) })} />
          <Field label="Drawdown Máximo (%)" type="number" value={String(form.maxDrawdown)} onChange={(v) => setForm({ ...form, maxDrawdown: Number(v) })} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
          {selected !== active ? (
            <button type="button" onClick={() => setActivePortfolio(selected)} className="text-xs font-bold text-accent hover:underline">Tornar {meta.label} a carteira ativa</button>
          ) : <span className="text-[11px] text-text-muted">Esta é a carteira ativa no painel.</span>}
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-bold rounded-xl shadow-lg shadow-accent/20 hover:bg-accent/90 transition disabled:opacity-50">
            {saved ? <CheckCircle2 size={16} /> : <Save size={16} />} {saving ? "Salvando..." : saved ? "Salvo!" : `Salvar carteira ${meta.label}`}
          </button>
        </div>
      </section>

      {/* IMPORTAÇÃO */}
      <section className="glass-card-strong p-5 md:p-6 mb-6 scroll-mt-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><FileUp size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Importar operações da corretora</h2>
          <span className="text-[10px] text-text-muted ml-auto">Gratuito · MT5 · Profit · Clear/XP · Binance · Bybit · CSV</span>
        </div>
        <ImportTrades defaultPortfolio={selected} />
      </section>

      {/* CORRETORAS - DooPrime Auto Sync */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <BrokerConnect />
      </section>

      {/* APARÊNCIA */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Palette size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Aparência</h2>
          <span className="text-[10px] text-text-muted ml-auto">Aplicado em tempo real</span>
        </div>
        <AppearanceControls />
      </section>

      {/* RISCO AVANÇADO */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><ShieldAlert size={16} className="text-accent" /></div>
          <h2 className="text-base font-bold text-text-primary">Limites de Risco (Risk Engine) · {meta.label}</h2>
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
        <h2 className="text-base font-bold text-text-primary mb-1">Horários das Sessões Forex (Brasília)</h2>
        <p className="text-[11px] text-text-muted mb-4">Usados no status de sessão da carteira Forex. B3 usa o pregão (09:00–18:25) e Cripto é 24h.</p>
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
          {saved ? <CheckCircle2 size={16} /> : <Save size={16} />} {saving ? "Salvando..." : saved ? "Salvo!" : `Salvar Configurações (${meta.label})`}
        </button>
      </div>
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
