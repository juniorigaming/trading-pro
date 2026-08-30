"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  ACCENTS,
  applyAppearance,
  DEFAULT_APPEARANCE,
  loadAppearance,
  resolveTheme,
  saveAppearance,
  type AccentColor,
  type AppearancePrefs,
  type Density,
  type ThemeMode,
} from "@/lib/theme";

interface ThemeContextValue {
  prefs: AppearancePrefs;
  theme: "dark" | "light";
  isSystem: boolean;
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentColor) => void;
  setDensity: (d: Density) => void;
  toggleTheme: () => void;
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<AppearancePrefs>(DEFAULT_APPEARANCE);
  const [theme, setThemeState] = useState<"dark" | "light">("dark");
  const [isSystem, setIsSystem] = useState(false);

  // On mount, hydrate from localStorage + system.
  useEffect(() => {
    const stored = loadAppearance();
    applyAppearance(stored);
    setPrefs(stored);
    setThemeState(resolveTheme(stored.theme));
    setIsSystem(stored.theme === "system");

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (stored.theme === "system") {
        setThemeState(resolveTheme("system"));
        applyAppearance(stored);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const commit = useCallback((next: AppearancePrefs) => {
    setPrefs(next);
    applyAppearance(next);
    saveAppearance(next);
    setThemeState(resolveTheme(next.theme));
    setIsSystem(next.theme === "system");
  }, []);

  const setTheme = useCallback((t: ThemeMode) => commit({ ...prefs, theme: t }), [commit, prefs]);
  const setAccent = useCallback((a: AccentColor) => commit({ ...prefs, accentColor: a }), [commit, prefs]);
  const setDensity = useCallback((d: Density) => commit({ ...prefs, density: d }), [commit, prefs]);
  const reset = useCallback(() => commit(DEFAULT_APPEARANCE), [commit]);
  const toggleTheme = useCallback(() => {
    // If currently system, jump to the resolved concrete theme, else toggle.
    const current = prefs.theme === "system" ? resolveTheme("system") : prefs.theme;
    commit({ ...prefs, theme: current === "dark" ? "light" : "dark" });
  }, [commit, prefs]);

  return (
    <ThemeContext.Provider value={{ prefs, theme, isSystem, setTheme, setAccent, setDensity, toggleTheme, reset }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export { ACCENTS };
