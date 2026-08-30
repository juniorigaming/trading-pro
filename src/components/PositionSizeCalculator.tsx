"use client";
import { useMemo, useState } from "react";
import { Calculator, DollarSign, MoveVertical, HelpCircle } from "lucide-react";
import { ASSET_SPECS, calculatePositionSize } from "@/lib/position-size";
import { useConfig } from "@/hooks/useTradeData";
import NumberInput from "./NumberInput";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function PositionSizeCalculator() {
  const { config } = useConfig();
  const [balance, setBalance] = useState<number>(config?.initialCapital || 10000);
  const [riskPercent, setRiskPercent] = useState<number>(config?.riskPercent || 2.5);
  const [asset, setAsset] = useState<string>("EURUSD");
  const [entry, setEntry] = useState<number>(1.085);
  const [stop, setStop] = useState<number>(1.083);

  const result = useMemo(
    () => calculatePositionSize(balance, riskPercent, asset, entry, stop),
    [balance, riskPercent, asset, entry, stop]
  );

  const spec = ASSET_SPECS[asset.toUpperCase()];

  return (
    <div className="glass-card-strong p-5 md:p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Calculator size={16} className="text-accent" /></div>
        <h2 className="text-base font-bold text-text-primary">Position Size Calculator</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Account Balance</label>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-text-muted"><DollarSign size={15} /></span>
            <NumberInput value={balance} onChange={setBalance} className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Risk %</label>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-text-muted"><MoveVertical size={15} /></span>
            <NumberInput value={riskPercent} onChange={setRiskPercent} className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Asset</label>
          <select value={asset} onChange={(e) => setAsset(e.target.value)} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40 appearance-none cursor-pointer">
            {Object.keys(ASSET_SPECS).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Entry</label>
            <NumberInput value={entry} onChange={setEntry} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Stop Loss</label>
            <NumberInput value={stop} onChange={setStop} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40" />
          </div>
        </div>
      </div>

      {result ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ResultCell label="Risk $" value={formatCurrency(result.riskAmount)} />
          <ResultCell label="Stop Distance" value={formatNumber(result.stopDistance, 5)} />
          <ResultCell label="Pips" value={formatNumber(result.pips, 1)} />
          <ResultCell label="Ticks" value={formatNumber(result.ticks, 0)} />
          <ResultCell label="Position Size" value={`${formatNumber(result.unitsPerRisk, 2)} ${spec ? "lots" : ""}`} highlight />
        </div>
      ) : (
        <p className="text-xs text-text-muted text-center py-6">Preencha saldo, risco, ativo, entrada e stop para calcular.</p>
      )}
      <p className="text-[11px] text-text-muted mt-4 flex items-center gap-1.5">
        <HelpCircle size={12} /> Especificações por ativo configuráveis (pip, tick, contrato) — posição recomendada pelo risco, sem gerenciar alavancagem.
      </p>
    </div>
  );
}

function ResultCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`glass-card p-3 rounded-xl ${highlight ? "border-accent" : ""}`}>
      <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{label}</p>
      <p className={`text-sm font-extrabold mt-0.5 ${highlight ? "text-accent" : "text-text-primary"}`}>{value}</p>
    </div>
  );
}
