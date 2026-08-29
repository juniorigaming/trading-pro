"use client";
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  neutral?: boolean;
}

export default function StatCard({ label, value, sub, positive, neutral }: StatCardProps) {
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
    </div>
  );
}
