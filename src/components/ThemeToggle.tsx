"use client";
import { Moon, Sun, Monitor, Settings } from "lucide-react";
import Link from "next/link";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, isSystem, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="fixed top-4 right-4 z-40 flex items-center gap-2">
      {isSystem && (
        <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg glass-card text-[10px] font-semibold text-text-secondary" title="Tema controlado pelo sistema operacional">
          <Monitor size={12} /> Sistema
        </span>
      )}
      <button
        onClick={toggleTheme}
        title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
        className="p-2.5 rounded-xl glass-card text-text-primary hover:bg-surface-3 transition"
        aria-label="Alternar tema"
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <Link href="/configuracoes" title="Personalizar aparência" className="hidden sm:inline-flex p-2.5 rounded-xl glass-card text-text-primary hover:bg-surface-3 transition">
        <Settings size={18} />
      </Link>
    </div>
  );
}
