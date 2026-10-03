/** Utilitários de parsing (CSV, números pt-BR/en-US, datas) compartilhados pelos importadores. */

export type NumberLocale = "pt" | "en" | "auto";

export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\0/g, "");
}

/** Detecta o delimitador olhando as primeiras linhas não vazias (títulos sem separador são ignorados). */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 15);
  const totals: Record<string, number> = { ";": 0, ",": 0, "\t": 0, "|": 0 };
  for (const line of lines) {
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      if (inQ) continue;
      if (ch in totals) totals[ch]++;
    }
  }
  const best = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

/** CSV simples com suporte a aspas, aspas duplas escapadas e quebras de linha dentro de aspas. */
export function parseCsv(textRaw: string, delimiter?: string): string[][] {
  const text = stripBom(textRaw);
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQ = true; continue; }
    if (ch === delim) { row.push(cell); cell = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim().length > 0)) rows.push(row.map((c) => c.trim()));
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim().length > 0)) rows.push(row.map((c) => c.trim()));
  return rows;
}

/** Normaliza cabeçalho: minúsculo, sem acento, sem símbolos. "Res. Operação (R$)" → "res operacao r" */
export function normHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

/** Procura a primeira linha que contenha pelo menos `minHits` dos cabeçalhos candidatos. */
export function findHeaderRow(rows: string[][], candidates: string[], minHits = 2): number {
  const cands = candidates.map(normHeader);
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const normed = rows[i].map(normHeader);
    const hits = cands.filter((c) => normed.some((h) => h === c || h.startsWith(c + " ") || h.includes(c))).length;
    if (hits >= minHits) return i;
  }
  return -1;
}

/** Índice da coluna cujo cabeçalho normalizado bate com algum sinônimo (igualdade primeiro, depois "contém"). */
export function colIndex(headers: string[], synonyms: string[]): number {
  const hs = headers.map(normHeader);
  const syn = synonyms.map(normHeader);
  for (const s of syn) { const i = hs.indexOf(s); if (i >= 0) return i; }
  for (const s of syn) { const i = hs.findIndex((h) => h.includes(s)); if (i >= 0) return i; }
  return -1;
}

/**
 * Converte "1.234,56", "-R$ 1.234,56", "1,234.56", "(12.5)", "12,5 %" em número.
 * locale: pt → vírgula decimal; en → ponto decimal; auto → decide pelo último separador.
 */
export function parseNumber(raw: string | undefined | null, locale: NumberLocale = "auto"): number | null {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s || s === "-" || s === "—") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/^-/.test(s) || /-$/.test(s)) negative = true;
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return null;
  const hasDot = s.includes("."), hasComma = s.includes(",");
  let normalized: string;
  if (hasDot && hasComma) {
    normalized = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    const after = s.split(",").pop() ?? "";
    const commaIsDecimal = locale === "pt" ? true : locale === "en" ? false : !(after.length === 3 && s.split(",").length > 1 && s.length > 4);
    normalized = commaIsDecimal ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    const parts = s.split(".");
    const after = parts[parts.length - 1];
    // "1.234" em pt-BR é milhar; "1.5" ou "1234.56" é decimal
    const dotIsThousands = locale === "pt" && after.length === 3 && parts.length > 1 && parts.every((p, i) => (i === 0 ? p.length <= 3 : p.length === 3));
    normalized = dotIsThousands ? s.replace(/\./g, "") : parts.length > 2 ? parts.slice(0, -1).join("") + "." + after : s;
  } else normalized = s;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

export interface ParsedDate { date: Date; time: string; iso: string }

/**
 * Aceita: 2026.09.17 19:16:54 · 17/09/2026 19:16 · 2026-09-17 19:16:54 · 2026-09-17T19:16:54Z · 17-09-2026 · 20260917 · 17/09/26
 * Retorna Date em UTC com os componentes informados (não converte fuso) + "HH:MM".
 */
export function parseDateTime(raw: string | undefined | null): ParsedDate | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/\s+/g, " ");
  let y = 0, m = 0, d = 0, hh = 0, mm = 0, ss = 0;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s))) {
    y = +match[1]; m = +match[2]; d = +match[3]; hh = +(match[4] ?? 0); mm = +(match[5] ?? 0); ss = +(match[6] ?? 0);
  } else if ((match = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s))) {
    d = +match[1]; m = +match[2]; y = +match[3]; if (y < 100) y += 2000; hh = +(match[4] ?? 0); mm = +(match[5] ?? 0); ss = +(match[6] ?? 0);
  } else if ((match = /^(\d{4})(\d{2})(\d{2})(?:[ T]?(\d{2}):?(\d{2}))?$/.exec(s))) {
    y = +match[1]; m = +match[2]; d = +match[3]; hh = +(match[4] ?? 0); mm = +(match[5] ?? 0);
  } else {
    const t = Date.parse(s);
    if (!Number.isFinite(t)) return null;
    const dt = new Date(t);
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); hh = dt.getUTCHours(); mm = dt.getUTCMinutes(); ss = dt.getUTCSeconds();
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  return { date, time, iso: date.toISOString() };
}

/** Hash curto e determinístico (FNV-1a) para gerar externalId quando o arquivo não traz ticket/id. */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function cleanSymbol(sym: string): string {
  return sym.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9._/-]/g, "").replace(/\.[A-Z]{1,3}$/, "").replace(/\//g, "");
}

export function resultTypeOf(amount: number): "WIN" | "LOSS" | "BREAK EVEN" {
  return amount > 0 ? "WIN" : amount < 0 ? "LOSS" : "BREAK EVEN";
}
