import { errorResponse, json } from "@/lib/api-utils";
import { latestB3Scores } from "@/lib/b3/pipeline";
export const dynamic = "force-dynamic";
/** GET → último score por instrumento {USD, BRL, WIN, DOL} */
export async function GET() { try { return json(await latestB3Scores()); } catch (e) { return errorResponse(e, "Falha ao carregar scores B3"); } }
