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
  NotebookPen,
} from "lucide-react";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { calculateMetrics } from "@/lib/calculations";
import { formatCurrency } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Operações", href: "/operacoes", icon: ListChecks },
  { label: "Planejamento", href: "/planejamento", icon: NotebookPen },
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
        className="fixed top-4 left-4 z-50 md:hidden p-2.5 rounded-xl bg-surface-2 border border-border text-text-primary hover:bg-surface-3 transition shadow-lg"
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
        className={`fixed top-0 left-0 z-40 h-full bg-surface border-r border-border flex flex-col md:translate-x-0 transition-all duration-300 ease-out md:shadow-none shadow-2xl ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-20 w-72" : "w-72"}`}
      >
        {/* Header */}
        <div className={`flex items-center gap-3 border-b border-border ${collapsed ? "md:px-0 md:justify-center px-5 py-5" : "px-5 py-5"}`}>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-text-secondary hover:text-text-primary"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>

          {/* Collapse toggle (desktop) — 3 tracinhos */}
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-3 transition shrink-0"
            aria-label={collapsed ? "Expandir menu" : "Encolher menu"}
            title={collapsed ? "Expandir menu" : "Encolher menu"}
          >
            <Menu size={22} />
          </button>

          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-accent to-sky flex items-center justify-center shadow-lg shadow-accent/20 shrink-0">
                <TrendingUp size={18} className="text-text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[15px] font-bold leading-tight tracking-tight text-text-primary truncate">Trading Pro</h1>
                <p className="text-[10px] text-text-muted tracking-wide">TRADING INTELLIGENCE</p>
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
                  collapsed ? "md:justify-center md:px-0 px-3.5 py-3" : "px-3.5 py-3"
                } ${
                  isActive
                    ? "bg-accent-soft text-accent border border-accent-soft shadow-[0_0_15px_rgba(0,0,0,0.1)]"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-3"
                }`}
              >
                <Icon size={20} className={isActive ? "text-accent" : "text-text-muted"} />
                <span className={`flex-1 ${collapsed ? "md:hidden" : ""}`}>{item.label}</span>
                {isActive && !collapsed && <ChevronRight size={14} className="text-accent/70" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`border-t border-border ${collapsed ? "md:px-2 px-4 py-4" : "px-4 py-4"}`}>
          {!collapsed && (
            <div className="glass-card p-3 rounded-xl">
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">Saldo</p>
              <p className={`text-lg font-bold ${metrics.netResult >= 0 ? "text-emerald" : "text-rose"}`}>{formatCurrency(metrics.currentCapital)}</p>
              <p className={`text-[10px] mt-0.5 font-semibold ${metrics.growthPercent >= 0 ? "text-emerald" : "text-rose"}`}>
                {metrics.growthPercent >= 0 ? "+" : ""}{metrics.growthPercent.toFixed(2)}%
              </p>
              <div className="w-full h-1 mt-2 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${metrics.growthPercent >= 0 ? "bg-accent" : "bg-rose"}`}
                  style={{ width: `${growthClamped}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
