import { errorResponse, json } from "@/lib/api-utils";
import { latestScores } from "@/lib/macro/pipeline";
export const dynamic = "force-dynamic";
/** GET → último score de cada moeda (ranking atual) */
export async function GET() {
  try { return json(await latestScores()); } catch (e) { return errorResponse(e, "Falha ao carregar scores"); }
}
