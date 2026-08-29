"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  BarChart3,
  ShieldCheck,
  Target,
  Globe,
  Settings,
  Menu,
  X,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { calculateMetrics } from "@/lib/calculations";
import { formatCurrency } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Operações", href: "/operacoes", icon: ListChecks },
  { label: "Calendário", href: "/calendario", icon: CalendarDays },
  { label: "Análises", href: "/analises", icon: BarChart3 },
  { label: "Gestão de Risco", href: "/risco", icon: ShieldCheck },
  { label: "Setup / Estratégia", href: "/setup", icon: Target },
  { label: "Macroeconomia", href: "/macro", icon: Globe },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { trades } = useTrades();
  const { config } = useConfig();
  const initialCapital = config?.initialCapital ?? 10000;
  const metrics = calculateMetrics(trades, initialCapital);
  const growthClamped = Math.max(0, Math.min(100, 50 + metrics.growthPercent));

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden p-2.5 rounded-xl bg-dark-850 border border-white/10 text-white hover:bg-dark-800 transition shadow-lg"
        aria-label="Abrir menu"
      >
        <Menu size={22} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-full bg-black border-r border-white/10 flex flex-col md:translate-x-0 transition-all duration-300 ease-out md:shadow-none shadow-2xl ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-20 w-72" : "w-72"}`}
      >
        {/* Header */}
        <div className={`flex items-center gap-3 border-b border-white/10 ${collapsed ? "md:px-0 md:justify-center px-5 py-5" : "px-5 py-5"}`}>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-slate-300 hover:text-white"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>

          {/* Collapse toggle (desktop) — 3 tracinhos */}
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex p-2 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition shrink-0"
            aria-label={collapsed ? "Expandir menu" : "Encolher menu"}
            title={collapsed ? "Expandir menu" : "Encolher menu"}
          >
            <Menu size={22} />
          </button>

          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-emerald to-sky flex items-center justify-center shadow-lg shadow-emerald/20 shrink-0">
                <TrendingUp size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[15px] font-bold leading-tight tracking-tight text-white truncate">Trading Pro</h1>
                <p className="text-[10px] text-slate-400 tracking-wide">DIÁRIO PROFISSIONAL</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  collapsed ? "md:justify-center md:px-0 px-3.5 py-3" : "px-3.5 py-2.5"
                } ${
                  isActive
                    ? "bg-emerald/15 text-emerald border border-emerald/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                    : "text-slate-200 hover:text-white hover:bg-white/[0.08]"
                }`}
              >
                <Icon size={20} className={isActive ? "text-emerald" : "text-slate-300"} />
                <span className={`flex-1 ${collapsed ? "md:hidden" : ""}`}>{item.label}</span>
                {isActive && !collapsed && <ChevronRight size={14} className="text-emerald/70" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`border-t border-white/10 ${collapsed ? "md:px-2 px-4 py-4" : "px-4 py-4"}`}>
          {collapsed ? (
            <div className="hidden md:flex flex-col items-center gap-1" title={`Saldo atual: ${formatCurrency(metrics.currentCapital)}`}>
              <span className={`text-[10px] font-bold ${metrics.growthPercent >= 0 ? "text-emerald" : "text-rose"}`}>
                {metrics.growthPercent >= 0 ? "+" : ""}{metrics.growthPercent.toFixed(1)}%
              </span>
              <div className={`w-2.5 h-2.5 rounded-full ${metrics.netResult >= 0 ? "bg-emerald" : "bg-rose"}`} />
            </div>
          ) : null}
          <div className={`glass-card p-3 rounded-xl ${collapsed ? "md:hidden" : ""}`}>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Saldo Atual</p>
            <p className={`text-lg font-bold ${metrics.netResult >= 0 ? "text-white" : "text-rose"}`}>{formatCurrency(metrics.currentCapital)}</p>
            <p className={`text-[10px] mt-0.5 font-semibold ${metrics.growthPercent >= 0 ? "text-emerald" : "text-rose"}`}>
              {metrics.growthPercent >= 0 ? "+" : ""}{metrics.growthPercent.toFixed(2)}% desde o início
            </p>
            <div className="w-full h-1 mt-2 bg-dark-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${metrics.growthPercent >= 0 ? "bg-gradient-to-r from-emerald to-emerald-bright" : "bg-gradient-to-r from-rose to-rose-bright"}`}
                style={{ width: `${growthClamped}%` }}
              />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
