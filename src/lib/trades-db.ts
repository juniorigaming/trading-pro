/**
 * Helpers de acesso à tabela `trades` tolerantes ao schema de produção
 * (a tabela em produção pode não ter todas as colunas do Drizzle).
 *
 * Importante: o Drizzle sempre lista TODAS as colunas do schema no INSERT (usa DEFAULT nas
 * ausentes). Se o banco não tiver uma coluna (ex.: `portfolio` antes do SQL 0003), o INSERT
 * falha mesmo sem enviarmos valor para ela. Por isso, ao detectar coluna ausente, trocamos
 * para um INSERT em SQL puro só com as colunas realmente existentes.
 */
import { getTableColumns, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { trades } from "@/db/schema";

const MISSING_COLUMN_RE = /column "([^"]+)" (?:of relation "trades" )?does not exist/i;

export function missingColumnFrom(error: unknown): string | null {
  // Drizzle embrulha o erro do driver ("Failed query: …") e guarda o original em `cause`
  let cur: unknown = error;
  for (let depth = 0; cur && depth < 5; depth++) {
    const msg = cur instanceof Error ? cur.message : typeof cur === "string" ? cur : String((cur as { message?: unknown })?.message ?? "");
    const m = MISSING_COLUMN_RE.exec(msg);
    if (m) return m[1];
    cur = (cur as { cause?: unknown })?.cause;
  }
  return null;
}

export function isMissingPortfolioColumn(error: unknown): boolean {
  const col = missingColumnFrom(error);
  return col === "portfolio" || col === "external_id";
}

/** jsKey → nome da coluna no banco (ex.: resultAmount → result_amount) */
const COLUMNS = getTableColumns(trades);
const JS_TO_DB = new Map<string, string>(Object.entries(COLUMNS).map(([k, c]) => [k, c.name]));
const DB_TO_JS = new Map<string, string>(Object.entries(COLUMNS).map(([k, c]) => [c.name, k]));

/**
 * Colunas que já descobrimos não existir no banco (cache por isolate — evita repetir o erro a cada linha).
 * Expira em 60s para que, assim que o SQL 0003 for aplicado, o caminho normal volte a ser usado.
 */
const MISSING_TTL_MS = 60_000;
const missingSince = new Map<string, number>();
const knownMissing = {
  get size() { this.sweep(); return missingSince.size; },
  has(col: string) { this.sweep(); return missingSince.has(col); },
  add(col: string) { missingSince.set(col, Date.now()); },
  sweep() { const now = Date.now(); for (const [c, t] of missingSince) if (now - t > MISSING_TTL_MS) missingSince.delete(c); },
  list() { this.sweep(); return [...missingSince.keys()]; },
};
export function knownMissingColumns(): string[] { return knownMissing.list(); }
/** Só para testes: esquece as colunas marcadas como ausentes. */
export function resetMissingColumnsCache() { missingSince.clear(); }

function toDbRow(values: Record<string, unknown>): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    const db = JS_TO_DB.get(k) ?? k;
    if (knownMissing.has(db)) continue;
    out.push([db, v]);
  }
  return out;
}

function fromDbRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[DB_TO_JS.get(k) ?? k] = v;
  if (typeof out.date === "string") out.date = new Date(out.date);
  if (typeof out.createdAt === "string") out.createdAt = new Date(out.createdAt);
  return out;
}

/** INSERT em SQL puro listando apenas as colunas fornecidas (e existentes). */
async function rawInsert(values: Record<string, unknown>): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const pairs = toDbRow(values);
    const cols = sql.join(pairs.map(([c]) => sql.identifier(c)), sql`, `);
    const vals = sql.join(pairs.map(([, v]) => sql`${v}`), sql`, `);
    try {
      const res = await getDb().execute(sql`INSERT INTO ${trades} (${cols}) VALUES (${vals}) RETURNING *`);
      const rows = (Array.isArray(res) ? res : (res as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
      return fromDbRow(rows[0] ?? Object.fromEntries(pairs));
    } catch (e) {
      const col = missingColumnFrom(e);
      if (!col || knownMissing.has(col)) throw e;
      knownMissing.add(col);
    }
  }
  throw new Error("Falha após múltiplas tentativas de inserir (SQL puro)");
}

/**
 * Insere via Drizzle; se o banco não tiver alguma coluna do schema, cai para o INSERT em SQL puro.
 * Retorna a linha inserida e a lista de colunas que o banco não tem.
 */
export async function resilientInsert(values: Record<string, unknown>): Promise<{ row: Record<string, unknown>; dropped: string[] }> {
  if (knownMissing.size === 0) {
    try {
      const [inserted] = await getDb().insert(trades).values(values as any).returning();
      return { row: inserted as Record<string, unknown>, dropped: [] };
    } catch (e) {
      const col = missingColumnFrom(e);
      if (!col) throw e;
      knownMissing.add(col);
    }
  }
  const row = await rawInsert(values);
  return { row, dropped: knownMissingColumns() };
}
