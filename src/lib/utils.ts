function safeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function formatCurrency(value: number | string | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "USD",
    minimumFractionDigits: 2,
  }).format(safeNumber(value));
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
