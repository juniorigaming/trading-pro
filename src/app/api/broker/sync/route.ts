import { getDb } from "@/db";
import { brokerageAccounts, trades } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getAccountInformation, getHistoryTrades, mapMetaApiDealToTrade, getAccountDeploymentStatus, deployMetaApiAccount, waitForDeployment } from "@/lib/metaapi";
import { mapTradeValues } from "@/lib/trade-mapper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const start = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const accountId = body.accountId;

    let brokerAcc;
    if (accountId) {
      const rows = await getDb().select().from(brokerageAccounts).where(eq(brokerageAccounts.id, Number(accountId))).limit(1);
      if (rows.length === 0) return Response.json({ error: "Conta não encontrada" }, { status: 404 });
      brokerAcc = rows[0];
    } else {
      const rows = await getDb().select().from(brokerageAccounts).where(eq(brokerageAccounts.isActive, true)).limit(1);
      if (rows.length === 0) return Response.json({ error: "Nenhuma corretora conectada. Conecte primeiro em /configuracoes" }, { status: 404 });
      brokerAcc = rows[0];
    }

    console.log(`[Sync] Iniciando sync para conta ${brokerAcc.accountNumber} (${brokerAcc.broker}) metaApiId=${brokerAcc.metaApiAccountId}`);

    if (!brokerAcc.metaApiAccountId) {
      return Response.json({ 
        error: "Conta não tem MetaApi ID - reconecte com token válido",
      }, { status: 400 });
    }

    // FIX v13: Se UNDEPLOYED, faz deploy automaticamente
    let status;
    try {
      status = await getAccountDeploymentStatus(brokerAcc.metaApiAccountId);
      console.log(`[Sync] Status atual: state=${status.state} connection=${status.connectionStatus}`);
      
      if (status.state === "UNDEPLOYED") {
        console.log(`[Sync] Conta UNDEPLOYED, iniciando deploy...`);
        await deployMetaApiAccount(brokerAcc.metaApiAccountId);
        console.log(`[Sync] Deploy solicitado, aguardando...`);
      }
    } catch (e: any) {
      console.warn(`[Sync] Falha ao checar status: ${e.message}`);
    }

    // Espera deploy ficar pronto (até 45s)
    try {
      await waitForDeployment(brokerAcc.metaApiAccountId, 45000);
      console.log(`[Sync] Deploy OK - conectado`);
    } catch (e: any) {
      console.warn(`[Sync] Deploy ainda não pronto: ${e.message}, tentando buscar mesmo assim...`);
      // Não falha aqui, tenta buscar mesmo assim - pode estar em DEPLOYING mas já responde
    }

    // Busca saldo
    let accountInfo: any = {};
    try {
      accountInfo = await getAccountInformation(brokerAcc.metaApiAccountId);
      console.log(`[Sync] Saldo: ${accountInfo.balance} Equity: ${accountInfo.equity}`);
    } catch (e: any) {
      console.warn(`[Sync] Falha ao buscar saldo: ${e.message}`);
      // Se falhar por UNDEPLOYED ainda, retorna erro amigável
      if (e.message.includes("UNDEPLOYED") || e.message.includes("not deployed")) {
        return Response.json({ 
          error: "Conta ainda está iniciando. Aguarde 20 segundos e clique em Sincronizar novamente.",
          details: `State: ${status?.state} - O MetaApi está ligando sua conta ${brokerAcc.accountNumber} no servidor ${brokerAcc.server}. Isso demora 20-40s na primeira vez.`,
          retryIn: 20
        }, { status: 400 });
      }
    }

    // Busca histórico
    let deals: any[] = [];
    try {
      deals = await getHistoryTrades(brokerAcc.metaApiAccountId);
      console.log(`[Sync] ${deals.length} deals encontrados`);
    } catch (e: any) {
      console.warn(`[Sync] Falha ao buscar histórico: ${e.message}`);
      if (e.message.includes("UNDEPLOYED") || e.message.includes("not deployed") || e.message.includes("DEPLOYING")) {
        return Response.json({
          error: "Conta ainda está conectando. Tente novamente em 20s.",
          details: e.message,
          retryIn: 20,
          balance: accountInfo.balance,
        }, { status: 400 });
      }
      throw e;
    }

    const closedDeals = deals.filter((d: any) => d.type && d.profit !== undefined && d.symbol);

    let imported = 0;
    let skipped = 0;

    for (const deal of closedDeals) {
      const existing = await getDb().select({ id: trades.id }).from(trades).where(sql`${trades.notes} LIKE ${'%' + deal.id + '%'}`).limit(1);
      if (existing.length > 0) {
        skipped++;
        continue;
      }
      const mappedTrade = mapMetaApiDealToTrade(deal);
      try {
        const { db: values } = mapTradeValues(mappedTrade as any);
        await getDb().insert(trades).values(values as any);
        imported++;
      } catch (e: any) {
        try {
          const minimal = {
            date: new Date(deal.time),
            time: new Date(deal.time).toTimeString().slice(0, 5),
            asset: deal.symbol,
            direction: deal.type.includes("BUY") ? "BUY" : "SELL",
            session: "Nova York",
            resultAmount: String(deal.profit),
            resultType: deal.profit > 0 ? "WIN" : deal.profit < 0 ? "LOSS" : "BREAK EVEN",
            notes: `Auto-import DooPrime Deal ${deal.id}`,
          };
          await getDb().insert(trades).values(minimal as any);
          imported++;
        } catch (e2) {
          skipped++;
        }
      }
    }

    await getDb().update(brokerageAccounts).set({
      lastSyncAt: new Date(),
      balance: accountInfo.balance ? String(accountInfo.balance) : undefined,
      equity: accountInfo.equity ? String(accountInfo.equity) : undefined,
      updatedAt: new Date(),
    }).where(eq(brokerageAccounts.id, brokerAcc.id));

    const duration = Date.now() - start;

    return Response.json({
      success: true,
      accountNumber: brokerAcc.accountNumber,
      broker: brokerAcc.broker,
      dealsFound: deals.length,
      imported,
      skipped,
      balance: accountInfo.balance,
      equity: accountInfo.equity,
      durationMs: duration,
    });

  } catch (e: any) {
    console.error("[POST /api/broker/sync] Error:", e.message, e.stack);
    return Response.json({ error: "Falha no sync", details: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const accounts = await getDb().select().from(brokerageAccounts).limit(5);
    return Response.json({
      connected: accounts.length,
      accounts: accounts.map(a => ({
        id: a.id,
        broker: a.broker,
        accountNumber: a.accountNumber,
        server: a.server,
        platform: a.platform,
        lastSyncAt: a.lastSyncAt,
        balance: a.balance,
        hasMetaApiId: !!a.metaApiAccountId,
      })),
      metaApiConfigured: !!process.env.METAAPI_TOKEN || (() => {
        try {
          const { getCloudflareContext } = require("@opennextjs/cloudflare");
          return !!(getCloudflareContext().env as any).METAAPI_TOKEN;
        } catch { return false; }
      })(),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
