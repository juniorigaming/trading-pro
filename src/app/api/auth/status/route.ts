import { hasValidSession, isAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Informa se a proteção por senha está ativa e se o visitante está logado. */
export async function GET(request: Request) {
  const enabled = isAuthEnabled();
  const authenticated = enabled ? await hasValidSession(request) : true;
  return Response.json({ enabled, authenticated }, { headers: { "Cache-Control": "no-store" } });
}
