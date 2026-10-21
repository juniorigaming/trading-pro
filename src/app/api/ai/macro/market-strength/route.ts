/** GET somente leitura dos rankings de força D1 e W1. */
import { authorize, json } from "@/lib/api-utils";
import { fetchExchangeRatesUKStrength } from "@/lib/macro/exchange-rates-uk";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;
  try {
    return json(await fetchExchangeRatesUKStrength());
  } catch (error) {
    console.error("[api] Não foi possível carregar os dados de força", error);
    return json({ error: "Não foi possível carregar os dados de força agora. Tente novamente." }, 502);
  }
}
