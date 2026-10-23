import type { ReactNode } from "react";

const CURRENCY_FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CHF: "🇨🇭",
  CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿", BRL: "🇧🇷", CNY: "🇨🇳",
  MXN: "🇲🇽", SEK: "🇸🇪", NOK: "🇳🇴", SGD: "🇸🇬", HKD: "🇭🇰",
};

const FIAT_CODES = new Set(Object.keys(CURRENCY_FLAGS));

const CRYPTO_MARKS: [string, string, string][] = [
  ["BTC", "₿", "amber"], ["ETH", "Ξ", "violet"], ["SOL", "◎", "violet"],
  ["BNB", "◆", "amber"], ["XRP", "✕", "sky"], ["ADA", "₳", "sky"],
  ["DOGE", "Ð", "amber"], ["LTC", "Ł", "sky"], ["DOT", "●", "rose"],
  ["LINK", "⬡", "blue"], ["AVAX", "▲", "rose"], ["TRX", "T", "rose"],
  ["TON", "◉", "sky"], ["USDT", "₮", "emerald"], ["USDC", "$", "blue"],
];

const TONE_CLASSES: Record<string, string> = {
  amber: "border-amber/25 bg-amber/10 text-amber",
  violet: "border-violet/25 bg-violet/10 text-violet",
  sky: "border-sky/25 bg-sky/10 text-sky",
  rose: "border-rose/25 bg-rose/10 text-rose",
  blue: "border-blue-400/25 bg-blue-400/10 text-blue-400",
  emerald: "border-emerald/25 bg-emerald/10 text-emerald",
  accent: "border-accent/25 bg-accent-soft text-accent",
};

export type MarketSymbolDescriptor =
  | { kind: "pair"; base: string; quote: string }
  | { kind: "mark"; glyph: string; tone: keyof typeof TONE_CLASSES; label: string };

/** Returns a local, image-free symbol for FX pairs, metals, crypto, indices and other assets. */
export function getMarketSymbolDescriptor(raw: string): MarketSymbolDescriptor {
  const symbol = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const metal = symbol.match(/^(XAU|XAG|XPT|XPD)/)?.[1];
  if (metal) {
    const labels: Record<string, [string, string]> = {
      XAU: ["Au", "Ouro"], XAG: ["Ag", "Prata"], XPT: ["Pt", "Platina"], XPD: ["Pd", "Paládio"],
    };
    const [glyph, label] = labels[metal];
    return { kind: "mark", glyph, tone: "amber", label };
  }

  const pair = symbol.match(/^([A-Z]{3})([A-Z]{3})/);
  if (pair && FIAT_CODES.has(pair[1]) && FIAT_CODES.has(pair[2])) {
    return { kind: "pair", base: pair[1], quote: pair[2] };
  }

  const crypto = CRYPTO_MARKS.find(([ticker]) => symbol.startsWith(ticker));
  if (crypto) return { kind: "mark", glyph: crypto[1], tone: crypto[2] as keyof typeof TONE_CLASSES, label: crypto[0] };

  if (/^(NAS100|US100|USTEC|NASDAQ)/.test(symbol)) return { kind: "mark", glyph: "NQ", tone: "blue", label: "Nasdaq" };
  if (/^(US30|DJI|DOW)/.test(symbol)) return { kind: "mark", glyph: "DJ", tone: "blue", label: "Dow Jones" };
  if (/^(US500|SPX500|SP500|SPX)/.test(symbol)) return { kind: "mark", glyph: "S&P", tone: "blue", label: "S&P 500" };
  if (symbol.startsWith("DXY")) return { kind: "mark", glyph: "DXY", tone: "emerald", label: "Índice do dólar" };
  if (/^(WIN|WDO|DOL|IND|DI1|BIT|BGI|CCM|ICF|SJC)/.test(symbol)) {
    return { kind: "mark", glyph: symbol.slice(0, 3), tone: "emerald", label: "Contrato B3" };
  }

  return { kind: "mark", glyph: symbol.slice(0, 2) || "•", tone: "accent", label: "Ativo" };
}

export function marketSymbolLabel(raw: string): string {
  const descriptor = getMarketSymbolDescriptor(raw);
  if (descriptor.kind === "pair") return `${CURRENCY_FLAGS[descriptor.base]} ${CURRENCY_FLAGS[descriptor.quote]} ${raw.toUpperCase()}`;
  return `${descriptor.glyph} ${raw.toUpperCase()}`;
}

export function CurrencyMark({ currency, size = "sm" }: { currency: string; size?: "sm" | "md" }) {
  const flag = CURRENCY_FLAGS[currency.toUpperCase()];
  const sizeClass = size === "md" ? "h-6 w-6 text-sm" : "h-5 w-5 text-[11px]";
  return (
    <span
      aria-hidden="true"
      title={currency.toUpperCase()}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-3 leading-none ${sizeClass}`}
    >
      {flag ?? currency.slice(0, 1).toUpperCase()}
    </span>
  );
}

function MarketGlyph({ glyph, tone, size }: { glyph: string; tone: keyof typeof TONE_CLASSES; size: "sm" | "md" }) {
  const sizeClass = size === "md" ? "h-7 min-w-7 px-1.5 text-[10px]" : "h-6 min-w-6 px-1 text-[9px]";
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-lg border font-extrabold leading-none ${sizeClass} ${TONE_CLASSES[tone]}`}>
      {glyph}
    </span>
  );
}

export default function MarketSymbol({ symbol, size = "md" }: { symbol: string; size?: "sm" | "md" }) {
  const descriptor = getMarketSymbolDescriptor(symbol);
  if (descriptor.kind === "pair") {
    return (
      <span aria-hidden="true" title={`${descriptor.base} / ${descriptor.quote}`} className="inline-flex shrink-0 items-center -space-x-1">
        <CurrencyMark currency={descriptor.base} size={size === "md" ? "md" : "sm"} />
        <CurrencyMark currency={descriptor.quote} size={size === "md" ? "md" : "sm"} />
      </span>
    );
  }
  return <MarketGlyph glyph={descriptor.glyph} tone={descriptor.tone} size={size} />;
}

export function MarketSymbolWithLabel({ symbol, size = "md", children }: { symbol: string; size?: "sm" | "md"; children?: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <MarketSymbol symbol={symbol} size={size} />
      <span className="truncate">{children ?? symbol}</span>
    </span>
  );
}
