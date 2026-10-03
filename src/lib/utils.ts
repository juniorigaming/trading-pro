function safeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/** Moeda exibida por padrão (muda com a carteira ativa: USD → Forex, BRL → B3, USDT → Cripto). */
let displayCurrency = "USD";
export function setDisplayCurrency(currency: string) {
  displayCurrency = (currency || "USD").toUpperCase();
}
export function getDisplayCurrency() {
  return displayCurrency;
}

/**
 * Formata um valor na moeda informada (ou na moeda da carteira ativa).
 * USD → $1,234.56 · BRL → R$ 1.234,56 · USDT → 1,234.56 USDT · demais códigos ISO → Intl.
 */
export function formatCurrency(value: number | string | null | undefined, currency?: string) {
  const cur = (currency || displayCurrency || "USD").toUpperCase();
  const n = safeNumber(value);
  if (cur === "USDT" || cur === "USDC" || cur === "BUSD") {
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${cur}`;
  }
  if (cur === "BRL") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);
  }
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(n);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
  }
}

export function formatNumber(value: number | string | null | undefined, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safeNumber(value));
}

export function formatPercent(value: number | string | null | undefined) {
  return formatNumber(value) + "%";
}

export function formatR(value: number | string | null | undefined) {
  const num = safeNumber(value);
  return (num >= 0 ? "+" : "") + formatNumber(num) + "R";
}
