/** GET somente leitura com os rankings oficiais do Currency Strength Meter 1D e 1W. */
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { fetchExchangeRatesUKStrength } from "@/lib/macro/exchange-rates-uk";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;
  try {
    return json(await fetchExchangeRatesUKStrength());
  } catch (error) {
    return errorResponse(error, "Falha ao consultar o Currency Strength Meter");
  }
}
