export const dynamic = "force-dynamic";

function getMetaApiToken(): string {
  try {
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const cf = getCloudflareContext();
    if ((cf.env as any).METAAPI_TOKEN) return (cf.env as any).METAAPI_TOKEN;
  } catch {}
  return process.env.METAAPI_TOKEN || "";
}

export async function GET() {
  const token = getMetaApiToken();
  if (!token) {
    return Response.json({ ok: false, error: "METAAPI_TOKEN não configurado", len: 0 });
  }

  // Testa token listando contas
  try {
    const res = await fetch("https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts", {
      headers: { "auth-token": token },
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    
    return Response.json({
      ok: res.ok,
      tokenLen: token.length,
      tokenPrefix: token.slice(0, 20) + "...",
      tokenSuffix: "..." + token.slice(-10),
      metaApiStatus: res.status,
      metaApiResponse: json,
      message: res.ok ? "Token válido! Pode conectar contas." : `Token inválido ou erro MetaApi: ${res.status}`,
    });
  } catch (e: any) {
    return Response.json({ ok: false, tokenLen: token.length, error: e.message }, { status: 500 });
  }
}
