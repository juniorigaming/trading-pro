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

    // FIX v14: seleciona só colunas que existem, evita updated_at se não existir
    let brokerAcc;
    try {
      if (accountId) {
        const rows = await getDb().select({
          id: brokerageAccounts.id,
          broker: brokerageAccounts.broker,
          accountNumber: brokerageAccounts.accountNumber,
          server: brokerageAccounts.server,
          platform: brokerageAccounts.platform,
          investorPasswordEncrypted: brokerageAccounts.investorPasswordEncrypted,
          metaApiAccountId: brokerageAccounts.metaApiAccountId,
          isActive: brokerageAccounts.isActive,
          lastSyncAt: brokerageAccounts.lastSyncAt,
          balance: brokerageAccounts.balance,
          equity: brokerageAccounts.equity,
        }).from(brokerageAccounts).where(eq(brokerageAccounts.id, Number(accountId))).limit(1);
        if (rows.length === 0) return Response.json({ error: "Conta não encontrada" }, { status: 404 });
        brokerAcc = rows[0] as any;
      } else {
        const rows = await getDb().select({
          id: brokerageAccounts.id,
          broker: brokerageAccounts.broker,
          accountNumber: brokerageAccounts.accountNumber,
          server: brokerageAccounts.server,
          platform: brokerageAccounts.platform,
          investorPasswordEncrypted: brokerageAccounts.investorPasswordEncrypted,
          metaApiAccountId: brokerageAccounts.metaApiAccountId,
          isActive: brokerageAccounts.isActive,
          lastSyncAt: brokerageAccounts.lastSyncAt,
          balance: brokerageAccounts.balance,
          equity: brokerageAccounts.equity,
        }).from(brokerageAccounts).where(eq(brokerageAccounts.isActive, true)).limit(1);
        if (rows.length === 0) return Response.json({ error: "Nenhuma corretora conectada. Conecte primeiro em /configuracoes" }, { status: 404 });
        brokerAcc = rows[0] as any;
      }
    } catch (e: any) {
      console.error("[Sync] Falha ao buscar conta, tentando sem colunas novas:", e.message);
      // Fallback: tenta com SQL cru se schema antigo
      return Response.json({ error: "Erro ao buscar conta no banco", details: e.message, hint: "Rode no Neon: ALTER TABLE brokerage_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW(); ALTER TABLE brokerage_accounts ADD COLUMN IF NOT EXISTS balance DECIMAL(18,2); ALTER TABLE brokerage_accounts ADD COLUMN IF NOT EXISTS equity DECIMAL(18,2); ALTER TABLE brokerage_accounts ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP;" }, { status: 500 });
    }

    console.log(`[Sync] Iniciando sync para conta ${brokerAcc.accountNumber} (${brokerAcc.broker}) metaApiId=${brokerAcc.metaApiAccountId}`);

    if (!brokerAcc.metaApiAccountId) {
      return Response.json({ error: "Conta não tem MetaApi ID - reconecte com token válido" }, { status: 400 });
    }

    let status;
    try {
      status = await getAccountDeploymentStatus(brokerAcc.metaApiAccountId);
      console.log(`[Sync] Status atual: state=${status.state} connection=${status.connectionStatus}`);
      if (status.state === "UNDEPLOYED") {
        console.log(`[Sync] Conta UNDEPLOYED, iniciando deploy...`);
        await deployMetaApiAccount(brokerAcc.metaApiAccountId);
      }
    } catch (e: any) {
      console.warn(`[Sync] Falha ao checar status: ${e.message}`);
    }

    try {
      await waitForDeployment(brokerAcc.metaApiAccountId, 45000);
    } catch (e: any) {
      console.warn(`[Sync] Deploy ainda não pronto: ${e.message}`);
    }

    let accountInfo: any = {};
    try {
      accountInfo = await getAccountInformation(brokerAcc.metaApiAccountId);
      console.log(`[Sync] Saldo: ${accountInfo.balance} Equity: ${accountInfo.equity}`);
    } catch (e: any) {
      console.warn(`[Sync] Falha ao buscar saldo: ${e.message}`);
      if (e.message.includes("UNDEPLOYED") || e.message.includes("not deployed")) {
        return Response.json({ 
          error: "Conta ainda está iniciando. Aguarde 20 segundos e clique em Sincronizar novamente.",
          details: `State: ${status?.state}`,
          retryIn: 20
        }, { status: 400 });
      }
    }

    let deals: any[] = [];
    try {
      deals = await getHistoryTrades(brokerAcc.metaApiAccountId);
    } catch (e: any) {
      if (e.message.includes("UNDEPLOYED") || e.message.includes("DEPLOYING")) {
        return Response.json({ error: "Conta ainda está conectando. Tente novamente em 20s.", details: e.message, retryIn: 20, balance: accountInfo.balance }, { status: 400 });
      }
      throw e;
    }

    const closedDeals = deals.filter((d: any) => d.type && d.profit !== undefined && d.symbol);
    let imported = 0;
    let skipped = 0;

    for (const deal of closedDeals) {
      const existing = await getDb().select({ id: trades.id }).from(trades).where(sql`${trades.notes} LIKE ${'%' + deal.id + '%'}`).limit(1);
      if (existing.length > 0) { skipped++; continue; }
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
        } catch { skipped++; }
      }
    }

    try {
      await getDb().update(brokerageAccounts).set({
        lastSyncAt: new Date(),
        balance: accountInfo.balance ? String(accountInfo.balance) : undefined,
        equity: accountInfo.equity ? String(accountInfo.equity) : undefined,
      } as any).where(eq(brokerageAccounts.id, brokerAcc.id));
    } catch (e: any) {
      console.warn("[Sync] Falha ao atualizar saldo:", e.message);
    }

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
    const accounts = await getDb().select({
      id: brokerageAccounts.id,
      broker: brokerageAccounts.broker,
      accountNumber: brokerageAccounts.accountNumber,
      server: brokerageAccounts.server,
      platform: brokerageAccounts.platform,
      lastSyncAt: brokerageAccounts.lastSyncAt,
      balance: brokerageAccounts.balance,
      hasMetaApiId: brokerageAccounts.metaApiAccountId,
    } as any).from(brokerageAccounts).limit(5);
    return Response.json({
      connected: accounts.length,
      accounts,
      metaApiConfigured: true,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
