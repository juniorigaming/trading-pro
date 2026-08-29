"use client";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  diff?: number;
  color?: "emerald" | "rose" | "sky" | "amber";
}

export default function MetricTile({ label, value, sub, diff, color = "emerald" }: Props) {
  const colorMap = {
    emerald: { text: "text-emerald", bg: "bg-emerald/10", border: "border-emerald/20", iconBg: "bg-emerald/15" },
    rose: { text: "text-rose", bg: "bg-rose/10", border: "border-rose/20", iconBg: "bg-rose/15" },
    sky: { text: "text-sky", bg: "bg-sky/10", border: "border-sky/20", iconBg: "bg-sky/15" },
    amber: { text: "text-amber", bg: "bg-amber/10", border: "border-amber/20", iconBg: "bg-amber/15" },
  };
  const c = colorMap[color];
  return (
    <div className={`glass-card p-4 hover:border-white/10 transition ${c.border ? `border ${c.border}` : ""}`}>
      <p className="text-[10px] text-slate-muted uppercase tracking-wider font-medium mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-xl font-extrabold ${c.text}`}>{value}</span>
        {diff !== undefined && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${diff > 0 ? "text-emerald" : diff < 0 ? "text-rose" : "text-slate-muted"}`}>
            {diff > 0 ? <ArrowUpRight size={12} /> : diff < 0 ? <ArrowDownRight size={12} /> : <Minus size={12} />}
            {Math.abs(diff).toFixed(2)}%
          </span>
        )}
      </div>
      {sub && <p className="text-[11px] text-slate-muted mt-1.5">{sub}</p>}
    </div>
  );
}
