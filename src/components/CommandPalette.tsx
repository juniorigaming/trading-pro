"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, NotebookPen, CalendarDays, BarChart3, Calculator, Globe, LayoutDashboard, Search } from "lucide-react";

const ACTIONS = [
  { label: "Nova Operação", href: "/operacoes/novo", icon: Plus },
  { label: "Planejar Trade", href: "/planejamento/novo", icon: NotebookPen },
  { label: "Abrir Calendário", href: "/calendario", icon: CalendarDays },
  { label: "Abrir Analytics", href: "/analises", icon: BarChart3 },
  { label: "Risk Calculator", href: "/risco", icon: Calculator },
  { label: "Macro Journal", href: "/macro", icon: Globe },
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = ACTIONS.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));

  const go = (href: string) => {
    router.push(href);
    setOpen(false);
    setQuery("");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-24 px-4" onClick={() => setOpen(false)}>
      <div className="glass-card-strong w-full max-w-md p-0 overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={16} className="text-text-muted" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar ação... (Ctrl+K)" className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none" />
          <kbd className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-surface-2 border border-border">ESC</kbd>
        </div>
        <div className="py-1.5 max-h-72 overflow-y-auto">
          {filtered.length === 0 && <p className="text-xs text-text-muted text-center py-6">Nenhuma ação encontrada.</p>}
          {filtered.map((a) => (
            <button key={a.href} onClick={() => go(a.href)} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-secondary hover:bg-accent-soft hover:text-accent transition text-left">
              <a.icon size={16} /> {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
