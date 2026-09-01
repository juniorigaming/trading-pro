import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// A conexão (Pool) e o cliente Drizzle são criados apenas na primeira consulta
// real, ficando em cache a nível de módulo (um singleton por isolate).
// Assim o módulo pode ser importado durante o "next build" (coleta de dados de
// página) sem exigir DATABASE_URL — que, no Cloudflare Workers, só é injetada
// em runtime como binding/secreto, não em tempo de build.
let cachedPool: Pool | undefined;
let cachedDrizzle: NodePgDatabase<Record<string, never>> | undefined;

function getDb(): NodePgDatabase<Record<string, never>> {
  if (cachedDrizzle) {
    return cachedDrizzle;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  cachedPool = new Pool({ connectionString: databaseUrl });
  cachedDrizzle = drizzle(cachedPool);

  return cachedDrizzle;
}

export { getDb };
