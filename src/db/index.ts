import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";

const globalForDb = globalThis as typeof globalThis & {
  __tradingProDbPool?: Pool;
};

type Db = ReturnType<typeof drizzle<Record<string, never>>>;

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  // Durante o build (next build / opennextjs-cloudflare build) as rotas são
  // importadas apenas para coleta de dados; neste momento o DATABASE_URL pode
  // não existir. Por isso o pool é criado de forma preguiçosa, e o erro só é
  // lançado em runtime, na primeira consulta real — assim o build não falha.
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL é obrigatória. Defina a variável de ambiente com a connection string do PostgreSQL (Neon/Supabase/etc)."
    );
  }

  return databaseUrl;
}

function getPool(): Pool {
  if (globalForDb.__tradingProDbPool) {
    return globalForDb.__tradingProDbPool;
  }

  const pool = new Pool({ connectionString: getDatabaseUrl() });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__tradingProDbPool = pool;
  }

  return pool;
}

// Proxy que inicializa o pool/drizzle somente no primeiro uso real,
// permitindo que o build rode sem DATABASE_URL configurada.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const instance = drizzle(getPool());
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { getPool as pool };
