import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// FIX 1102: Pool otimizado para Cloudflare Workers
// - max: 1 conexão por isolate (Workers tem limite de CPU/memória)
// - timeouts curtos para não travar o Worker e causar 1102
// - singleton via globalThis para sobreviver a HMR / reciclagens
let cachedPool: Pool | undefined;
let cachedDrizzle: NodePgDatabase<Record<string, never>> | undefined;

interface HyperdriveBinding {
  connectionString?: string;
}

function resolveConnectionString(): string | null {
  try {
    const cf = getCloudflareContext();
    const hyperdrive = (cf.env as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE;
    if (hyperdrive?.connectionString) {
      return hyperdrive.connectionString;
    }
  } catch {
    // Sem contexto Cloudflare (build local)
  }
  return process.env.DATABASE_URL ?? null;
}

// Evita criar Pool múltiplas vezes no mesmo isolate (causa leak e 1102)
function getGlobalCache() {
  const g = globalThis as unknown as {
    __tradingProPool?: Pool;
    __tradingProDrizzle?: NodePgDatabase<Record<string, never>>;
  };
  return g;
}

function getDb(): NodePgDatabase<Record<string, never>> {
  const gCache = getGlobalCache();
  if (gCache.__tradingProDrizzle) return gCache.__tradingProDrizzle;
  if (cachedDrizzle) return cachedDrizzle;

  const databaseUrl = resolveConnectionString();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required - configure HYPERDRIVE ou DATABASE_URL");
  }

  // Configuração crítica para Workers: 1 conexão, timeouts agressivos
  // Sem isso, Pool tenta manter 10 conexões e estoura CPU/memória -> Erro 1102
  cachedPool = new Pool({
    connectionString: databaseUrl,
    max: 1, // Workers só precisa de 1 conexão por request
    min: 0,
    idleTimeoutMillis: 10000, // fecha rápido
    connectionTimeoutMillis: 5000, // não trava o Worker
    allowExitOnIdle: true,
  });

  // Log de erro para não travar silenciosamente
  cachedPool.on("error", (err) => {
    console.error("[DB Pool Error]", err.message);
  });

  cachedDrizzle = drizzle(cachedPool);
  gCache.__tradingProPool = cachedPool;
  gCache.__tradingProDrizzle = cachedDrizzle;

  return cachedDrizzle;
}

export { getDb };
