import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

let cachedPool: Pool | undefined;
let cachedDrizzle: NodePgDatabase<Record<string, never>> | undefined;

interface HyperdriveBinding {
  connectionString?: string;
}

function resolveConnectionString(): string | null {
  // Tenta pegar do Cloudflare context primeiro
  try {
    const cf = getCloudflareContext();
    const env = cf.env as any;
    
    // Hyperdrive binding
    if (env.HYPERDRIVE?.connectionString) {
      console.log("[DB] Using HYPERDRIVE connection");
      return env.HYPERDRIVE.connectionString;
    }
    
    // Fallback: DATABASE_URL no env do Cloudflare (Pages/Workers)
    if (env.DATABASE_URL) {
      console.log("[DB] Using DATABASE_URL from Cloudflare env");
      return env.DATABASE_URL;
    }
    
    // Fallback: DB_URL ou similar
    if (env.DB_URL) return env.DB_URL;
    if (env.POSTGRES_URL) return env.POSTGRES_URL;
  } catch (e) {
    console.log("[DB] No Cloudflare context, using process.env");
  }
  
  // Fallback local / build
  if (process.env.DATABASE_URL) {
    console.log("[DB] Using DATABASE_URL from process.env");
    return process.env.DATABASE_URL;
  }
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  if (process.env.DATABASE_URL_UNPOOLED) return process.env.DATABASE_URL_UNPOOLED;
  
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
    console.error("[DB] No DATABASE_URL found. Checked HYPERDRIVE, DATABASE_URL, POSTGRES_URL");
    throw new Error("DATABASE_URL is required - configure HYPERDRIVE ou DATABASE_URL no Cloudflare Dashboard > Settings > Variables");
  }

  // Pool otimizado para Workers
  cachedPool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    min: 0,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    // Neon precisa de SSL
    ssl: databaseUrl.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
  } as any);

  cachedPool.on("error", (err) => {
    console.error("[DB Pool Error]", err.message);
  });

  cachedDrizzle = drizzle(cachedPool);
  gCache.__tradingProPool = cachedPool;
  gCache.__tradingProDrizzle = cachedDrizzle;

  return cachedDrizzle;
}

export { getDb };
