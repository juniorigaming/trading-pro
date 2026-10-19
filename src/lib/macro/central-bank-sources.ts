import { G8, type Currency } from "@/lib/ai/types";
import type { CentralBankPolicySnapshot } from "./market-analysis-types";

const POLICY_URLS: Record<Currency, string> = {
  USD: "https://www.federalreserve.gov/monetarypolicy.htm",
  EUR: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html",
  GBP: "https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate",
  JPY: "https://www.boj.or.jp/en/",
  CHF: "https://www.snb.ch/en/",
  CAD: "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/",
  AUD: "https://www.rba.gov.au/statistics/cash-rate/",
  NZD: "https://www.rbnz.govt.nz/monetary-policy/about-monetary-policy/the-official-cash-rate",
};
const BANKS: Record<Currency, string> = {
  USD: "Federal Reserve (Fed)", EUR: "Banco Central Europeu (BCE)", GBP: "Banco da Inglaterra (BoE)",
  JPY: "Banco do Japão (BoJ)", CHF: "Banco Nacional Suíço (SNB)", CAD: "Banco do Canadá (BoC)",
  AUD: "Reserve Bank of Australia (RBA)", NZD: "Reserve Bank of New Zealand (RBNZ)",
};
const TIMEOUT_MS = 6_000;
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&rsquo;|&#8217;/gi, "’")
    .replace(/&lsquo;|&#8216;/gi, "‘")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(html: string): string {
  return decodeEntities(html
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|br|td|th)>/gi, "\n")
    .replace(/<[^>]*>/g, " "))
    .replace(/[\t\u00a0 ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseDate(value: string, defaultYear?: number): string | null {
  const text = value.trim();
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dotted = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (dotted) return `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;

  let day: number | null = null;
  let month: number | undefined;
  let year: number | null = null;
  const dayFirst = /(\d{1,2})\s+([A-Za-z]{3,9})\.?[, ]*\s*(\d{4})?/.exec(text);
  const monthFirst = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/.exec(text);
  if (dayFirst && MONTHS[dayFirst[2].slice(0, 3).toLowerCase()] !== undefined) {
    day = Number(dayFirst[1]);
    month = MONTHS[dayFirst[2].slice(0, 3).toLowerCase()];
    year = dayFirst[3] ? Number(dayFirst[3]) : defaultYear ?? null;
  } else if (monthFirst && MONTHS[monthFirst[1].slice(0, 3).toLowerCase()] !== undefined) {
    month = MONTHS[monthFirst[1].slice(0, 3).toLowerCase()];
    day = Number(monthFirst[2]);
    year = monthFirst[3] ? Number(monthFirst[3]) : defaultYear ?? null;
  }
  if (day === null || month === undefined || year === null || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateFromText(text: string, pattern: RegExp, defaultYear?: number): string | null {
  const match = pattern.exec(text);
  return match ? parseDate(match[1], defaultYear) : null;
}

function finiteRate(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, ".").replace(/−/g, "-").replace(/[^0-9.+-]/g, "");
  if (!normalized || normalized === "." || normalized === "-" || normalized === "+") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function rateText(rate: number): string {
  return `${Number.isInteger(rate) ? rate.toFixed(0) : String(rate)}%`;
}

function tableRows(html: string): string[] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
}

function tableCells(row: string): string[] {
  return [...row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((match) => htmlToText(match[1]));
}

function safeSameHostUrl(base: string, href: string | undefined): string | null {
  if (!href) return null;
  try {
    const result = new URL(decodeEntities(href), base);
    if (result.protocol !== "https:" || result.hostname !== new URL(base).hostname) return null;
    return result.toString();
  } catch { return null; }
}

function firstLinkedStatement(html: string, pattern: RegExp, base: string): string | null {
  const match = pattern.exec(html);
  if (!match) return null;
  return safeSameHostUrl(base, match[1]);
}

function excerpt(text: string, needles: string[], max = 1_100): string | null {
  const lower = text.toLowerCase();
  let start = -1;
  for (const needle of needles) {
    const index = lower.indexOf(needle.toLowerCase());
    if (index >= 0 && (start < 0 || index < start)) start = index;
  }
  if (start < 0) return null;
  const from = Math.max(0, start - 80);
  return text.slice(from, from + max).trim();
}

function makeSnapshot(currency: Currency, now: Date, values: Partial<CentralBankPolicySnapshot>): CentralBankPolicySnapshot {
  return {
    currency,
    bank: BANKS[currency],
    status: values.status ?? "unavailable",
    rateText: values.rateText ?? null,
    rateLow: values.rateLow ?? null,
    rateHigh: values.rateHigh ?? null,
    asOf: values.asOf ?? null,
    asOfMeaning: values.asOfMeaning ?? "Sem data oficial legível nesta execução.",
    latestDecisionAt: values.latestDecisionAt ?? null,
    nextDecision: values.nextDecision ?? null,
    excerpt: values.excerpt ?? null,
    sourceUrl: POLICY_URLS[currency],
    decisionUrl: values.decisionUrl ?? null,
    retrievedAt: now.toISOString(),
    detail: values.detail ?? null,
  };
}

function rateRowFor(currency: Currency, html: string): { rate: number; asOf: string | null; followUpUrl: string | null; excerptText: string | null } | null {
  const text = htmlToText(html);
  if (currency === "AUD") {
    for (const row of tableRows(html)) {
      if (!/\/media-releases\/\d{4}\//i.test(row) && !/Statement/i.test(row)) continue;
      const cells = tableCells(row);
      const date = cells[0] ?? "";
      const rate = finiteRate(cells[2]);
      if (rate === null || !/\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}/.test(date)) continue;
      const href = firstLinkedStatement(row, /<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*Statement\s*<\/a>/i, POLICY_URLS.AUD);
      return { rate, asOf: parseDate(date), followUpUrl: href, excerptText: null };
    }
    return null;
  }
  if (currency === "CAD") {
    const targetStart = html.search(/<table\b[^>]*id=["']target-table["']/i);
    const tableHtml = targetStart >= 0 ? html.slice(targetStart) : html;
    for (const row of tableRows(tableHtml)) {
      const cells = tableCells(row);
      const rate = finiteRate(cells[1]);
      if (rate === null || !/[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/.test(cells[0] ?? "")) continue;
      const asOf = parseDate(cells[0]);
      const followUpUrl = asOf ? `https://www.bankofcanada.ca/${asOf.slice(0, 4)}/${asOf.slice(5, 7)}/fad-press-release-${asOf}/` : null;
      return { rate, asOf, followUpUrl, excerptText: null };
    }
    return null;
  }
  if (currency === "EUR") {
    for (const row of tableRows(html)) {
      const cells = tableCells(row);
      if (cells.length < 6 || !/^20\d{2}$/.test(cells[0] ?? "")) continue;
      const year = Number(cells[0]);
      const date = parseDate(`${cells[1]} ${year}`);
      const deposit = finiteRate(cells[2]);
      const mro = finiteRate(cells[3]);
      const marginal = finiteRate(cells[5]);
      if (!date || deposit === null || mro === null || marginal === null) continue;
      return { rate: deposit, asOf: date, followUpUrl: null, excerptText: `Taxas oficiais BCE: depósito ${rateText(deposit)}, refinanciamento principal ${rateText(mro)}, crédito marginal ${rateText(marginal)}. Vigência indicada na tabela: ${date}.` };
    }
    return null;
  }
  void text;
  return null;
}

/** URL da última decisão, derivada somente de links da página oficial ou da data da tabela. */
function followUpUrlFor(currency: Currency, html: string): string | null {
  if (currency === "USD") {
    const index = html.search(/FOMC Statement\s*:/i);
    if (index < 0) return null;
    const segment = html.slice(index, index + 1_600);
    const match = /<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*HTML\s*<\/a>/i.exec(segment);
    return safeSameHostUrl(POLICY_URLS.USD, match?.[1]);
  }
  if (currency === "AUD") return rateRowFor(currency, html)?.followUpUrl ?? null;
  if (currency === "CAD") return rateRowFor(currency, html)?.followUpUrl ?? null;
  if (currency === "CHF") {
    return firstLinkedStatement(html, /<a\b[^>]*href=["']([^"']*press-releases-restricted\/pre_\d{8})["'][^>]*>/i, POLICY_URLS.CHF);
  }
  return null;
}

function noData(currency: Currency, now: Date, detail: string): CentralBankPolicySnapshot {
  return makeSnapshot(currency, now, { status: "unavailable", detail });
}

function parseFed(html: string, decisionHtml: string | null, decisionUrl: string | null, now: Date): CentralBankPolicySnapshot {
  const index = htmlToText(html);
  const decision = decisionHtml ? htmlToText(decisionHtml) : "";
  const targetText = decision || index;
  const targetRange = /target range for the federal funds rate[^.]{0,260}?\bto\s+(\d+(?:\s*-\s*\d+\s*\/\s*\d+)?)\s+to\s+(\d+(?:\s*-\s*\d+\s*\/\s*\d+)?)\s*(?:percent|per cent)/i.exec(targetText)
    ?? /target range(?: is| of)?\s+(\d+(?:\s*-\s*\d+\s*\/\s*\d+)?)\s+to\s+(\d+(?:\s*-\s*\d+\s*\/\s*\d+)?)\s*(?:percent|per cent)/i.exec(targetText);
  if (!targetRange || !decisionHtml) return noData("USD", now, "Não foi possível ler a faixa-alvo na decisão HTML mais recente do Fed.");
  const parseFraction = (raw: string) => {
    const match = /^(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)$/.exec(raw.trim());
    return match ? Number(match[1]) + Number(match[2]) / Number(match[3]) : Number(raw);
  };
  const low = parseFraction(targetRange[1]);
  const high = parseFraction(targetRange[2]);
  const asOf = dateFromText(index, /Released\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  return makeSnapshot("USD", now, {
    status: "available", rateLow: low, rateHigh: high, rateText: `${rateText(low)}–${rateText(high)}`,
    asOf, asOfMeaning: "Data de divulgação da última decisão HTML do FOMC encontrada na página oficial.", latestDecisionAt: asOf,
    excerpt: excerpt(decision, ["The Committee decided", "inflation remains", "economic activity"], 1_250),
    decisionUrl,
    detail: decisionUrl ? null : "A página oficial do Fed não forneceu um link reconhecível para a última decisão.",
  });
}

function parseBoe(html: string, now: Date): CentralBankPolicySnapshot {
  const text = htmlToText(html);
  const rateMatch = /Current Bank Rate\s+([\d.]+)\s*%/i.exec(text);
  const rate = finiteRate(rateMatch?.[1]);
  if (rate === null) return noData("GBP", now, "A página oficial do BoE não apresentou a taxa atual em formato reconhecível.");
  const published = dateFromText(text, /Published on\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  const next = /Next due:\s*([^\n]+)/i.exec(text)?.[1]?.trim() ?? null;
  return makeSnapshot("GBP", now, {
    status: "available", rateLow: rate, rateHigh: rate, rateText: rateText(rate), asOf: published,
    asOfMeaning: "Data de publicação da decisão mais recente apresentada pela página oficial do BoE.", latestDecisionAt: published,
    nextDecision: next,
    excerpt: excerpt(text, ["Our latest decision:", "Key points:", "we have maintained Bank Rate"], 1_300),
    decisionUrl: firstLinkedStatement(html, /<a\b[^>]*href=["']([^"']*monetary-policy-summary-and-minutes\/[0-9]{4}\/[A-Za-z0-9-]+)["'][^>]*class=["'][^"']*btn-cta[^"']*["'][^>]*>\s*Read the latest Monetary Policy Summary and Minutes/i, POLICY_URLS.GBP),
  });
}

function parseBoj(html: string, now: Date): CentralBankPolicySnapshot {
  const text = htmlToText(html);
  const rateMatch = /Guideline[\s\S]{0,260}?around\s+([\d.]+)\s+percent/i.exec(text)
    ?? /uncollateralized overnight call rate[\s\S]{0,100}?around\s+([\d.]+)\s+percent/i.exec(text);
  const rate = finiteRate(rateMatch?.[1]);
  if (rate === null) return noData("JPY", now, "A página oficial do BoJ não apresentou a diretriz de taxa em formato reconhecível.");
  const asOf = dateFromText(text, /since\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  const next = /Next Monetary Policy Meeting Date\s+([^\n]+)/i.exec(text)?.[1]?.trim() ?? null;
  return makeSnapshot("JPY", now, {
    status: "available", rateLow: rate, rateHigh: rate, rateText: `taxa overnight de referência em torno de ${rateText(rate)}`,
    asOf, asOfMeaning: "Data de vigência indicada pelo BoJ para a taxa aplicada à facilidade de depósitos; a diretriz de mercado foi lida na mesma página oficial.",
    latestDecisionAt: asOf, nextDecision: next,
    excerpt: excerpt(text, ["Guideline The Bank will encourage", "The Bank will encourage the uncollateralized overnight call rate"], 800),
    decisionUrl: firstLinkedStatement(html, /<a\b[^>]*href=["']([^"']*mopo\/mpmdeci\/mpr_\d{4}\/[^"']+)["'][^>]*>[^<]*Change in the Guideline/i, POLICY_URLS.JPY),
  });
}

function parseSnb(html: string, decisionHtml: string | null, decisionUrl: string | null, now: Date): CentralBankPolicySnapshot {
  const text = htmlToText(html);
  const match = /SNB policy rate\s+([\d.]+)\s*%\s+(\d{1,2}\.\d{1,2}\.\d{4})/i.exec(text);
  const rate = finiteRate(match?.[1]);
  if (!match || rate === null) return noData("CHF", now, "A página oficial do SNB não apresentou a taxa atual em formato reconhecível.");
  const decisionText = decisionHtml ? htmlToText(decisionHtml) : "";
  const decisionDate = decisionText ? dateFromText(decisionText, /(?:Monetary policy assessment of\s+|\b)(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i) : null;
  return makeSnapshot("CHF", now, {
    status: "available", rateLow: rate, rateHigh: rate, rateText: rateText(rate), asOf: parseDate(match[2]),
    asOfMeaning: "Data de observação mostrada junto à taxa atual na página oficial do SNB; não necessariamente a data da última decisão.",
    excerpt: decisionText ? excerpt(decisionText, ["leaves SNB policy rate unchanged", "SNB policy rate", "inflation"], 1_200) : null,
    decisionUrl, latestDecisionAt: decisionDate,
    detail: decisionUrl && !decisionHtml ? "Taxa atual lida; conteúdo da decisão mais recente não pôde ser carregado." : null,
  });
}

function parseRbnz(html: string, now: Date): CentralBankPolicySnapshot {
  const text = htmlToText(html);
  const rateMatch = /Official Cash Rate\s+([\d.]+)\s*%/i.exec(text);
  const rate = finiteRate(rateMatch?.[1]);
  if (rate === null) return noData("NZD", now, "A página oficial do RBNZ não apresentou a OCR em formato reconhecível.");
  const asOf = dateFromText(text, /Updated:\s*[^\n,]*,?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i)
    ?? dateFromText(text, /Last updated:\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
  const next = /Next update:\s*([^\n]+)/i.exec(text)?.[1]?.trim() ?? null;
  const decisionUrl = firstLinkedStatement(html, /<a\b[^>]*href=["']([^"']*\/news\/202\d\/\d{2}\/[^"']+)["'][^>]*>\s*[^<]*OCR decision/i, POLICY_URLS.NZD);
  return makeSnapshot("NZD", now, {
    status: "available", rateLow: rate, rateHigh: rate, rateText: rateText(rate), asOf,
    asOfMeaning: "Data do campo Updated/Last updated exibido na página oficial da OCR; não é automaticamente tratada como data da decisão.", latestDecisionAt: null,
    nextDecision: next,
    excerpt: excerpt(text, ["Our latest decision", "Official Cash Rate", "Future decisions about the OCR"], 1_300),
    decisionUrl,
  });
}

function parseCentralBankPolicyHtmlInternal(currency: Currency, html: string, now: Date, decisionHtml: string | null, decisionUrl: string | null): CentralBankPolicySnapshot {
  if (!html) return noData(currency, now, "A fonte oficial não respondeu nesta execução.");
  if (currency === "USD") return parseFed(html, decisionHtml, decisionUrl, now);
  if (currency === "GBP") return parseBoe(html, now);
  if (currency === "JPY") return parseBoj(html, now);
  if (currency === "CHF") return parseSnb(html, decisionHtml, decisionUrl, now);
  if (currency === "NZD") return parseRbnz(html, now);

  const row = rateRowFor(currency, html);
  if (!row) return noData(currency, now, `Não foi possível extrair a taxa oficial de ${BANKS[currency]} desta página.`);
  const releaseText = decisionHtml ? htmlToText(decisionHtml) : "";
  const text = htmlToText(html);
  if (currency === "AUD") {
    const rate = row.rate;
    return makeSnapshot(currency, now, {
      status: "available", rateLow: rate, rateHigh: rate, rateText: rateText(rate), asOf: row.asOf,
      asOfMeaning: "Data efetiva indicada na tabela oficial do cash rate target do RBA.", latestDecisionAt: row.asOf,
      excerpt: releaseText ? excerpt(releaseText, ["At its meeting", "The Board decided", "The Board remains focused"], 1_200) : null,
      decisionUrl: row.followUpUrl,
      detail: row.followUpUrl && !decisionHtml ? "Taxa atual lida; comunicado oficial da decisão não pôde ser carregado." : null,
    });
  }
  if (currency === "CAD") {
    const rate = row.rate;
    const next = dateFromText(text, /next scheduled date for announcing the overnight rate target is\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
    return makeSnapshot(currency, now, {
      status: "available", rateLow: rate, rateHigh: rate, rateText: rateText(rate), asOf: row.asOf,
      asOfMeaning: "Data da linha mais recente na tabela oficial de policy interest rate do BoC.", latestDecisionAt: row.asOf,
      nextDecision: next,
      excerpt: releaseText ? excerpt(releaseText, ["The Bank of Canada today", "Governing Council", "inflation"], 1_200) : null,
      decisionUrl: row.followUpUrl,
      detail: row.followUpUrl && !decisionHtml ? "Taxa atual lida; comunicado oficial da decisão não pôde ser carregado." : null,
    });
  }
  if (currency === "EUR") {
    return makeSnapshot(currency, now, {
      status: "available", rateLow: row.rate, rateHigh: row.rate, rateText: row.excerptText ?? rateText(row.rate), asOf: row.asOf,
      asOfMeaning: "Data de vigência da linha mais recente da tabela oficial de taxas-chave do BCE; a taxa de depósito é usada como taxa de política de referência.", latestDecisionAt: row.asOf,
      excerpt: row.excerptText,
      detail: "A página consultada fornece a tabela de taxas; comunicado contemporâneo com guidance não foi obtido por este parser.",
    });
  }
  return noData(currency, now, "Moeda não suportada pelo coletor oficial de taxas.");
}

/** Parser sem rede para testes de regressão dos parsers oficiais. */
export function parseCentralBankPolicyHtml(currency: Currency, html: string, now = new Date(), decisionHtml: string | null = null, decisionUrl: string | null = null): CentralBankPolicySnapshot {
  return parseCentralBankPolicyHtmlInternal(currency, html, now, decisionHtml, decisionUrl);
}

async function fetchOfficialHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; TradingProMacro/1.0)",
      },
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type && !type.toLowerCase().includes("html") && !type.toLowerCase().includes("text")) return null;
    return await response.text();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function loadOne(currency: Currency, now: Date): Promise<CentralBankPolicySnapshot> {
  const sourceUrl = POLICY_URLS[currency];
  const html = await fetchOfficialHtml(sourceUrl);
  if (!html) return noData(currency, now, `Fonte oficial indisponível nesta execução: ${sourceUrl}`);
  const followUpUrl = followUpUrlFor(currency, html);
  const decisionHtml = followUpUrl ? await fetchOfficialHtml(followUpUrl) : null;
  const result = parseCentralBankPolicyHtmlInternal(currency, html, now, decisionHtml, followUpUrl);
  if (result.status === "available" && followUpUrl && !decisionHtml) {
    result.detail = result.detail ?? "Taxa oficial disponível; texto da decisão mais recente indisponível.";
  }
  return result;
}

/** Consulta em paralelo as páginas oficiais; qualquer fonte individual pode falhar sem derrubar a análise G8. */
export async function fetchCentralBankPolicySnapshots(now = new Date()): Promise<CentralBankPolicySnapshot[]> {
  const results = await Promise.all(G8.map((currency) => loadOne(currency, now).catch(() => noData(currency, now, "Falha inesperada ao consultar a fonte oficial."))));
  return results;
}

export function getCentralBankPolicyUrl(currency: Currency): string { return POLICY_URLS[currency]; }
