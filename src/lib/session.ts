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

export function getCurrentSession(config: Config | null): SessionInfo {
  const cfg = config ?? ({} as Config);
  const now = brasiliaNowMinutes();

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
