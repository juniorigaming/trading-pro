import { getDb } from "@/db";
import { brokerageAccounts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

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
    if (e.message.includes("does not exist") || e.message.includes("relation")) {
      return Response.json([], { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Failed to load broker accounts", details: e.message }, { status: 500 });
  }
}

// FIX v11: DELETE permite remover conta para reconectar
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");
    let accountNumber = searchParams.get("accountNumber");

    if (!id && !accountNumber) {
      const body = await request.json().catch(() => ({}));
      id = body.id ? String(body.id) : null;
      accountNumber = body.accountNumber ? String(body.accountNumber) : null;
    }

    if (!id && !accountNumber) {
      return Response.json({ error: "Informe id ou accountNumber para deletar" }, { status: 400 });
    }

    if (id) {
      await getDb().delete(brokerageAccounts).where(eq(brokerageAccounts.id, Number(id)));
      console.log(`[DELETE /api/broker/accounts] Deletado id=${id}`);
    } else if (accountNumber) {
      await getDb().delete(brokerageAccounts).where(eq(brokerageAccounts.accountNumber, String(accountNumber)));
      console.log(`[DELETE /api/broker/accounts] Deletado accountNumber=${accountNumber}`);
    }

    return Response.json({ success: true });
  } catch (e: any) {
    console.error("[DELETE /api/broker/accounts]", e.message);
    return Response.json({ error: "Falha ao deletar", details: e.message }, { status: 500 });
  }
}
