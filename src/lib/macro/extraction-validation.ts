/**
 * Validação DETERMINÍSTICA da extração feita pela IA (visão/OCR).
 * A IA transcreve; o código confere. Nada que não esteja no texto transcrito da própria linha é aceito.
 *
 * Camadas:
 *  1. escopo (moeda permitida) e formato (data/hora/impacto)
 *  2. moeda e nome do evento precisam aparecer em raw_row_text (texto transcrito da linha)
 *  3. cada valor (actual/forecast/previous) precisa aparecer em raw_row_text — senão vira null
 *  4. leitura incerta (confiança OCR < mínimo) é rejeitada
 *  5. duplicatas são removidas
 *
 * A checagem VISUAL (o valor está de fato na imagem?) é feita em economic-data-provider.ts por uma 2ª chamada.
 */

export interface RawExtractedRow {
  date: string | null; time: string | null; currency: string; event: string;
  impact: "high" | "medium" | "low" | "holiday" | "unknown";
  actual: string | null; forecast: string | null; previous: string | null;
  status: "released" | "pending";
  ocr_confidence: number; requires_manual_confirmation: boolean; ocr_issues: string[];
  raw_row_text: string;
}

export interface AcceptedRow {
  index: number;
  date: string | null; time: string | null; currency: string; event: string; impact: RawExtractedRow["impact"];
  actual: string | null; forecast: string | null; previous: string | null;
  ocr_confidence: number; raw_row_text: string;
  requires_manual_confirmation: boolean;
}

export interface RejectedRow { index: number; currency: string | null; event: string | null; reason: string }
export interface DiscardedValue { index: number; currency: string; event: string; field: "actual" | "forecast" | "previous"; value: string; reason: string }

export interface ValidationResult {
  accepted: AcceptedRow[];
  rejected: RejectedRow[];
  values_discarded: DiscardedValue[];
}

export const MIN_OCR_CONFIDENCE = 0.5;

/** Normaliza para comparação: minúsculas, sem acento, sem pontuação/espaços. */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[−–]/g, "-");
}

/** Remove tudo que não é letra/dígito/sinal/ponto/%: "2.4 %" === "2.4%", "−0,1" === "-0,1". */
function compact(s: string): string {
  return norm(s).replace(/[^a-z0-9.,%+\-<>]/g, "");
}

/** Fração (0–1) dos tokens do nome do evento que aparecem no texto da linha. */
export function eventTokenCoverage(event: string, rawRowText: string): number {
  const tokens = norm(event).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;
  const hay = new Set(norm(rawRowText).split(/[^a-z0-9]+/));
  const hit = tokens.filter((t) => hay.has(t)).length;
  return hit / tokens.length;
}

export function valueAppearsInRow(value: string, rawRowText: string): boolean {
  const v = compact(value);
  if (!v) return false;
  return compact(rawRowText).includes(v);
}

function validTime(t: string | null): string | null {
  if (!t) return null;
  if (t === "all_day" || t === "tentative") return t;
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
}

function validDate(d: string | null): string | null {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export function validateExtractedRows(rows: RawExtractedRow[], opts: { allowed: readonly string[]; minConfidence?: number }): ValidationResult {
  const minConf = opts.minConfidence ?? MIN_OCR_CONFIDENCE;
  const accepted: AcceptedRow[] = [];
  const rejected: RejectedRow[] = [];
  const values_discarded: DiscardedValue[] = [];
  const seen = new Set<string>();

  rows.forEach((r, index) => {
    const reject = (reason: string) => rejected.push({ index, currency: r.currency ?? null, event: r.event ?? null, reason });
    const raw = (r.raw_row_text ?? "").trim();

    if (!opts.allowed.includes(r.currency)) return reject(`moeda fora do escopo (${r.currency})`);
    if (!raw || /^unreadable$/i.test(raw)) return reject("linha ilegível (raw_row_text vazio ou UNREADABLE)");
    if (!norm(raw).split(/[^a-z0-9]+/).includes(norm(r.currency).toLowerCase())) return reject(`moeda ${r.currency} não aparece no texto transcrito da linha`);
    if (!r.event || !r.event.trim()) return reject("evento sem nome");
    const cov = eventTokenCoverage(r.event, raw);
    if (cov < 0.8) return reject(`nome do evento "${r.event}" não consta no texto transcrito da linha (cobertura ${Math.round(cov * 100)}%)`);
    if ((r.ocr_confidence ?? 0) < minConf) return reject(`leitura incerta (confiança OCR ${r.ocr_confidence})`);

    const time = validTime(r.time);
    const date = validDate(r.date);
    const key = [r.currency, norm(r.event).replace(/\s+/g, " ").trim(), time ?? "", date ?? ""].join("|");
    if (seen.has(key)) return reject("linha duplicada (mesmo evento, moeda e horário)");
    seen.add(key);

    const clean: Record<"actual" | "forecast" | "previous", string | null> = { actual: null, forecast: null, previous: null };
    for (const field of ["actual", "forecast", "previous"] as const) {
      const v = r[field];
      if (v === null || v === undefined || v.trim() === "") continue;
      if (valueAppearsInRow(v, raw)) clean[field] = v.trim();
      else values_discarded.push({ index, currency: r.currency, event: r.event, field, value: v, reason: "valor não consta no texto transcrito da linha — descartado (não inventado)" });
    }
    // Sem ATUAL validado a linha é pendente: nunca tratar Forecast como resultado.
    const pendingByCheck = clean.actual === null;
    if (r.status === "released" && pendingByCheck) values_discarded.push({ index, currency: r.currency, event: r.event, field: "actual", value: String(r.actual), reason: "status released sem ATUAL validado — tratado como pendente" });

    accepted.push({
      index, date, time, currency: r.currency, event: r.event.trim(), impact: r.impact,
      actual: clean.actual, forecast: clean.forecast, previous: clean.previous,
      ocr_confidence: r.ocr_confidence, raw_row_text: raw,
      requires_manual_confirmation: !!r.requires_manual_confirmation || (r.ocr_confidence ?? 0) < 0.7,
    });
  });

  return { accepted, rejected, values_discarded };
}
