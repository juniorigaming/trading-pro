import { authorize, errorResponse, json } from "@/lib/api-utils";
import { SettingsBody } from "@/lib/b3/schema";
import { DEFAULT_B3_CONFIG, DEFAULT_DI_CONTRACTS, mergeB3Config } from "@/lib/b3/config";
import { loadB3Config, loadDiContracts, putSetting } from "@/lib/b3/pipeline";
export const dynamic = "force-dynamic";
/** GET → {di_contracts, weights, defaults}. PUT {di_contracts?, weights?} */
export async function GET() {
  try { const [c, w] = await Promise.all([loadDiContracts(), loadB3Config()]); return json({ di_contracts: c, weights: w, defaults: { di_contracts: DEFAULT_DI_CONTRACTS, weights: DEFAULT_B3_CONFIG } }); }
  catch (e) { return errorResponse(e, "Falha ao carregar configurações B3"); }
}
export async function PUT(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const parsed = SettingsBody.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Payload inválido", issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
    if (parsed.data.di_contracts) await putSetting("di_contracts", parsed.data.di_contracts.map((c) => ({ code: c.code.toUpperCase(), tenor: c.tenor })));
    if (parsed.data.weights) await putSetting("weights", mergeB3Config(parsed.data.weights as Partial<typeof DEFAULT_B3_CONFIG>));
    const [c, w] = await Promise.all([loadDiContracts(), loadB3Config()]);
    return json({ di_contracts: c, weights: w });
  } catch (e) { return errorResponse(e, "Falha ao salvar configurações B3"); }
}
