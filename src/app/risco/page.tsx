"use client";

import { useMemo, useState, useEffect } from "react";
import { ShieldCheck, AlertTriangle, Save, PauseCircle } from "lucide-react";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { calculateMetrics, buildCalendarData } from "@/lib/calculations";
import { computeAccount } from "@/lib/account";
import { formatCurrency, formatNumber } from "@/lib/utils";
import NumberInput from "@/components/NumberInput";
import PositionSizeCalculator from "@/components/PositionSizeCalculator";

export default function RiscoPage() {
  const { trades } = useTrades();
  const { config, save } = useConfig();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ riskPerTrade: 250, riskPercent: 2.5, dailyGoal: 500, dailyLossLimit: 350, maxDrawdown: 15 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        riskPerTrade: Number(config.riskPerTrade) || 250,
        riskPercent: Number(config.riskPercent) || 2.5,
        dailyGoal: Number(config.dailyGoal) || 500,
        dailyLossLimit: Number(config.dailyLossLimit) || 350,
        maxDrawdown: Number(config.maxDrawdown) || 15,
      });
    }
  }, [config]);

  const initialCapital = config?.initialCapital ?? 10000;
  const metrics = useMemo(() => calculateMetrics(trades, initialCapital), [trades, initialCapital]);
  const account = useMemo(() => computeAccount(trades, config), [trades, config]);
  const calendarMap = useMemo(() => buildCalendarData(trades), [trades]);

  const todayKey = new Date().toISOString().split("T")[0];
  const lastDayKey = useMemo(() => {
    const keys = Array.from(calendarMap.keys()).sort();
    return keys.length > 0 ? keys[keys.length - 1] : todayKey;
  }, [calendarMap, todayKey]);
  const todayResult = calendarMap.get(lastDayKey)?.result ?? 0;

  const ddProgress = Math.min(100, (metrics.currentDrawdown / (form.maxDrawdown || 1)) * 100);
  const dailyLossProgress = form.dailyLossLimit > 0 ? Math.min(100, (Math.abs(Math.min(0, todayResult)) / form.dailyLossLimit) * 100) : 0;
  const dailyGoalProgress = form.dailyGoal > 0 ? Math.min(100, (Math.max(0, todayResult) / form.dailyGoal) * 100) : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Gestão de Risco</h1>
          <p className="text-sm text-slate-muted mt-1">Controle de risco e limites da conta</p>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald/10 border border-emerald/30 text-emerald text-xs font-bold rounded-xl hover:bg-emerald/20 transition">Editar limites</button>
        ) : (
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-xs font-bold rounded-xl transition disabled:opacity-60">
            <Save size={14} /> {saving ? "Salvando..." : "Salvar"}
          </button>
        )}
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-1">Capital Inicial</h3>
          <p className="text-2xl font-extrabold text-text-primary">{formatCurrency(initialCapital)}</p>
        </div>
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-1">Risco por Operação</h3>
          {editing ? (
            <>
              <NumberInput value={form.riskPerTrade} onChange={(v) => setForm({ ...form, riskPerTrade: v })} className="w-full bg-dark-800 border border-white/10 rounded-lg px-2 py-1 text-lg font-extrabold text-emerald mb-1 focus:outline-none focus:ring-1 focus:ring-emerald/40" />
              <div className="flex items-center gap-1">
                <NumberInput value={form.riskPercent} onChange={(v) => setForm({ ...form, riskPercent: v })} className="w-16 bg-dark-800 border border-white/10 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald/40" />
                <span className="text-[10px] text-slate-muted">% do capital</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-2xl font-extrabold text-emerald">{formatCurrency(form.riskPerTrade)}</p>
              <p className="text-[10px] text-slate-muted">{formatNumber(form.riskPercent)}% do capital</p>
            </>
          )}
        </div>
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-1">Meta Diária</h3>
          {editing ? (
            <NumberInput value={form.dailyGoal} onChange={(v) => setForm({ ...form, dailyGoal: v })} className="w-full bg-dark-800 border border-white/10 rounded-lg px-2 py-1 text-lg font-extrabold text-amber focus:outline-none focus:ring-1 focus:ring-amber/40" />
          ) : (
            <p className="text-2xl font-extrabold text-amber">{formatCurrency(form.dailyGoal)}</p>
          )}
        </div>
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-1">Limite de Perda Diária</h3>
          {editing ? (
            <NumberInput value={form.dailyLossLimit} onChange={(v) => setForm({ ...form, dailyLossLimit: v })} className="w-full bg-dark-800 border border-white/10 rounded-lg px-2 py-1 text-lg font-extrabold text-rose focus:outline-none focus:ring-1 focus:ring-rose/40" />
          ) : (
            <p className="text-2xl font-extrabold text-rose">-{formatCurrency(form.dailyLossLimit)}</p>
          )}
        </div>
      </section>

      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <h2 className="text-base font-bold text-text-primary mb-4">Limites Configurados</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-muted uppercase mb-2">Limite de Drawdown</h4>
            {editing ? (
              <NumberInput value={form.maxDrawdown} onChange={(v) => setForm({ ...form, maxDrawdown: v })} className="w-full bg-dark-800 border border-white/10 rounded-lg px-2 py-1 text-lg font-extrabold text-rose mb-2 focus:outline-none focus:ring-1 focus:ring-rose/40" />
            ) : (
              <p className="text-xl font-extrabold text-rose">-{formatNumber(form.maxDrawdown)}%</p>
            )}
            <p className="text-[10px] text-slate-muted mb-1">Atual: -{formatNumber(metrics.currentDrawdown)}%</p>
            <div className="w-full h-1.5 bg-dark-800 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-gradient-to-r from-rose to-rose-bright rounded-full" style={{ width: `${ddProgress}%` }} />
            </div>
          </div>
          <div className="glass-card p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-muted uppercase mb-2">Limite Diário (último dia)</h4>
            <p className="text-xl font-extrabold text-amber">-{formatCurrency(form.dailyLossLimit)}</p>
            <p className="text-[10px] text-slate-muted mb-1">Resultado do dia: {todayResult >= 0 ? "+" : ""}{formatCurrency(todayResult)}</p>
            <div className="w-full h-1.5 bg-dark-800 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-gradient-to-r from-amber to-amber/70 rounded-full" style={{ width: `${dailyLossProgress}%` }} />
            </div>
          </div>
          <div className="glass-card p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-muted uppercase mb-2">Meta Diária (último dia)</h4>
            <p className="text-xl font-extrabold text-emerald">+{formatCurrency(form.dailyGoal)}</p>
            <p className="text-[10px] text-slate-muted mb-1">Progresso: {formatNumber(dailyGoalProgress, 0)}%</p>
            <div className="w-full h-1.5 bg-dark-800 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-gradient-to-r from-emerald to-emerald-bright rounded-full" style={{ width: `${dailyGoalProgress}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* Risk Engine Status */}
      <section className="glass-card-strong p-5 md:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-text-primary">Risk Engine</h2>
          {account.riskUsedToday >= (config?.riskPercent || 2.5) * (account.equity / 100) * (config?.maxTradesPerDay || 5) ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose/10 text-rose border border-rose/20 text-[11px] font-bold"><PauseCircle size={12} /> TRADING PAUSED</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald/10 text-emerald border border-emerald/20 text-[11px] font-bold">Trading ativo</span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RiskCard label="Risk Used Today" value={`${formatNumber(account.riskUsedTodayPercent)}%`} sub={`${formatCurrency(account.riskUsedToday)}`} />
          <RiskCard label="Risk Remaining" value={formatCurrency(account.riskRemaining)} sub="hoje" />
          <RiskCard label="Weekly Risk" value={`${formatNumber(Math.min(100, account.weeklyRiskUsedPercent))}%`} sub={`de ${formatNumber(config?.weeklyRiskLimit || 5)}%`} />
          <RiskCard label="Open Risk" value={`${formatNumber((account.openRisk / (account.equity || 1)) * 100)}%`} sub={`max ${formatNumber(config?.maxOpenRisk || 2)}%`} />
        </div>
      </section>

      <section className="glass-card-strong p-5 md:p-6">
        <h2 className="text-base font-bold text-text-primary mb-4">Alertas Ativos</h2>
        <div className="space-y-3">
          {ddProgress >= 50 && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber/5 border border-amber/10">
              <AlertTriangle size={18} className="text-amber shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber">Você atingiu {Math.round(ddProgress)}% do limite de drawdown</p>
                <p className="text-xs text-slate-muted">Considerar reduzir risco nas próximas operações.</p>
              </div>
            </div>
          )}
          {metrics.currentLossSequence >= 3 && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-rose/5 border border-rose/10">
              <ShieldCheck size={18} className="text-rose shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-rose">{metrics.currentLossSequence} perdas consecutivas detectadas</p>
                <p className="text-xs text-slate-muted">Revisar disciplina antes de continuar operando.</p>
              </div>
            </div>
          )}
          {ddProgress < 50 && metrics.currentLossSequence < 3 && (
            <p className="text-xs text-text-muted text-center py-4">Nenhum alerta de risco no momento.</p>
          )}
        </div>
      </section>

      {/* Position Size Calculator */}
      <section className="glass-card-strong p-5 md:p-6">
        <PositionSizeCalculator />
      </section>
    </div>
  );
}

function RiskCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="glass-card p-3 rounded-xl">
      <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{label}</p>
      <p className="text-sm font-extrabold text-text-primary mt-0.5">{value}</p>
      <p className="text-[10px] text-text-muted">{sub}</p>
    </div>
  );
}
