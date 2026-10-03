/** Render SSR dos componentes de carteira (sem rede): seletor, importação, sidebar e formulário não quebram. */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import PortfolioSwitcher from "@/components/PortfolioSwitcher";
import ImportTrades from "@/components/ImportTrades";
import DashboardAiWidgets from "@/components/ai/DashboardAiWidgets";

const wrap = (el: React.ReactElement) => renderToStaticMarkup(<PortfolioProvider>{el}</PortfolioProvider>);

describe("UI carteiras (SSR)", () => {
  it("PortfolioSwitcher mostra as 3 carteiras com Forex ativa por padrão", () => {
    const html = wrap(<PortfolioSwitcher />);
    expect(html).toContain("Forex");
    expect(html).toContain("B3");
    expect(html).toContain("Cripto");
    expect(html).toContain("USDT");
    expect(html).toContain("BRL");
    expect(html).toContain('aria-pressed="true"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("Saldo &amp; limites · Forex");
  });
  it("PortfolioSwitcher compacto", () => {
    const html = wrap(<PortfolioSwitcher compact />);
    expect(html).toContain("Forex");
    expect(html).not.toContain("Saldo &amp; limites");
  });
  it("ImportTrades lista formatos por carteira e link do modelo", () => {
    const html = wrap(<ImportTrades defaultPortfolio="B3" />);
    expect(html).toContain("Profit / Nelogica");
    expect(html).toContain("Clear / XP / Rico");
    expect(html).toContain("/api/broker/import?template=1");
    expect(html).toContain("Carteira de destino");
    const crypto = wrap(<ImportTrades defaultPortfolio="CRYPTO" />);
    expect(crypto).toContain("Binance");
    expect(crypto).toContain("Bybit");
  });
  it("DashboardAiWidgets renderiza por carteira sem repetir cards", () => {
    const fx = renderToStaticMarkup(<DashboardAiWidgets portfolio="FOREX" />);
    const b3 = renderToStaticMarkup(<DashboardAiWidgets portfolio="B3" />);
    const cr = renderToStaticMarkup(<DashboardAiWidgets portfolio="CRYPTO" />);
    expect(fx).toContain("Ranking G8"); expect(fx).not.toContain("B3 Macro");
    expect(b3).toContain("B3 Macro"); expect(b3).not.toContain("Ranking G8");
    expect(cr).toContain("Regime de risco global"); expect(cr).not.toContain("B3 Macro");
    expect(cr).toContain("Checklist Cripto");
  });
});
