import { getDb } from "@/db";
import { brokerageAccounts } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getDb().select({
      id: brokerageAccounts.id,
      broker: brokerageAccounts.broker,
      accountNumber: brokerageAccounts.accountNumber,
      server: brokerageAccounts.server,
      platform: brokerageAccounts.platform,
      isActive: brokerageAccounts.isActive,
      lastSyncAt: brokerageAccounts.lastSyncAt,
      balance: brokerageAccounts.balance,
      equity: brokerageAccounts.equity,
      metaApiAccountId: brokerageAccounts.metaApiAccountId,
      createdAt: brokerageAccounts.createdAt,
    }).from(brokerageAccounts).orderBy(desc(brokerageAccounts.createdAt));

    return Response.json(rows, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    console.error("[GET /api/broker/accounts]", e.message);
    // Se tabela não existe, retorna vazio ao invés de 500
    if (e.message.includes("does not exist") || e.message.includes("relation")) {
      return Response.json([], { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Failed to load broker accounts", details: e.message }, { status: 500 });
  }
}
