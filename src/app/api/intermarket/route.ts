import { z } from "zod";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { intermarketSnapshots } from "@/db/schema";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { interpretIntermarket } from "@/lib/macro/intermarket";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return json(await getDb().select().from(intermarketSnapshots).orderBy(desc(intermarketSnapshots.capturedAt)).limit(30)); } catch (e) { return errorResponse(e); }
}
const Body = z.object({ dxy: z.number().nullable().optional(), dxyChangePct: z.number().nullable().optional(), us02y: z.number().nullable().optional(), us10y: z.number().nullable().optional(), realYield: z.number().nullable().optional(), us02yChangeBp: z.number().nullable().optional(), us10yChangeBp: z.number().nullable().optional(), note: z.string().max(500).nullable().optional() });
export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const b = Body.parse(await request.json());
    const { regime, interpretation } = interpretIntermarket(b);
    const [row] = await getDb().insert(intermarketSnapshots).values({ ...b, regime, interpretation, source: "manual" }).returning();
    return json(row, 201);
  } catch (e) { return errorResponse(e, "Falha ao salvar intermarket"); }
}
