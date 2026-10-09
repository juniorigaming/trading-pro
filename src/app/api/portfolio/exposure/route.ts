import { getDb } from "@/db";
import { currencyExposure } from "@/db/schema";
import { errorResponse, json } from "@/lib/api-utils";
import { loadOpenExposure } from "@/lib/journal/service";
export const dynamic = "force-dynamic";
/** GET → exposição por moeda das operações abertas (status OPEN) + alertas de correlação */
export async function GET(request: Request) {
  try {
    const result = await loadOpenExposure();
    if (new URL(request.url).searchParams.get("persist")) await getDb().insert(currencyExposure).values({ exposure: result.exposure, openTrades: result.openTrades, alerts: result.alerts }).catch(() => null);
    return json(result);
  } catch (e) { return errorResponse(e, "Falha ao calcular exposição"); }
}
