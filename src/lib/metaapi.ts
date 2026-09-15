// Wrapper para MetaApi Cloud - conecta MT4/MT5 e puxa histórico
// Docs: https://metaapi.cloud/docs/

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
  if (!token) throw new Error("METAAPI_TOKEN não configurado no Cloudflare Dashboard > Settings > Variables");

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
    throw new Error(`MetaApi error ${res.status}: ${text}`);
  }

  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// Cria conta no MetaApi
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

  const result = await metaApiFetch("/users/current/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result; // { id: metaApiAccountId }
}

// Deploia conta (inicia conexão)
export async function deployMetaApiAccount(metaApiAccountId: string) {
  await metaApiFetch(`/users/current/accounts/${metaApiAccountId}/deploy`, {
    method: "POST",
  });
}

// Pega status da conexão
export async function getAccountDeploymentStatus(metaApiAccountId: string) {
  return metaApiFetch(`/users/current/accounts/${metaApiAccountId}`);
}

// Espera até estar deployada e conectada (polling)
export async function waitForDeployment(metaApiAccountId: string, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const acc = await getAccountDeploymentStatus(metaApiAccountId);
    if (acc.state === "DEPLOYED" && acc.connectionStatus === "CONNECTED") {
      return acc;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("Timeout esperando conexão MT5 - verifique login/senha/servidor");
}

// Busca histórico de trades via Client API
export async function getHistoryTrades(metaApiAccountId: string, startTime?: Date, endTime?: Date) {
  const token = getMetaApiToken();
  
  // Primeiro pega o token de acesso da conta
  const account = await getAccountDeploymentStatus(metaApiAccountId);
  if (account.state !== "DEPLOYED") {
    throw new Error("Conta não está deployada");
  }

  // Usa Client API para histórico
  // Formato: https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/{id}/history-deals/time/{start}/{end}
  const startIso = (startTime || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString();
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

  return clientRes.json(); // array de deals
}

export async function getAccountInformation(metaApiAccountId: string) {
  const token = getMetaApiToken();
  const res = await fetch(
    `${METAAPI_CLIENT_BASE}/users/current/accounts/${metaApiAccountId}/account-information`,
    { headers: { "auth-token": token } }
  );
  if (!res.ok) throw new Error(`Failed to get account info: ${await res.text()}`);
  return res.json(); // { balance, equity, etc }
}

// Mapeia deal do MetaApi para formato do nosso dashboard
export function mapMetaApiDealToTrade(deal: any) {
  // Deal MT5: { id, type: DEAL_TYPE_BUY/SELL, symbol, volume, price, profit, time, etc }
  const isBuy = deal.type?.includes("BUY");
  const resultType = deal.profit > 0 ? "WIN" : deal.profit < 0 ? "LOSS" : "BREAK EVEN";
  
  return {
    date: new Date(deal.time).toISOString().split("T")[0],
    time: new Date(deal.time).toTimeString().slice(0, 5),
    asset: deal.symbol,
    direction: isBuy ? "BUY" : "SELL",
    session: "Nova York", // pode melhorar com lógica de horário
    entryPrice: deal.price,
    resultAmount: deal.profit,
    resultType,
    positionSize: deal.volume,
    // Campos que vamos deixar vazio pra usuário completar depois
    setup: "Importado - DooPrime",
    notes: `Importado automaticamente de DooPrime - Deal ID ${deal.id} - Ticket ${deal.positionId || deal.id}`,
    isDemo: false,
  };
}
