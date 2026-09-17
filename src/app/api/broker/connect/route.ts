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

    const existing = await getDb().select().from(brokerageAccounts).where(eq(brokerageAccounts.accountNumber, String(accountNumber))).limit(1);
    
    // FIX v11: Se já existe mas metaApiAccountId é null, apaga para permitir retry
    if (existing.length > 0) {
      if (existing[0].metaApiAccountId) {
        return Response.json({ error: `Conta ${accountNumber} já está conectada com MetaApi ID ${existing[0].metaApiAccountId}. Delete primeiro se quiser reconectar.` }, { status: 409 });
      } else {
        console.log(`[Broker Connect] Conta existente sem MetaApi ID encontrada, removendo para retry: id=${existing[0].id}`);
        await getDb().delete(brokerageAccounts).where(eq(brokerageAccounts.id, existing[0].id));
      }
    }

    let metaApiAccountId: string | null = null;
    let metaApiError: string | null = null;
    try {
      const metaAcc = await createMetaApiAccount({
        login: String(accountNumber),
        password: investorPassword,
        server: server.trim(),
        platform: platform.toLowerCase() === "mt4" ? "mt4" : "mt5",
        name: `${brokerName}-${accountNumber}`,
      });
      metaApiAccountId = (metaAcc.id || metaAcc._id) as string;
      console.log(`[Broker Connect] MetaApi account created: ${metaApiAccountId}`);

      if (metaApiAccountId) {
        try {
          await deployMetaApiAccount(metaApiAccountId);
          console.log(`[Broker Connect] Deploy iniciado`);
        } catch (deployErr: any) {
          console.warn(`[Broker Connect] Deploy falhou mas conta criada:`, deployErr.message);
        }
      }
    } catch (e: any) {
      metaApiError = e.message;
      console.warn(`[Broker Connect] MetaApi falhou:`, e.message);
      // Não bloqueia - salva local mas informa erro detalhado
    }

    const [inserted] = await getDb().insert(brokerageAccounts).values({
      broker: brokerName,
      accountNumber: String(accountNumber),
      server: server.trim(),
      platform: platform.toUpperCase(),
      investorPasswordEncrypted: encrypted,
      metaApiAccountId: metaApiAccountId,
      isActive: true,
    }).returning();

    if (metaApiAccountId) {
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
        message: "Conta conectada e deploy iniciado no MetaApi! Aguarde 20s e clique em Sincronizar.",
      }, { status: 201 });
    } else {
      return Response.json({
        success: true,
        account: {
          id: inserted.id,
          broker: inserted.broker,
          accountNumber: inserted.accountNumber,
          server: inserted.server,
          platform: inserted.platform,
          metaApiAccountId: null,
        },
        warning: true,
        message: `Conta salva mas MetaApi falhou: ${metaApiError}. Verifique: 1) METAAPI_TOKEN completo sem quebras, 2) Senha de investidor correta, 3) Servidor exato (ex: DooPrime-Demo). Delete esta conta e tente de novo após corrigir.`,
        details: metaApiError,
      }, { status: 201 });
    }

  } catch (e: any) {
    console.error("[POST /api/broker/connect] Error:", e.message, e.stack);
    return Response.json({ error: "Falha ao conectar corretora", details: e.message }, { status: 500 });
  }
}
