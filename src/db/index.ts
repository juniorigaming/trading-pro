import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

let cachedPool: Pool | undefined;
let cachedDrizzle: NodePgDatabase<Record<string, never>> | undefined;
let cachedConnectionString: string | null = null;

interface HyperdriveBinding {
  connectionString?: string;
}

function resolveConnectionString(): string | null {
  if (cachedConnectionString) return cachedConnectionString;

  try {
    const cf = getCloudflareContext();
    const env = cf.env as any;
    if (env.HYPERDRIVE?.connectionString) {
      cachedConnectionString = env.HYPERDRIVE.connectionString;
      return cachedConnectionString;
    }
    if (env.DATABASE_URL) {
      cachedConnectionString = env.DATABASE_URL;
      return cachedConnectionString;
    }
  } catch {}

  if (process.env.DATABASE_URL) {
    cachedConnectionString = process.env.DATABASE_URL;
    return cachedConnectionString;
  }

  return null;
}

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
    throw new Error("DATABASE_URL missing - configure no Cloudflare Dashboard > Settings > Variables");
  }

  // OTIMIZADO PARA VELOCIDADE: mantém conexão aberta por 60s, não fecha a cada request
  cachedPool = new Pool({
    connectionString: databaseUrl,
    max: 3, // 3 conexões - equilíbrio entre velocidade e limite do Neon Free (10 max)
    min: 1, // Mantém 1 sempre aberta - evita cold start de 10s
    idleTimeoutMillis: 60000, // 60s - antes era 10s e fechava toda hora causando lentidão
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: false, // NÃO deixa fechar sozinho - mantém quente
  });

  cachedPool.on("error", (err) => {
    console.error("[DB Pool Error]", err.message);
    // Reseta cache se der erro pra reconectar na próxima
    cachedPool = undefined;
    cachedDrizzle = undefined;
    gCache.__tradingProPool = undefined;
    gCache.__tradingProDrizzle = undefined;
    cachedConnectionString = null;
  });

  cachedDrizzle = drizzle(cachedPool);
  gCache.__tradingProPool = cachedPool;
  gCache.__tradingProDrizzle = cachedDrizzle;

  return cachedDrizzle;
}

export { getDb };
