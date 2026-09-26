import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// v31: Cloudflare Workers NÃO permite reaproveitar socket/conexão de um request
// em outro request ("Cannot perform I/O on behalf of a different request").
// O pool global antigo (min:1, idle 60s) causava o erro 1101 intermitente.
// Agora: 1 pool por request (Hyperdrive já faz o pooling de verdade do lado dele).

type Db = NodePgDatabase<Record<string, never>>;

const perRequestDb = new WeakMap<object, Db>();

function resolveConnectionString(): string | null {
  try {
    const cf = getCloudflareContext();
    const env = cf.env as any;
    if (env?.HYPERDRIVE?.connectionString) return env.HYPERDRIVE.connectionString;
    if (env?.DATABASE_URL) return env.DATABASE_URL;
  } catch {}
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return null;
}

function getRequestKey(): object | null {
  try {
    const cf = getCloudflareContext();
    return (cf.ctx as unknown as object) || null;
  } catch {
    return null;
  }
}

function getDb(): Db {
  const key = getRequestKey();
  if (key) {
    const cached = perRequestDb.get(key);
    if (cached) return cached;
  }

  const databaseUrl = resolveConnectionString();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL missing - configure no Cloudflare Dashboard > Settings > Variables");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    min: 0,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 8000,
    allowExitOnIdle: true,
  });

  // Nunca deixar erro de socket virar exceção não tratada (isso gera 1101)
  pool.on("error", (err) => {
    console.error("[DB Pool Error]", err?.message);
  });

  const db = drizzle(pool);
  if (key) perRequestDb.set(key, db);
  return db;
}

export { getDb };
