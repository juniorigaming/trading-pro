"use client";
import { useEffect, useState } from "react";
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
  BrainCircuit,
  Trophy,
  Crosshair,
  BookOpenCheck,
  PieChart,
  Landmark,
  ChevronDown,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { calculateMetrics } from "@/lib/calculations";
import { formatCurrency } from "@/lib/utils";
import { usePortfolio } from "@/components/PortfolioProvider";
import { PORTFOLIOS, PORTFOLIO_META } from "@/lib/portfolio";

interface NavLeaf { label: string; href: string; icon: LucideIcon }
interface NavGroup { label: string; icon: LucideIcon; children: NavLeaf[] }
type NavEntry = NavLeaf | NavGroup;
const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

/**
 * Menu agrupado (15 → 7 entradas). Todas as rotas antigas continuam existindo —
 * apenas foram organizadas em grupos colapsáveis.
 */
const navItems: NavEntry[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    label: "Operações", icon: ListChecks, children: [
      { label: "Operações", href: "/operacoes", icon: ListChecks },
      { label: "Planejamento", href: "/planejamento", icon: NotebookPen },
      { label: "Calendário", href: "/calendario", icon: CalendarDays },
    ],
  },
  {
    label: "Análises", icon: BarChart3, children: [
      { label: "Análises", href: "/analises", icon: BarChart3 },
      { label: "Estatísticas", href: "/estatisticas", icon: PieChart },
      { label: "Setup / Estratégia", href: "/setup", icon: Target },
      { label: "Journal", href: "/journal", icon: BookOpenCheck },
    ],
  },
  { label: "Gestão de Risco", href: "/risco", icon: ShieldCheck },
  {
    label: "Macro", icon: Globe, children: [
      { label: "Análise Macro IA", href: "/analise-macro", icon: BrainCircuit },
      { label: "Ranking G8", href: "/ranking-g8", icon: Trophy },
      { label: "B3 Macro", href: "/b3", icon: Landmark },
      { label: "Macro Journal", href: "/macro", icon: Globe },
    ],
  },
  { label: "SMC / ICT", href: "/smc-ict", icon: Crosshair },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

const OPEN_GROUPS_KEY = "tp-nav-open-groups";

function hrefActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { trades } = useTrades();
  const { config } = useConfig();
  const { portfolio, setPortfolio, meta } = usePortfolio();
  const initialCapital = config?.initialCapital ?? 10000;
  const metrics = calculateMetrics(trades, initialCapital);
  const currency = config?.currency || meta.currency;
  const growthClamped = Math.max(0, Math.min(100, 50 + metrics.growthPercent));

  // Grupos abertos (persistidos) — o grupo da rota atual abre sozinho
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [authEnabled, setAuthEnabled] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_GROUPS_KEY);
      if (raw) Promise.resolve().then(() => setOpenGroups(JSON.parse(raw) as Record<string, boolean>));
    } catch { /* ignore */ }
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setAuthEnabled(Boolean(d?.enabled)))
      .catch(() => setAuthEnabled(false));
  }, []);
  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    window.location.href = "/login";
  }

  const leafClass = (isActive: boolean, nested = false) =>
    `flex items-center gap-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
      collapsed ? "md:justify-center md:px-0 px-3.5 py-3" : nested ? "px-3 py-2 ml-2" : "px-3.5 py-3"
    } ${
      isActive
        ? "bg-accent-soft text-accent border border-accent-soft shadow-[0_0_15px_rgba(0,0,0,0.1)]"
        : "text-text-secondary hover:text-text-primary hover:bg-surface-3"
    }`;

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
            if (!isGroup(item)) {
              const Icon = item.icon;
              const isActive = hrefActive(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} title={collapsed ? item.label : undefined} className={leafClass(isActive)}>
                  <Icon size={20} className={isActive ? "text-accent" : "text-text-muted"} />
                  <span className={`flex-1 ${collapsed ? "md:hidden" : ""}`}>{item.label}</span>
                  {isActive && !collapsed && <ChevronRight size={14} className="text-accent/70" />}
                </Link>
              );
            }
            const Icon = item.icon;
            const childActive = item.children.some((c) => hrefActive(pathname, c.href));
            const open = openGroups[item.label] ?? childActive;
            // Menu encolhido (desktop): mostra apenas os ícones dos filhos
            return (
              <div key={item.label} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(item.label)}
                  title={item.label}
                  aria-expanded={open}
                  className={`w-full flex items-center gap-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    collapsed ? "md:hidden px-3.5 py-3" : "px-3.5 py-3"
                  } ${childActive ? "text-accent" : "text-text-secondary hover:text-text-primary hover:bg-surface-3"}`}
                >
                  <Icon size={20} className={childActive ? "text-accent" : "text-text-muted"} />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""} ${childActive ? "text-accent/70" : "text-text-muted"}`} />
                </button>
                {collapsed && (
                  <div className="hidden md:block border-l-2 border-border ml-1 pl-1 space-y-0.5">
                    {item.children.map((c) => {
                      const CIcon = c.icon;
                      const isActive = hrefActive(pathname, c.href);
                      return (
                        <Link key={c.href} href={c.href} title={c.label} onClick={() => setMobileOpen(false)} className={leafClass(isActive)}>
                          <CIcon size={18} className={isActive ? "text-accent" : "text-text-muted"} />
                        </Link>
                      );
                    })}
                  </div>
                )}
                {open && (
                  <div className={`${collapsed ? "md:hidden" : ""} border-l-2 border-border ml-5 pl-1 space-y-0.5`}>
                    {item.children.map((c) => {
                      const CIcon = c.icon;
                      const isActive = hrefActive(pathname, c.href);
                      return (
                        <Link key={c.href} href={c.href} onClick={() => setMobileOpen(false)} className={leafClass(isActive, true)}>
                          <CIcon size={17} className={isActive ? "text-accent" : "text-text-muted"} />
                          <span className="flex-1">{c.label}</span>
                          {isActive && <ChevronRight size={14} className="text-accent/70" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`border-t border-border ${collapsed ? "md:px-2 px-4 py-4" : "px-4 py-4"}`}>
          {!collapsed && (
            <div className="glass-card p-3 rounded-xl">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Saldo · {meta.label}</p>
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${meta.accent.bg} ${meta.accent.text}`}>{currency}</span>
              </div>
              <p className={`text-lg font-bold ${metrics.netResult >= 0 ? "text-emerald" : "text-rose"}`}>{formatCurrency(metrics.currentCapital, currency)}</p>
              <p className={`text-[10px] mt-0.5 font-semibold ${metrics.growthPercent >= 0 ? "text-emerald" : "text-rose"}`}>
                {metrics.growthPercent >= 0 ? "+" : ""}{metrics.growthPercent.toFixed(2)}%
              </p>
              <div className="w-full h-1 mt-2 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${metrics.growthPercent >= 0 ? "bg-accent" : "bg-rose"}`}
                  style={{ width: `${growthClamped}%` }}
                />
              </div>
              {/* Troca rápida de carteira */}
              <div className="grid grid-cols-3 gap-1 mt-3" role="tablist" aria-label="Carteira ativa">
                {PORTFOLIOS.map((id) => {
                  const m = PORTFOLIO_META[id];
                  const on = id === portfolio;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setPortfolio(id)}
                      className={`text-[10px] font-extrabold py-1.5 rounded-lg border transition ${on ? `${m.accent.bg} ${m.accent.text} ${m.accent.border}` : "text-text-muted border-border hover:bg-surface-3"}`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              {authEnabled && (
                <button type="button" onClick={logout} className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-text-muted hover:text-rose transition">
                  <LogOut size={12} /> Sair
                </button>
              )}
            </div>
          )}
          {collapsed && (
            <div className="hidden md:flex flex-col items-center gap-1">
              {authEnabled && (
                <button type="button" title="Sair" onClick={logout} className="w-9 h-7 flex items-center justify-center rounded-lg border border-border text-text-muted hover:text-rose hover:bg-surface-3 transition mb-1">
                  <LogOut size={13} />
                </button>
              )}
              {PORTFOLIOS.map((id) => {
                const m = PORTFOLIO_META[id];
                const on = id === portfolio;
                return (
                  <button key={id} type="button" title={`Carteira ${m.label}`} onClick={() => setPortfolio(id)} className={`w-9 h-7 text-[10px] font-extrabold rounded-lg border transition ${on ? `${m.accent.bg} ${m.accent.text} ${m.accent.border}` : "text-text-muted border-border hover:bg-surface-3"}`}>
                    {m.short}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
