"use client";
import { TrendingUp, Minus, ArrowUpRight, ArrowDownRight } from "lucide-react";

export interface StatDelta {
  /** texto curto: "+12,5%", "−3 pts" */
  text: string;
  /** cor: up = verde, down = vermelho, flat = neutro */
  tone: "up" | "down" | "flat";
  /** legenda: "vs 30 dias anteriores" */
  label?: string;
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  neutral?: boolean;
  /** comparação com o período anterior (opcional) */
  delta?: StatDelta | null;
}

export default function StatCard({ label, value, sub, positive, neutral, delta }: StatCardProps) {
  return (
    <div className="glass-card p-5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-3 opacity-[0.04] group-hover:opacity-[0.08] transition">
        <TrendingUp size={64} />
      </div>
      <p className="text-xs font-medium text-slate-muted uppercase tracking-wider mb-3">{label}</p>
      <div className="flex items-end gap-2">
        <h3 className={`text-2xl font-extrabold tracking-tight ${positive ? "text-emerald text-glow-emerald" : neutral ? "text-sky" : "text-rose"}`}>
          {value}
        </h3>
        {positive && <ArrowUpRight size={18} className="text-emerald mb-1.5" />}
        {positive === false && <ArrowDownRight size={18} className="text-rose mb-1.5" />}
        {neutral && <Minus size={18} className="text-sky mb-1.5" />}
      </div>
      {sub && <p className="text-[11px] text-slate-muted mt-2">{sub}</p>}
      {delta && (
        <p className="text-[10px] mt-1.5 flex items-center gap-1" title={delta.label}>
          <span className={`font-bold px-1.5 py-0.5 rounded-md ${
            delta.tone === "up" ? "bg-emerald/10 text-emerald" : delta.tone === "down" ? "bg-rose/10 text-rose" : "bg-surface-3 text-text-muted"
          }`}>{delta.text}</span>
          {delta.label && <span className="text-slate-muted">{delta.label}</span>}
        </p>
      )}
    </div>
  );
}
