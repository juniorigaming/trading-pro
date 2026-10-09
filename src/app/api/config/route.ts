import { getConfig, saveConfig, getAllConfigs } from "@/lib/config";
import { normalizePortfolio } from "@/lib/portfolio";
import { Config } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/config            → carteira FOREX (compatível com a versão anterior)
 * GET /api/config?portfolio=B3|CRYPTO|FOREX
 * GET /api/config?all=1      → { FOREX, B3, CRYPTO }
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("all")) {
      return Response.json(await getAllConfigs(), { headers: { "Cache-Control": "no-store" } });
    }
    const portfolio = normalizePortfolio(url.searchParams.get("portfolio"));
    const config = await getConfig(portfolio);
    return Response.json(config, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to load config" }, { status: 500 });
  }
}

/** PUT /api/config?portfolio=… — body parcial; o campo `portfolio` no body também é aceito. */
export async function PUT(request: Request) {
  try {
    const url = new URL(request.url);
    const body = (await request.json()) as Partial<Config> & { portfolio?: string };
    const { portfolio: bodyPortfolio, ...rest } = body;
    const portfolio = normalizePortfolio(url.searchParams.get("portfolio") ?? bodyPortfolio);
    const updated = await saveConfig(rest, portfolio);
    return Response.json(updated, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to save config" }, { status: 500 });
  }
}
