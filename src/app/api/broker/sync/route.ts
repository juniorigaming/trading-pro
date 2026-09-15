import { getDb } from "@/db";
import { brokerageAccounts, trades } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { decryptPassword, getEncryptionSecret } from "@/lib/broker-encryption";
import { getHistoryTrades, getAccountInformation, mapMetaApiDealToTrade, waitForDeployment } from "@/lib/metaapi";
import { mapTradeValues } from "@/lib/trade-mapper";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel/Cloudflare max

export async function POST(request: Request) {
  const start = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const accountId = body.accountId; // id da tabela brokerage_accounts

    let brokerAcc;
    if (accountId) {
      const rows = await getDb().select().from(brokerageAccounts).where(eq(brokerageAccounts.id, Number(accountId))).limit(1);
      if (rows.length === 0) return Response.json({ error: "Conta não encontrada" }, { status: 404 });
      brokerAcc = rows[0];
    } else {
      // Pega a primeira ativa (DooPrime demo 883112)
      const rows = await getDb().select().from(brokerageAccounts).where(eq(brokerageAccounts.isActive, true)).limit(1);
      if (rows.length === 0) return Response.json({ error: "Nenhuma corretora conectada. Conecte primeiro em /configuracoes" }, { status: 404 });
      brokerAcc = rows[0];
    }

    console.log(`[Sync] Iniciando sync para conta ${brokerAcc.accountNumber} (${brokerAcc.broker})`);

    if (!brokerAcc.metaApiAccountId) {
      return Response.json({ 
        error: "Conta não tem MetaApi ID - configure METAAPI_TOKEN e reconecte",
        hint: "Vá no Cloudflare Dashboard > Settings > Variables > adicione METAAPI_TOKEN"
      }, { status: 400 });
    }

    // Espera deploy se necessário
    try {
      await waitForDeployment(brokerAcc.metaApiAccountId, 30000);
    } catch (e: any) {
      console.warn("[Sync] Deploy ainda não pronto, tentando buscar mesmo assim:", e.message);
    }

    // Busca saldo
    let accountInfo: any = {};
    try {
      accountInfo = await getAccountInformation(brokerAcc.metaApiAccountId);
      console.log(`[Sync] Saldo: ${accountInfo.balance} Equity: ${accountInfo.equity}`);
    } catch (e: any) {
      console.warn("[Sync] Falha ao buscar saldo:", e.message);
    }

    // Busca histórico últimos 90 dias
    const deals = await getHistoryTrades(brokerAcc.metaApiAccountId);
    console.log(`[Sync] ${deals.length} deals encontrados`);

    // Filtra apenas deals fechados com profit (trades reais)
    const closedDeals = deals.filter((d: any) => d.type && d.profit !== undefined && d.symbol);

    let imported = 0;
    let skipped = 0;

    for (const deal of closedDeals) {
      // Verifica se já importado (pelo comentário com deal id)
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
        console.warn(`[Sync] Falha ao inserir deal ${deal.id}:`, e.message);
        // Tenta mínimo
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

    // Atualiza saldo e último sync
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

// GET para testar conexão
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
