export const dynamic = "force-dynamic";

function getMetaApiToken(): string {
  let token = "";
  try {
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const cf = getCloudflareContext();
    if ((cf.env as any).METAAPI_TOKEN) token = (cf.env as any).METAAPI_TOKEN;
  } catch {}
  if (!token) token = process.env.METAAPI_TOKEN || "";
  return token.trim().replace(/[\r\n\s]/g, "").replace(/^["']|["']$/g, "");
}

export async function GET() {
  const rawToken = (() => {
    try {
      const { getCloudflareContext } = require("@opennextjs/cloudflare");
      const cf = getCloudflareContext();
      if ((cf.env as any).METAAPI_TOKEN) return (cf.env as any).METAAPI_TOKEN;
    } catch {}
    return process.env.METAAPI_TOKEN || "";
  })();

  const token = getMetaApiToken();
  
  if (!token) {
    return Response.json({ ok: false, error: "METAAPI_TOKEN não configurado", len: 0 });
  }

  const dotCount = (token.match(/\./g) || []).length;
  const hasEllipsis = token.includes("...") || token.includes("…");
  const hasRiskSuffix = token.endsWith("CI6InJpc2s") || token.toLowerCase().includes("risc");
  const isTooShort = token.length < 1200;

  // Validação local antes de chamar MetaApi
  if (dotCount !== 2 || hasEllipsis || hasRiskSuffix || isTooShort) {
    return Response.json({
      ok: false,
      tokenLen: token.length,
      rawLen: rawToken.length,
      dotCount,
      hasEllipsis,
      hasRiskSuffix,
      tokenPrefix: token.slice(0, 30) + "...",
      tokenSuffix: "..." + token.slice(-30),
      error: "TOKEN CORTADO DETECTADO",
      message: `Token parece cortado! Dots=${dotCount} (deveria ser 2), len=${token.length} (deveria ser 1500-2000), tem ...=${hasEllipsis}. Seu token termina com "${token.slice(-20)}" que é parte do JSON interno, não assinatura. Copie o token COMPLETO em https://app.metaapi.cloud/token-management > clique no olho > Copy. Não copie da URL nem de print.`,
      howToFix: [
        "1. Vá em https://app.metaapi.cloud/token-management",
        "2. Clique em Create Token (ou no token existente > Manage)",
        "3. Dê nome trading-pro e marque todas permissões: provisioning, trading, history, etc",
        "4. Clique no ícone de olho para mostrar token completo",
        "5. Clique em Copy (não selecione manualmente)",
        "6. No Cloudflare Dashboard > trading-pro > Settings > Variables > edite METAAPI_TOKEN > cole",
        "7. Salve e aguarde deploy",
        "8. Teste novamente /api/broker/test"
      ]
    });
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
      dotCount,
      tokenPrefix: token.slice(0, 20) + "...",
      tokenSuffix: "..." + token.slice(-10),
      metaApiStatus: res.status,
      metaApiResponse: json,
      message: res.ok ? `Token válido! ${Array.isArray(json) ? json.length : 0} contas no MetaApi.` : `Token inválido ou erro MetaApi: ${res.status}`,
    });
  } catch (e: any) {
    return Response.json({ ok: false, tokenLen: token.length, dotCount, error: e.message }, { status: 500 });
  }
}
