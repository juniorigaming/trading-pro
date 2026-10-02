"use client";
import type { ReactNode } from "react";
import { ArrowUp, ArrowDown, Minus, AlertTriangle, Info } from "lucide-react";

/** Tokens de cor do módulo IA — alinhados ao design do app: verde = forte, cinza = neutro, vermelho = fraco, âmbar/laranja = risco. */
export function scoreColor(score: number) { return score >= 0.5 ? "text-emerald" : score <= -0.5 ? "text-rose" : "text-text-muted"; }
export function scoreBg(score: number) { return score >= 1 ? "bg-emerald/20 text-emerald" : score >= 0.5 ? "bg-emerald/10 text-emerald" : score <= -1 ? "bg-rose/20 text-rose" : score <= -0.5 ? "bg-rose/10 text-rose" : "bg-surface-3 text-text-muted"; }
export function riskColor(level: string) { return level === "EXTREME" ? "bg-rose/20 text-rose border-rose/40" : level === "HIGH" ? "bg-orange-500/15 text-orange-400 border-orange-500/40" : level === "MEDIUM" ? "bg-amber/15 text-amber border-amber/40" : "bg-surface-3 text-text-muted border-border"; }
export function classColor(c: string) { return /BULLISH|STRONG/.test(c) ? "text-emerald" : /BEARISH|WEAK/.test(c) ? "text-rose" : "text-text-muted"; }
export function statusColor(s: string) { return s === "READY" ? "bg-emerald/15 text-emerald border-emerald/40" : s === "WAIT" ? "bg-amber/15 text-amber border-amber/40" : "bg-rose/15 text-rose border-rose/40"; }
export const fmtScore = (s: number | null | undefined) => (s == null ? "—" : `${s > 0 ? "+" : ""}${s.toFixed(2)}`);
export const SESSION_LABEL: Record<string, string> = { ASIA: "Ásia", LONDON: "Londres", NEW_YORK: "Nova York" };

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${className}`}>{children}</span>;
}
export function DeltaArrow({ delta }: { delta: number | null | undefined }) {
  if (delta == null || Math.abs(delta) < 0.01) return <Minus size={14} className="text-text-muted" />;
  return delta > 0 ? <ArrowUp size={14} className="text-emerald" /> : <ArrowDown size={14} className="text-rose" />;
}
export function Section({ title, sub, right, children, className = "" }: { title: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass-card p-4 md:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div><h3 className="text-sm font-extrabold text-text-primary">{title}</h3>{sub && <p className="text-[11px] text-text-muted mt-0.5">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}
export function Notice({ kind = "info", children }: { kind?: "info" | "warn" | "error"; children: ReactNode }) {
  const cls = kind === "error" ? "border-rose/40 bg-rose/10 text-rose" : kind === "warn" ? "border-amber/40 bg-amber/10 text-amber" : "border-sky/30 bg-sky/10 text-sky";
  const I = kind === "info" ? Info : AlertTriangle;
  return <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${cls}`}><I size={14} className="mt-0.5 shrink-0" /><div className="min-w-0">{children}</div></div>;
}
export function Btn({ children, onClick, disabled, variant = "primary", type = "button", className = "", title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "ghost" | "danger"; type?: "button" | "submit"; className?: string; title?: string }) {
  const base = "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";
  const v = variant === "primary" ? "bg-accent text-white hover:bg-accent/90 shadow-lg shadow-accent/20" : variant === "danger" ? "bg-rose/15 text-rose border border-rose/30 hover:bg-rose/25" : "border border-border text-text-secondary hover:text-text-primary hover:bg-surface-2";
  return <button type={type} title={title} onClick={onClick} disabled={disabled} className={`${base} ${v} ${className}`}>{children}</button>;
}
export const inputCls = "bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40 w-full";
export const selectCls = "bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none cursor-pointer";

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: React.ComponentType<{ size?: number }> }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold whitespace-nowrap transition ${value === t.id ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:text-text-primary hover:bg-surface-2"}`}>
          {t.icon && <t.icon size={15} />}{t.label}
        </button>
      ))}
    </div>
  );
}
export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center gap-3 text-sm text-text-muted"><div className="w-5 h-5 border-2 border-emerald/30 border-t-emerald rounded-full animate-spin" />{label}</div>;
}
export function PageHeader({ icon: Icon, title, sub, right }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; sub: string; right?: ReactNode }) {
  return (
    <header className="mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center shrink-0"><Icon size={20} className="text-accent" /></div>
          <div><h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">{title}</h1><p className="text-sm text-text-muted mt-0.5">{sub}</p></div>
        </div>
        {right}
      </div>
    </header>
  );
}
