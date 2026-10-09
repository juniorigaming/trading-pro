import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { scoringConfig } from "@/db/schema";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { DEFAULT_SCORING_CONFIG, mergeScoringConfig } from "@/lib/macro/config";
import { loadScoringConfig } from "@/lib/macro/pipeline";
export const dynamic = "force-dynamic";
export async function GET() { try { return json({ active: await loadScoringConfig(), defaults: DEFAULT_SCORING_CONFIG }); } catch (e) { return errorResponse(e); } }
/** PUT { version, config } → cria/ativa nova versão de pesos (sem redeploy) */
export async function PUT(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as { version?: string; config?: Record<string, unknown> };
    if (!body.version || !body.config) return json({ error: "version e config obrigatórios" }, 400);
    const merged = mergeScoringConfig({ ...(body.config as object), version: body.version });
    const db = getDb();
    await db.update(scoringConfig).set({ isActive: false }).where(eq(scoringConfig.isActive, true));
    await db.insert(scoringConfig).values({ version: body.version, isActive: true, configJson: merged }).onConflictDoUpdate({ target: scoringConfig.version, set: { isActive: true, configJson: merged } });
    return json({ ok: true, active: merged });
  } catch (e) { return errorResponse(e, "Falha ao salvar config"); }
}
