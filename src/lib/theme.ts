export type ThemeMode = "dark" | "light" | "system";
export type AccentColor = "green" | "blue" | "purple" | "cyan";
export type Density = "compact" | "comfortable";

export interface AppearancePrefs {
  theme: ThemeMode;
  accentColor: AccentColor;
  density: Density;
}

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: "system",
  accentColor: "green",
  density: "comfortable",
};

export const ACCENTS: Record<AccentColor, { label: string; color: string }> = {
  green: { label: "Verde", color: "#10d9a0" },
  blue: { label: "Azul", color: "#3b82f6" },
  purple: { label: "Roxo", color: "#8b5cf6" },
  cyan: { label: "Ciano", color: "#06b6d4" },
};

const KEYS = {
  theme: "theme",
  accent: "accentColor",
  density: "density",
} as const;

export function loadAppearance(): AppearancePrefs {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  const theme = (localStorage.getItem(KEYS.theme) as ThemeMode) || DEFAULT_APPEARANCE.theme;
  const accentColor = (localStorage.getItem(KEYS.accent) as AccentColor) || DEFAULT_APPEARANCE.accentColor;
  const density = (localStorage.getItem(KEYS.density) as Density) || DEFAULT_APPEARANCE.density;
  return { theme, accentColor, density };
}

export function saveAppearance(prefs: AppearancePrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.theme, prefs.theme);
  localStorage.setItem(KEYS.accent, prefs.accentColor);
  localStorage.setItem(KEYS.density, prefs.density);
}

export function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return "dark";
  }
  return mode;
}

export function applyAppearance(prefs: AppearancePrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveTheme(prefs.theme);
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-accent", prefs.accentColor);
  root.setAttribute("data-density", prefs.density);
  // Keep meta theme-color in sync for mobile browser chrome.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? "#07090d" : "#f4f7fb");
  }
}

/**
 * Called inline in <head> to avoid flash of incorrect theme (FOUC).
 * Must mirror loadAppearance/resolveTheme logic (no imports beyond localStorage).
 */
export function applyAppearanceInline() {
  try {
    const theme = localStorage.getItem("theme") || "system";
    const accentColor = localStorage.getItem("accentColor") || "green";
    const density = localStorage.getItem("density") || "comfortable";
    let resolved = "dark";
    if (theme === "light") resolved = "light";
    else if (theme === "dark") resolved = "dark";
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) resolved = "light";
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-accent", accentColor);
    root.setAttribute("data-density", density);
  } catch (e) {
    // no-op
  }
}
