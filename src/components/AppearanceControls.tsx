"use client";
import { Moon, Sun, Monitor, RotateCcw, Check } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { ACCENTS, type AccentColor, type Density, type ThemeMode } from "@/lib/theme";

export default function AppearanceControls() {
  const { prefs, setTheme, setAccent, setDensity, reset, theme } = useTheme();

  return (
    <div>
      {/* TEMA */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-text-primary mb-3">Tema</h3>
        <div className="flex flex-wrap gap-2">
          <Segment active={prefs.theme === "dark"} onClick={() => setTheme("dark")} icon={<Moon size={16} />} label="Escuro" />
          <Segment active={prefs.theme === "light"} onClick={() => setTheme("light")} icon={<Sun size={16} />} label="Claro" />
          <Segment active={prefs.theme === "system"} onClick={() => setTheme("system")} icon={<Monitor size={16} />} label="Sistema" />
        </div>
        {prefs.theme === "system" && (
          <p className="text-[11px] text-text-muted mt-2 inline-flex items-center gap-1.5">
            <Monitor size={12} /> Tema controlado pelo sistema operacional.
          </p>
        )}
      </div>

      {/* COR DE DESTAQUE */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-text-primary mb-3">Cor de destaque</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(ACCENTS) as AccentColor[]).map((key) => (
            <button
              key={key}
              onClick={() => setAccent(key)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition ${
                prefs.accentColor === key
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-text-secondary hover:border-accent/40"
              }`}
            >
              <span className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: ACCENTS[key].color }} />
              {ACCENTS[key].label}
              {prefs.accentColor === key && <Check size={14} className="ml-auto" />}
            </button>
          ))}
        </div>
      </div>

      {/* DENSIDADE */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-text-primary mb-3">Densidade</h3>
        <div className="flex flex-wrap gap-2">
          <Segment active={prefs.density === "compact"} onClick={() => setDensity("compact")} label="Compacta" />
          <Segment active={prefs.density === "comfortable"} onClick={() => setDensity("comfortable")} label="Confortável" />
        </div>
        <p className="text-[11px] text-text-muted mt-2">
          {prefs.density === "compact" ? "Mais informações por tela, espaçamentos reduzidos." : "Espaçamento padrão, ideal para uso diário e telas grandes."}
          <span className="inline-flex items-center gap-1 ml-2 text-accent font-medium"> Atual: {theme === "dark" ? "escuro" : "claro"}</span>
        </p>
      </div>

      {/* RESTAURAR */}
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-text-secondary hover:text-accent hover:border-accent/40 transition text-xs font-semibold"
      >
        <RotateCcw size={14} /> Restaurar aparência padrão
      </button>
    </div>
  );
}

function Segment({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon?: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition ${
        active ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
