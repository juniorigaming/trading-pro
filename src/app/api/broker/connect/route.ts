import { getDb } from "@/db";
import { brokerageAccounts } from "@/db/schema";
import { encryptPassword, getEncryptionSecret } from "@/lib/broker-encryption";
import { createMetaApiAccount, deployMetaApiAccount } from "@/lib/metaapi";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { broker, accountNumber, server, platform, investorPassword } = body;

    if (!accountNumber || !server || !platform || !investorPassword) {
      return Response.json({ error: "accountNumber, server, platform e investorPassword são obrigatórios" }, { status: 400 });
    }

    const brokerName = broker || "dooprime";
    const secret = getEncryptionSecret();
    const encrypted = await encryptPassword(investorPassword, secret);

    console.log(`[Broker Connect] Conectando ${brokerName} ${accountNumber} @ ${server} (${platform})`);

    // Verifica se já existe
    const existing = await getDb().select().from(brokerageAccounts).where(eq(brokerageAccounts.accountNumber, String(accountNumber))).limit(1);
    if (existing.length > 0) {
      return Response.json({ error: "Essa conta já está conectada" }, { status: 409 });
    }

    // Tenta criar no MetaApi
    let metaApiAccountId: string | null = null;
    try {
      const metaAcc = await createMetaApiAccount({
        login: String(accountNumber),
        password: investorPassword,
        server: server,
        platform: platform.toLowerCase() === "mt4" ? "mt4" : "mt5",
        name: `${brokerName}-${accountNumber}`,
      });
      metaApiAccountId = metaAcc.id;
      console.log(`[Broker Connect] MetaApi account created: ${metaApiAccountId}`);

      // Deploia
      await deployMetaApiAccount(metaApiAccountId);
      console.log(`[Broker Connect] Deploy iniciado`);
    } catch (e: any) {
      console.warn(`[Broker Connect] MetaApi falhou (pode ser falta de METAAPI_TOKEN), mas salvando conta local mesmo:`, e.message);
      // Não falha - salva mesmo sem MetaApi, permite sync manual depois
    }

    const [inserted] = await getDb().insert(brokerageAccounts).values({
      broker: brokerName,
      accountNumber: String(accountNumber),
      server: server,
      platform: platform.toUpperCase(),
      investorPasswordEncrypted: encrypted,
      metaApiAccountId: metaApiAccountId,
      isActive: true,
    }).returning();

    return Response.json({
      success: true,
      account: {
        id: inserted.id,
        broker: inserted.broker,
        accountNumber: inserted.accountNumber,
        server: inserted.server,
        platform: inserted.platform,
        metaApiAccountId,
      },
      message: metaApiAccountId ? "Conta conectada e deploy iniciado no MetaApi" : "Conta salva localmente. Configure METAAPI_TOKEN no Cloudflare para sync automático",
    }, { status: 201 });

  } catch (e: any) {
    console.error("[POST /api/broker/connect] Error:", e.message, e.stack);
    return Response.json({ error: "Falha ao conectar corretora", details: e.message }, { status: 500 });
  }
}
