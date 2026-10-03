import { Config } from "./types";

export interface SessionInfo {
  session: string;
  isActive: boolean;
}

function toMinutes(hhmm: string): number {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function brasiliaNowMinutes(): number {
  // Convert current UTC time to Brasília (UTC-3).
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMin - 180 + 24 * 60) % (24 * 60);
}

export function getCurrentSession(config: Config | null, portfolio: "FOREX" | "B3" | "CRYPTO" = "FOREX"): SessionInfo {
  const cfg = config ?? ({} as Config);
  const now = brasiliaNowMinutes();

  // Cripto negocia 24h/7
  if (portfolio === "CRYPTO") return { session: "Cripto 24h", isActive: true };

  // B3 (horário de Brasília): pregão 09:00–18:25 (WIN/WDO), after 18:25–18:50
  if (portfolio === "B3") {
    const day = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCDay();
    if (day === 0 || day === 6) return { session: "Fim de semana", isActive: false };
    if (now >= toMinutes("09:00") && now < toMinutes("10:00")) return { session: "B3 - Abertura", isActive: true };
    if (now >= toMinutes("10:00") && now < toMinutes("17:30")) return { session: "B3 - Pregão", isActive: true };
    if (now >= toMinutes("17:30") && now < toMinutes("18:25")) return { session: "B3 - Fechamento", isActive: true };
    if (now >= toMinutes("18:25") && now < toMinutes("18:50")) return { session: "B3 - After", isActive: true };
    return { session: "Fechado", isActive: false };
  }

  const ranges: { name: string; start: string; end: string }[] = [
    { name: "Ásia", start: cfg.sessionAsiaStart || "21:00", end: cfg.sessionAsiaEnd || "01:00" },
    { name: "Londres", start: cfg.sessionLondonStart || "03:00", end: cfg.sessionLondonEnd || "06:00" },
    { name: "Nova York", start: cfg.sessionNYStart || "08:00", end: cfg.sessionNYEnd || "13:00" },
  ];

  for (const r of ranges) {
    const s = toMinutes(r.start);
    const e = toMinutes(r.end);
    // Handle overnight sessions (start > end), e.g. Ásia 21:00 → 01:00.
    if (s <= e ? now >= s && now < e : now >= s || now < e) {
      return { session: r.name, isActive: true };
    }
  }
  return { session: "Fechado", isActive: false };
}
