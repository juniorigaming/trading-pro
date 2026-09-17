// Wrapper para MetaApi Cloud - conecta MT4/MT5 e puxa histórico
// Docs: https://metaapi.cloud/docs/
// FIX v11 - melhor logging e tratamento de erro

const METAAPI_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const METAAPI_CLIENT_BASE = "https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai";

function getMetaApiToken(): string {
  try {
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const cf = getCloudflareContext();
    if ((cf.env as any).METAAPI_TOKEN) return (cf.env as any).METAAPI_TOKEN;
  } catch {}
  return process.env.METAAPI_TOKEN || "";
}

async function metaApiFetch(path: string, opts: RequestInit = {}) {
  const token = getMetaApiToken();
  if (!token) throw new Error("METAAPI_TOKEN não configurado no Cloudflare Dashboard > Settings > Variables > Secrets");
  
  // Debug seguro: loga tamanho e prefixo
  console.log(`[MetaApi] Token len=${token.length} prefix=${token.slice(0, 20)}... path=${path}`);

  const res = await fetch(`${METAAPI_BASE}${path}`, {
    ...opts,
    headers: {
      "auth-token": token,
      "Content-Type": "application/json",
      ...(opts.headers as any),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[MetaApi] Error ${res.status} ${path}: ${text}`);
    // Mensagens mais amigáveis
    if (res.status === 401) throw new Error(`MetaApi token inválido (401): verifique se copiou o token completo sem quebras. Detalhe: ${text}`);
    if (res.status === 400) throw new Error(`Dados da conta inválidos (400): verifique servidor, login e senha de investidor. Detalhe: ${text}`);
    throw new Error(`MetaApi error ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function createMetaApiAccount(account: {
  login: string;
  password: string;
  server: string;
  platform: "mt4" | "mt5";
  name: string;
}) {
  const payload = {
    login: account.login,
    password: account.password,
    server: account.server,
    platform: account.platform,
    name: account.name,
    magic: 0,
  };

  console.log(`[MetaApi] Criando conta ${payload.login} @ ${payload.server} (${payload.platform})`);
  const result = await metaApiFetch("/users/current/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result; // { id: metaApiAccountId }
}

export async function deployMetaApiAccount(metaApiAccountId: string) {
  await metaApiFetch(`/users/current/accounts/${metaApiAccountId}/deploy`, {
    method: "POST",
  });
}

export async function getAccountDeploymentStatus(metaApiAccountId: string) {
  return metaApiFetch(`/users/current/accounts/${metaApiAccountId}`);
}

export async function waitForDeployment(metaApiAccountId: string, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const acc = await getAccountDeploymentStatus(metaApiAccountId);
    if (acc.state === "DEPLOYED" && acc.connectionStatus === "CONNECTED") {
      return acc;
    }
    console.log(`[MetaApi] Waiting deploy: state=${acc.state} connection=${acc.connectionStatus}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("Timeout esperando conexão MT5 - verifique login/senha/servidor");
}

export async function getHistoryTrades(metaApiAccountId: string, startTime?: Date, endTime?: Date) {
  const token = getMetaApiToken();
  
  const account = await getAccountDeploymentStatus(metaApiAccountId);
  if (account.state !== "DEPLOYED") {
    throw new Error(`Conta não está deployada: state=${account.state}`);
  }

  const startIso = (startTime || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)).toISOString();
  const endIso = (endTime || new Date()).toISOString();

  const clientRes = await fetch(
    `${METAAPI_CLIENT_BASE}/users/current/accounts/${metaApiAccountId}/history-deals/time/${startIso}/${endIso}`,
    {
      headers: { "auth-token": token },
    }
  );

  if (!clientRes.ok) {
    const txt = await clientRes.text();
    throw new Error(`MetaApi Client error: ${txt}`);
  }

  return clientRes.json();
}

export async function getAccountInformation(metaApiAccountId: string) {
  const token = getMetaApiToken();
  const res = await fetch(
    `${METAAPI_CLIENT_BASE}/users/current/accounts/${metaApiAccountId}/account-information`,
    { headers: { "auth-token": token } }
  );
  if (!res.ok) throw new Error(`Failed to get account info: ${await res.text()}`);
  return res.json();
}

export function mapMetaApiDealToTrade(deal: any) {
  const isBuy = deal.type?.includes("BUY");
  const resultType = deal.profit > 0 ? "WIN" : deal.profit < 0 ? "LOSS" : "BREAK EVEN";
  
  return {
    date: new Date(deal.time).toISOString().split("T")[0],
    time: new Date(deal.time).toTimeString().slice(0, 5),
    asset: deal.symbol,
    direction: isBuy ? "BUY" : "SELL",
    session: "Nova York",
    entryPrice: deal.price,
    resultAmount: deal.profit,
    resultType,
    positionSize: deal.volume,
    setup: "Importado - DooPrime",
    notes: `Importado automaticamente de DooPrime - Deal ID ${deal.id} - Ticket ${deal.positionId || deal.id}`,
    isDemo: false,
  };
}
