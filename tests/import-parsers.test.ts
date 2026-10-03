import { describe, expect, it } from "vitest";
import { detectFormat, parseImport, parseNumber, parseDateTime, fillsToTrades, b3PointValue, normalizeB3Asset, GENERIC_TEMPLATE_CSV } from "@/lib/import";
import { configKeyFor, guessPortfolioFromSymbol, normalizePortfolio } from "@/lib/portfolio";
import { formatCurrency, setDisplayCurrency } from "@/lib/utils";

const MT5_HTML = `<html><body>
<table>
<tr><th colspan="13">Posições</th></tr>
<tr><td>Horário</td><td>Posição</td><td>Ativo</td><td>Tipo</td><td>Volume</td><td>Preço</td><td>S / L</td><td>T / P</td><td>Horário</td><td>Preço</td><td>Comissão</td><td>Swap</td><td>Lucro</td></tr>
<tr><td>2026.09.17 19:16:54</td><td>123456</td><td>EURUSD</td><td>buy</td><td>0.10</td><td>1.08500</td><td></td><td></td><td>2026.09.17 20:01:10</td><td>1.08650</td><td>0.00</td><td>0.00</td><td>15.00</td></tr>
<tr><td>2026.09.18 09:30:00</td><td>123457</td><td>XAUUSD.r</td><td>sell</td><td>0.05</td><td>2650.10</td><td></td><td></td><td>2026.09.18 10:12:00</td><td>2655.10</td><td>0.00</td><td>0.00</td><td>-25.00</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>0.00</td><td>0.00</td><td>-10.00</td></tr>
<tr><th colspan="13">Ordens</th></tr>
<tr><td>Horário</td><td>Ordem</td><td>Ativo</td><td>Tipo</td><td>Volume</td><td>Preço</td><td>S / L</td><td>T / P</td><td>Horário</td><td>Estado</td><td>Comentário</td></tr>
<tr><td>2026.09.17 19:16:54</td><td>999</td><td>EURUSD</td><td>buy</td><td>0.10</td><td>1.08500</td><td></td><td></td><td>2026.09.17 19:16:54</td><td>filled</td><td></td></tr>
</table></body></html>`;

const PROFIT_CSV = `Resumo de Operações
Ativo;Abertura;Fechamento;Tempo Operação;Qtd Compra;Qtd Venda;Lado;Preço Compra;Preço Venda;Preço de Mercado;Res. Intervalo;Res. Intervalo (%);Res. Operação;Res. Operação (%);TET;Total
WINZ26;10/03/2026 09:15:30;10/03/2026 09:22:10;00:06:40;2;2;C;128.450,00;128.700,00;128.700,00;100,00;0,19;R$ 100,00;0,19;0;100,00
WDOF27;10/03/2026 10:05:00;10/03/2026 10:09:45;00:04:45;1;1;V;5.231,500;5.235,000;5.231,500;-35,00;-0,07;-R$ 35,00;-0,07;0;65,00
PETR4;11/03/2026 11:00:00;11/03/2026 15:30:00;04:30:00;100;100;C;38,10;38,60;38,60;50,00;1,31;50,00;1,31;0;115,00
Total;;;;;;;;;;;;115,00;;;`;

const CLEAR_CSV = `Data;Hora;Ativo;C/V;Quantidade;Preço;Valor
10/03/2026;09:10;WINZ26;C;2;128400;256800,00
10/03/2026;09:25;WINZ26;V;2;128650;257300,00
10/03/2026;10:00;PETR4;C;100;38,10;3810,00
10/03/2026;10:40;PETR4;V;50;38,60;1930,00
10/03/2026;11:00;VALE3;C;100;60,00;6000,00`;

const BINANCE_FUT = `Date(UTC),Symbol,Side,Price,Quantity,Amount,Fee,Realized Profit,Quote Asset
2026-03-11 22:10:05,BTCUSDT,BUY,67000.0,0.010,670.0,0.268,0.0,USDT
2026-03-11 22:15:40,BTCUSDT,SELL,67500.0,0.005,337.5,0.135,2.5,USDT
2026-03-11 22:15:41,BTCUSDT,SELL,67520.0,0.005,337.6,0.135,2.6,USDT
2026-03-12 01:00:00,ETHUSDT,BUY,3500,1,3500,1.4,-12.0,USDT`;

const BINANCE_SPOT = `Date(UTC),Pair,Side,Price,Executed,Amount,Fee
2026-03-01 10:00:00,SOLUSDT,BUY,150.00,10SOL,1500USDT,1.5USDT
2026-03-02 10:00:00,SOLUSDT,SELL,160.00,10SOL,1600USDT,1.6USDT`;

const BYBIT_CSV = `Contracts,Closing Direction,Qty,Entry Price,Exit Price,Closed P&L,Exit Type,Trade Time
BTCUSDT,Close Long,0.02,66000,66800,16.00,Trade,2026-03-15 14:22:10
ETHUSDT,Close Short,1,3600,3650,-50.00,Trade,2026-03-16 09:05:00`;

describe("detectFormat", () => {
  it("identifica cada corretora pelo conteúdo", () => {
    expect(detectFormat(MT5_HTML, "ReportHistory.html")).toBe("mt5");
    expect(detectFormat(PROFIT_CSV, "resumo.csv")).toBe("profit");
    expect(detectFormat(CLEAR_CSV, "negociacoes.csv")).toBe("clear");
    expect(detectFormat(BINANCE_FUT, "export.csv")).toBe("binance");
    expect(detectFormat(BINANCE_SPOT, "export.csv")).toBe("binance");
    expect(detectFormat(BYBIT_CSV, "closed-pnl.csv")).toBe("bybit");
    expect(detectFormat(GENERIC_TEMPLATE_CSV, "modelo.csv")).toBe("generic");
    expect(detectFormat("lorem ipsum", "x.txt")).toBeNull();
  });
});

describe("MT5", () => {
  it("lê só a tabela Posições, com ticket, hora real e símbolo limpo", () => {
    const r = parseImport(MT5_HTML, { portfolio: "FOREX", format: "auto" });
    expect(r.format).toBe("mt5");
    expect(r.trades).toHaveLength(2);
    expect(r.trades[0]).toMatchObject({ externalId: "123456", asset: "EURUSD", direction: "BUY", resultAmount: 15, time: "19:16" });
    expect(r.trades[1]).toMatchObject({ externalId: "123457", asset: "XAUUSD", direction: "SELL", resultAmount: -25 });
  });
});

describe("Profit / Nelogica", () => {
  it("converte Resumo de Operações (pt-BR) em operações fechadas", () => {
    const r = parseImport(PROFIT_CSV, { portfolio: "B3", format: "profit" });
    expect(r.trades).toHaveLength(3);
    expect(r.trades[0]).toMatchObject({ asset: "WIN", direction: "BUY", resultAmount: 100, time: "09:22", quantity: 2, entryPrice: 128450, exitPrice: 128700 });
    expect(r.trades[1]).toMatchObject({ asset: "WDO", direction: "SELL", resultAmount: -35 });
    expect(r.trades[2]).toMatchObject({ asset: "PETR4", resultAmount: 50 });
    // externalId determinístico → reimportar o mesmo arquivo não duplica
    const again = parseImport(PROFIT_CSV, { portfolio: "B3", format: "profit" });
    expect(again.trades.map((t) => t.externalId)).toEqual(r.trades.map((t) => t.externalId));
  });
});

describe("Clear / XP (FIFO)", () => {
  it("casa compras e vendas por preço médio com multiplicador da B3", () => {
    const r = parseImport(CLEAR_CSV, { portfolio: "B3", format: "clear" });
    expect(r.trades).toHaveLength(2);
    const win = r.trades.find((t) => t.asset === "WIN")!;
    expect(win.direction).toBe("BUY");
    expect(win.resultAmount).toBeCloseTo((128650 - 128400) * 2 * 0.2, 2); // 100 R$
    const petr = r.trades.find((t) => t.asset === "PETR4")!;
    expect(petr.resultAmount).toBeCloseTo(0.5 * 50, 2);
    expect(r.warnings.join(" ")).toMatch(/PETR4|VALE3/); // posições abertas reportadas
  });
  it("b3PointValue / normalizeB3Asset", () => {
    expect(b3PointValue("WINZ26")).toBe(0.2);
    expect(b3PointValue("WDOF27")).toBe(10);
    expect(b3PointValue("PETR4")).toBe(1);
    expect(normalizeB3Asset("WINZ26")).toBe("WIN");
    expect(normalizeB3Asset("PETR4F")).toBe("PETR4");
  });
  it("fillsToTrades trata inversão de posição", () => {
    const d = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
    const { trades, open } = fillsToTrades([
      { date: d(9), time: "09:00", asset: "X", side: "BUY", quantity: 1, price: 10 },
      { date: d(10), time: "10:00", asset: "X", side: "SELL", quantity: 3, price: 12 },
      { date: d(11), time: "11:00", asset: "X", side: "BUY", quantity: 2, price: 11 },
    ], { source: "t" });
    expect(trades).toHaveLength(2);
    expect(trades[0].resultAmount).toBe(2); // long 1 @10 → 12
    expect(trades[1].resultAmount).toBe(2); // short 2 @12 → 11
    expect(trades[1].direction).toBe("SELL");
    expect(open).toEqual([]);
  });
});

describe("Binance", () => {
  it("Futures Trade History: agrega fills de fechamento e desconta fee", () => {
    const r = parseImport(BINANCE_FUT, { portfolio: "CRYPTO", format: "auto" });
    expect(r.format).toBe("binance");
    expect(r.trades).toHaveLength(2);
    const btc = r.trades.find((t) => t.asset === "BTCUSDT")!;
    expect(btc.direction).toBe("BUY"); // fechado por SELL → posição era comprada
    expect(btc.resultAmount).toBeCloseTo(2.5 + 2.6 - 0.27, 2);
    expect(btc.quantity).toBeCloseTo(0.01, 6);
    const eth = r.trades.find((t) => t.asset === "ETHUSDT")!;
    expect(eth.direction).toBe("SELL");
    expect(eth.resultAmount).toBeCloseTo(-13.4, 2);
  });
  it("Spot Trade History: FIFO com fee em USDT", () => {
    const r = parseImport(BINANCE_SPOT, { portfolio: "CRYPTO", format: "binance" });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ asset: "SOLUSDT", direction: "BUY" });
    expect(r.trades[0].resultAmount).toBeCloseTo(100 - 3.1, 2);
  });
});

describe("Bybit", () => {
  it("Closed P&L", () => {
    const r = parseImport(BYBIT_CSV, { portfolio: "CRYPTO", format: "auto" });
    expect(r.trades).toHaveLength(2);
    expect(r.trades[0]).toMatchObject({ asset: "BTCUSDT", direction: "BUY", resultAmount: 16, entryPrice: 66000, exitPrice: 66800, time: "14:22" });
    expect(r.trades[1]).toMatchObject({ asset: "ETHUSDT", direction: "SELL", resultAmount: -50 });
  });
});

describe("CSV genérico", () => {
  it("modelo oficial importa 3 linhas (resultado líquido de taxas)", () => {
    const r = parseImport(GENERIC_TEMPLATE_CSV, { portfolio: "FOREX", format: "generic" });
    expect(r.trades).toHaveLength(3);
    expect(r.trades[0]).toMatchObject({ asset: "WIN", direction: "BUY", resultAmount: 98.8, externalId: "csv:nota-001", time: "10:35" });
    expect(r.trades[2]).toMatchObject({ asset: "BTCUSDT", resultAmount: -5.4 });
  });
  it("aceita cabeçalhos em inglês e ponto-e-vírgula", () => {
    const csv = "Date;Symbol;Side;PnL\n2026-04-01 10:00;GBPUSD;SELL;12.5\n2026-04-02;USDJPY;buy;-3";
    const r = parseImport(csv, { portfolio: "FOREX", format: "auto" });
    expect(r.format).toBe("generic");
    expect(r.trades.map((t) => [t.asset, t.direction, t.resultAmount])).toEqual([["GBPUSD", "SELL", 12.5], ["USDJPY", "BUY", -3]]);
  });
  it("formato desconhecido devolve aviso e zero operações", () => {
    const r = parseImport("abc\n123", { portfolio: "FOREX" });
    expect(r.trades).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/formato/i);
  });
});

describe("helpers", () => {
  it("parseNumber pt-BR / en-US / auto", () => {
    expect(parseNumber("1.234,56", "pt")).toBe(1234.56);
    expect(parseNumber("-R$ 35,00", "pt")).toBe(-35);
    expect(parseNumber("(12.5)", "en")).toBe(-12.5);
    expect(parseNumber("1,234.56", "en")).toBe(1234.56);
    expect(parseNumber("128.450,00", "auto")).toBe(128450);
    expect(parseNumber("0.268", "auto")).toBe(0.268);
    expect(parseNumber("10SOL", "en")).toBe(10);
    expect(parseNumber("", "pt")).toBeNull();
  });
  it("parseDateTime formatos comuns", () => {
    expect(parseDateTime("2026.09.17 19:16:54")?.iso).toBe("2026-09-17T19:16:54.000Z");
    expect(parseDateTime("17/09/2026 19:16")?.time).toBe("19:16");
    expect(parseDateTime("2026-09-17T19:16:54Z")?.time).toBe("19:16");
    expect(parseDateTime("17/09/26")?.iso.slice(0, 10)).toBe("2026-09-17");
    expect(parseDateTime("nope")).toBeNull();
  });
  it("portfolio helpers", () => {
    expect(normalizePortfolio("cripto")).toBe("CRYPTO");
    expect(normalizePortfolio("b3")).toBe("B3");
    expect(normalizePortfolio(undefined)).toBe("FOREX");
    expect(configKeyFor("FOREX")).toBe("settings");
    expect(configKeyFor("B3")).toBe("settings:B3");
    expect(guessPortfolioFromSymbol("WINZ26")).toBe("B3");
    expect(guessPortfolioFromSymbol("PETR4")).toBe("B3");
    expect(guessPortfolioFromSymbol("BTCUSDT")).toBe("CRYPTO");
    expect(guessPortfolioFromSymbol("EURUSD")).toBe("FOREX");
  });
  it("formatCurrency respeita a moeda da carteira", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
    expect(formatCurrency(1234.5, "BRL").replace(/\u00a0/g, " ")).toBe("R$ 1.234,50");
    expect(formatCurrency(1234.5, "USDT")).toBe("1,234.50 USDT");
    setDisplayCurrency("BRL");
    expect(formatCurrency(10).replace(/\u00a0/g, " ")).toBe("R$ 10,00");
    setDisplayCurrency("USD");
    expect(formatCurrency(10)).toBe("$10.00");
  });
});
