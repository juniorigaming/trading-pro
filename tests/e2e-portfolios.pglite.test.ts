/** E2E das carteiras multi-mercado: Postgres em memória (PGlite).
 *  Começa com a tabela `trades` SEM as colunas novas (como produção antes do SQL 0003) e depois aplica a migration.
 *  Roda só quando @electric-sql/pglite está instalado: `npm i --no-save --legacy-peer-deps @electric-sql/pglite && npx vitest run tests/e2e-portfolios.pglite.test.ts` */
import { describe, it, expect, vi } from "vitest";
const PGLITE_PKG = "@electric-sql/pglite";
type Client = { exec: (q: string) => Promise<unknown>; query: (q: string) => Promise<{ rows: Record<string, unknown>[] }> };
let clientRef: Client | null = null;
vi.mock("@/db", async () => {
  const { PGlite } = (await import(/* @vite-ignore */ PGLITE_PKG)) as { PGlite: new () => Client };
  const { drizzle } = await import("drizzle-orm/pglite");
  const { getTableConfig } = await import("drizzle-orm/pg-core");
  const { trades, config } = await import("@/db/schema");
  const client = new PGlite();
  clientRef = client;
  const mk = (t: typeof trades | typeof config, name: string) => {
    const cols = getTableConfig(t as never).columns.map((c) => `"${c.name}" ${c.primary ? "SERIAL PRIMARY KEY" : c.getSQLType()}${c.notNull && !c.primary && !c.hasDefault ? " NOT NULL" : ""}${c.isUnique ? " UNIQUE" : ""}`);
    return `CREATE TABLE ${name} (${cols.join(", ")});`;
  };
  await client.exec(mk(trades, "trades") + mk(config, "config"));
  await client.exec(`ALTER TABLE trades ALTER COLUMN is_demo SET DEFAULT false; ALTER TABLE trades ALTER COLUMN created_at SET DEFAULT now(); ALTER TABLE trades ALTER COLUMN status SET DEFAULT 'CLOSED';
    ALTER TABLE config ALTER COLUMN updated_at SET DEFAULT now();
    -- simula produção ANTES da migration 0003: sem portfolio/external_id
    ALTER TABLE trades DROP COLUMN portfolio; ALTER TABLE trades DROP COLUMN external_id;`);
  const db = drizzle(client as never);
  return { getDb: () => db };
});
const hasPglite = await import(/* @vite-ignore */ PGLITE_PKG).then(() => true).catch(() => false);
const J = (method: string, b: unknown, qs = "") => new Request(`http://x/${qs}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const G = (qs = "") => new Request(`http://x/${qs}`);
const trade = (asset: string, amount: number, extra: Record<string, unknown> = {}) => ({ date: "2026-03-10", time: "10:00", asset, direction: "BUY", session: "Outro", resultAmount: amount, resultType: amount >= 0 ? "WIN" : "LOSS", ...extra });

const PROFIT_CSV = `Ativo;Abertura;Fechamento;Tempo Operação;Qtd Compra;Qtd Venda;Lado;Preço Compra;Preço Venda;Preço de Mercado;Res. Intervalo;Res. Intervalo (%);Res. Operação;Res. Operação (%);TET;Total
WINZ26;10/03/2026 09:15:30;10/03/2026 09:22:10;00:06:40;2;2;C;128.450,00;128.700,00;128.700,00;100,00;0,19;R$ 100,00;0,19;0;100,00
WDOF27;10/03/2026 10:05:00;10/03/2026 10:09:45;00:04:45;1;1;V;5.231,500;5.235,000;5.231,500;-35,00;-0,07;-R$ 35,00;-0,07;0;65,00`;
const BYBIT_CSV = `Contracts,Closing Direction,Qty,Entry Price,Exit Price,Closed P&L,Exit Type,Trade Time
BTCUSDT,Close Long,0.02,66000,66800,16.00,Trade,2026-03-15 14:22:10`;
const upload = (csv: string, portfolio: string, extra: Record<string, string> = {}) => {
  const fd = new FormData(); fd.append("file", new File([csv], "arquivo.csv", { type: "text/csv" })); fd.append("portfolio", portfolio);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return new Request("http://x", { method: "POST", body: fd });
};

describe.skipIf(!hasPglite)("Carteiras e2e (PGlite)", () => {
  it("modo legado (sem coluna portfolio): tudo é FOREX e outras carteiras ficam vazias, sem erro", async () => {
    const { GET, POST } = await import("@/app/api/trades/route");
    const c = await POST(J("POST", trade("EURUSD", 15, { portfolio: "B3", notes: "Ticket 111 legado" })));
    expect(c.status).toBe(201);
    expect(c.headers.get("X-Dropped-Columns")).toContain("portfolio");
    const fx = await GET(G("?portfolio=FOREX"));
    expect(fx.headers.get("X-Portfolio-Column")).toBe("missing");
    const rows = await fx.json(); expect(rows).toHaveLength(1); expect(rows[0].portfolio).toBe("FOREX");
    const b3 = await (await GET(G("?portfolio=B3"))).json(); expect(b3).toEqual([]);
    // importação também funciona no modo legado (com aviso)
    const { POST: IMP } = await import("@/app/api/broker/import/route");
    const r = await (await IMP(upload(BYBIT_CSV, "CRYPTO", { dryRun: "1" }))).json();
    expect(r.dryRun).toBe(true); expect(r.parsed).toBe(1); expect(r.warnings.join(" ")).toMatch(/0003/);
  });

  it("migration 0003 aplicada: coluna portfolio, tickets legados viram external_id, configs B3/CRYPTO criadas", async () => {
    const { readFileSync } = await import("node:fs");
    await clientRef!.exec(readFileSync("drizzle/0003_portfolios.sql", "utf8"));
    (await import("@/lib/trades-db")).resetMissingColumnsCache();
    const { rows } = await clientRef!.query("SELECT portfolio, external_id FROM trades ORDER BY id");
    expect(rows[0]).toMatchObject({ portfolio: "FOREX", external_id: "111" });
    const cfg = await clientRef!.query("SELECT key FROM config ORDER BY key");
    expect(cfg.rows.map((r) => r.key)).toEqual(["settings:B3", "settings:CRYPTO"]);
  });

  it("trades por carteira: POST grava e GET filtra", async () => {
    const { GET, POST } = await import("@/app/api/trades/route");
    expect((await POST(J("POST", trade("WIN", 100, { portfolio: "B3" })))).status).toBe(201);
    expect((await POST(J("POST", trade("BTCUSDT", -5, { portfolio: "CRYPTO" })))).status).toBe(201);
    expect((await POST(J("POST", trade("GBPUSD", 7)))).status).toBe(201); // sem portfolio → FOREX
    const fx = await GET(G("?portfolio=FOREX")); expect(fx.headers.get("X-Portfolio-Column")).toBe("ok");
    expect((await fx.json()).map((t: { asset: string }) => t.asset).sort()).toEqual(["EURUSD", "GBPUSD"]);
    const b3 = await (await GET(G("?portfolio=B3"))).json(); expect(b3).toHaveLength(1); expect(b3[0]).toMatchObject({ asset: "WIN", portfolio: "B3", resultAmount: 100 });
    const cr = await (await GET(G("?portfolio=cripto"))).json(); expect(cr).toHaveLength(1); expect(cr[0].asset).toBe("BTCUSDT");
    const all = await (await GET(G("?portfolio=ALL"))).json(); expect(all).toHaveLength(4);
    const def = await (await GET(G(""))).json(); expect(def).toHaveLength(2); // sem parâmetro = FOREX (compatível)
  });

  it("editar operação não muda a carteira quando o body não envia portfolio", async () => {
    const { GET } = await import("@/app/api/trades/route");
    const { PUT } = await import("@/app/api/trades/[id]/route");
    const [win] = await (await GET(G("?portfolio=B3"))).json();
    const r = await PUT(J("PUT", trade("WIN", 120)), { params: Promise.resolve({ id: String(win.id) }) });
    expect(r.status).toBe(200);
    const after = await (await GET(G("?portfolio=B3"))).json(); expect(after).toHaveLength(1); expect(after[0].resultAmount).toBe(120);
  });

  it("config por carteira: B3 nasce zerada em BRL, CRYPTO em USDT, FOREX mantém a chave legada", async () => {
    const { GET, PUT } = await import("@/app/api/config/route");
    const b3 = await (await GET(G("?portfolio=B3"))).json(); expect(b3).toMatchObject({ currency: "BRL", initialCapital: 0, accountName: "Carteira B3" });
    const cr = await (await GET(G("?portfolio=CRYPTO"))).json(); expect(cr).toMatchObject({ currency: "USDT", initialCapital: 0 });
    const fx = await (await GET(G(""))).json(); expect(fx).toMatchObject({ currency: "USD", initialCapital: 10000 });
    const up = await (await PUT(J("PUT", { initialCapital: 5000, totalDeposits: 500 }, "?portfolio=B3"))).json(); expect(up.initialCapital).toBe(5000);
    const all = await (await GET(G("?all=1"))).json();
    expect(all.B3.initialCapital).toBe(5000); expect(all.B3.totalDeposits).toBe(500); expect(all.CRYPTO.initialCapital).toBe(0); expect(all.FOREX.currency).toBe("USD");
    const keys = await clientRef!.query("SELECT key FROM config ORDER BY key"); expect(keys.rows.map((r) => r.key)).toEqual(["settings:B3", "settings:CRYPTO"]); // FOREX só é gravado quando salvo
  });

  it("importação Profit → B3 com pré-visualização, gravação, anti-duplicidade e exclusão por carteira", async () => {
    const { POST: IMP } = await import("@/app/api/broker/import/route");
    const { GET } = await import("@/app/api/trades/route");
    const dry = await (await IMP(upload(PROFIT_CSV, "B3", { dryRun: "1" }))).json();
    expect(dry).toMatchObject({ dryRun: true, format: "profit", parsed: 2, imported: 0, duplicates: 0 });
    expect((await (await GET(G("?portfolio=B3"))).json())).toHaveLength(1);
    const real = await (await IMP(upload(PROFIT_CSV, "B3"))).json();
    expect(real).toMatchObject({ success: true, imported: 2, duplicates: 0, portfolio: "B3" });
    const b3 = await (await GET(G("?portfolio=B3"))).json(); expect(b3).toHaveLength(3);
    expect(b3.find((t: { asset: string }) => t.asset === "WDO")).toMatchObject({ direction: "SELL", resultAmount: -35, time: "10:09" });
    const again = await (await IMP(upload(PROFIT_CSV, "B3"))).json(); expect(again).toMatchObject({ imported: 0, duplicates: 2 });
    // mesmo arquivo em outra carteira NÃO colide (ids por carteira)
    const other = await (await IMP(upload(PROFIT_CSV, "CRYPTO"))).json(); expect(other.imported).toBe(2);
    // exclusão só das importadas da carteira CRYPTO
    const { DELETE } = await import("@/app/api/trades/clear/route");
    const del = await (await DELETE(new Request("http://x?portfolio=CRYPTO&scope=imported", { method: "DELETE" }))).json(); expect(del.deleted).toBe(2);
    expect(await (await GET(G("?portfolio=CRYPTO"))).json()).toHaveLength(1); // manual BTCUSDT ficou
    expect(await (await GET(G("?portfolio=B3"))).json()).toHaveLength(3); // B3 intacta
    // rota legada /api/broker/import-csv continua funcionando (FOREX) e ignora ticket já existente
    const { POST: LEGACY } = await import("@/app/api/broker/import-csv/route");
    const html = `<table><tr><td>Horário</td><td>Posição</td><td>Ativo</td><td>Tipo</td><td>Volume</td><td>Preço</td><td>Lucro</td></tr><tr><td>2026.09.17 19:16:54</td><td>111</td><td>EURUSD</td><td>buy</td><td>0.10</td><td>1.085</td><td>15.00</td></tr><tr><td>2026.09.18 09:00:00</td><td>222</td><td>USDJPY</td><td>sell</td><td>0.10</td><td>150.1</td><td>-4.00</td></tr></table>`;
    const fd = new FormData(); fd.append("file", new File([html], "ReportHistory.html", { type: "text/html" }));
    const leg = await (await LEGACY(new Request("http://x", { method: "POST", body: fd }))).json();
    expect(leg).toMatchObject({ success: true, imported: 1, duplicates: 1 });
    expect(await (await GET(G("?portfolio=FOREX"))).json()).toHaveLength(3);
  });

  it("template CSV genérico é baixável", async () => {
    const { GET } = await import("@/app/api/broker/import/route");
    const r = await GET(G("?template=1")); expect(r.headers.get("Content-Type")).toContain("text/csv");
    expect((await r.text()).split("\n")[0]).toBe("data,hora,ativo,direcao,quantidade,preco_entrada,preco_saida,resultado,taxas,id_externo,observacoes");
  });
});
