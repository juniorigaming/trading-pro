import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// A conexão (Pool) e o cliente Drizzle são criados apenas na primeira consulta
// real, ficando em cache a nível de módulo (um singleton por isolate).
//
// Prioridade de conexão:
//   1. Hyperdrive (env.HYPERDRIVE.connectionString) — recomendado para Cloudflare
//      Workers + Postgres/Neon. Mantém um pool quente no edge, eliminando o
//      "cold start" do Neon free tier (que causava o erro 1101).
//   2. process.env.DATABASE_URL — fallback (build local / quando Hyperdrive
//      ainda não foi configurado).
// A leitura do binding é tolerante: se o Hyperdrive não existir, usamos a
// DATABASE_URL e o app continua funcionando normalmente.
let cachedPool: Pool | undefined;
let cachedDrizzle: NodePgDatabase<Record<string, never>> | undefined;

interface HyperdriveBinding {
  connectionString?: string;
}

function resolveConnectionString(): string | null {
  try {
    // getCloudflareContext() existe apenas no runtime do Worker/OpenNext.
    const cf = getCloudflareContext();
    const hyperdrive = (cf.env as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE;
    if (hyperdrive?.connectionString) {
      return hyperdrive.connectionString;
    }
  } catch {
    // Sem contexto Cloudflare (build local / next build): usa o fallback.
  }
  return process.env.DATABASE_URL ?? null;
}

function getDb(): NodePgDatabase<Record<string, never>> {
  if (cachedDrizzle) {
    return cachedDrizzle;
  }

  const databaseUrl = resolveConnectionString();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  cachedPool = new Pool({ connectionString: databaseUrl });
  cachedDrizzle = drizzle(cachedPool);

  return cachedDrizzle;
}

export { getDb };
