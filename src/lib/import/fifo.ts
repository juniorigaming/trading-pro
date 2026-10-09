/**
 * Converte execuções (fills) de compra/venda em operações fechadas (round trips),
 * usando preço médio por ativo. Usado por extratos que não trazem o resultado pronto
 * (Clear/XP/Rico e Binance Spot).
 */
import type { ImportedTrade } from "./types";
import { stableHash } from "./csv";

export interface Fill {
  id?: string;
  date: Date;
  time: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  fee?: number;
}

/** Valor financeiro de 1 ponto para 1 contrato nos futuros da B3 (demais ativos = 1). */
export function b3PointValue(assetRaw: string): number {
  const a = assetRaw.toUpperCase();
  if (/^WIN/.test(a)) return 0.2;
  if (/^WDO/.test(a)) return 10;
  if (/^IND/.test(a)) return 1;
  if (/^DOL/.test(a)) return 50;
  if (/^BIT/.test(a)) return 0.1;
  return 1;
}

/** Normaliza código de contrato futuro (WINZ26 → WIN, WDOF27 → WDO) para agrupar no dashboard. */
export function normalizeB3Asset(assetRaw: string): string {
  const a = assetRaw.toUpperCase().replace(/\s+/g, "");
  const fut = /^(WIN|WDO|IND|DOL|BIT|BGI|CCM|ICF)[FGHJKMNQUVXZ]\d{2}$/.exec(a);
  if (fut) return fut[1];
  return a.replace(/F$/, ""); // PETR4F (fracionário) → PETR4
}

export interface FifoOptions {
  /** multiplicador financeiro por ativo (ex.: b3PointValue) */
  multiplier?: (asset: string) => number;
  /** prefixo do externalId gerado */
  source: string;
}

/**
 * Processa fills em ordem cronológica. Cada vez que a posição de um ativo é reduzida,
 * gera uma operação com o P&L realizado daquela parcela. Posições que ficarem abertas
 * no fim do arquivo são ignoradas (e reportadas em `open`).
 */
export function fillsToTrades(fillsIn: Fill[], opts: FifoOptions): { trades: ImportedTrade[]; open: string[] } {
  const fills = [...fillsIn].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.id ?? "").localeCompare(b.id ?? ""));
  const mult = opts.multiplier ?? (() => 1);
  type Pos = { qty: number; avg: number; openedAt: Date; openTime: string; fees: number; firstId?: string };
  const positions = new Map<string, Pos>();
  const out: ImportedTrade[] = [];
  let seq = 0;

  for (const f of fills) {
    if (!(f.quantity > 0) || !Number.isFinite(f.price)) continue;
    const signed = f.side === "BUY" ? f.quantity : -f.quantity;
    const pos = positions.get(f.asset);
    const fee = f.fee ?? 0;

    if (!pos || pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signed)) {
      // abre ou aumenta posição → novo preço médio
      const prevQty = pos?.qty ?? 0;
      const prevAvg = pos?.avg ?? 0;
      const newQty = prevQty + signed;
      const avg = (Math.abs(prevQty) * prevAvg + f.quantity * f.price) / Math.abs(newQty);
      positions.set(f.asset, { qty: newQty, avg, openedAt: pos?.openedAt ?? f.date, openTime: pos?.openTime ?? f.time, fees: (pos?.fees ?? 0) + fee, firstId: pos?.firstId ?? f.id });
      continue;
    }

    // reduz / fecha / inverte posição
    const closeQty = Math.min(Math.abs(pos.qty), f.quantity);
    const direction: "BUY" | "SELL" = pos.qty > 0 ? "BUY" : "SELL";
    const points = pos.qty > 0 ? f.price - pos.avg : pos.avg - f.price;
    const feeShare = pos.fees * (closeQty / Math.abs(pos.qty)) + fee * (closeQty / f.quantity);
    const gross = points * closeQty * mult(f.asset);
    const net = round2(gross - feeShare);
    seq++;
    const idBase = `${opts.source}:${f.asset}:${pos.openedAt.toISOString()}:${f.date.toISOString()}:${closeQty}:${f.price}:${seq}`;
    out.push({
      externalId: f.id && pos.firstId ? `${opts.source}:${pos.firstId}-${f.id}` : `${opts.source}:${stableHash(idBase)}`,
      date: f.date,
      time: f.time,
      asset: f.asset,
      direction,
      resultAmount: net,
      quantity: closeQty,
      entryPrice: round8(pos.avg),
      exitPrice: f.price,
      fees: round2(feeShare),
      notes: `${opts.source} ${f.asset} ${direction} qtd ${closeQty} @ ${fmt(pos.avg)} → ${fmt(f.price)} (aberta ${pos.openTime})`,
    });

    const remaining = Math.abs(pos.qty) - closeQty;
    const leftover = f.quantity - closeQty;
    if (remaining > 0) {
      positions.set(f.asset, { ...pos, qty: Math.sign(pos.qty) * remaining, fees: pos.fees - pos.fees * (closeQty / Math.abs(pos.qty)) });
    } else if (leftover > 0) {
      // inverteu a posição: o excedente abre posição no sentido oposto
      positions.set(f.asset, { qty: Math.sign(signed) * leftover, avg: f.price, openedAt: f.date, openTime: f.time, fees: fee * (leftover / f.quantity), firstId: f.id });
    } else {
      positions.delete(f.asset);
    }
  }

  const open = [...positions.entries()].filter(([, p]) => p.qty !== 0).map(([a, p]) => `${a} (${p.qty > 0 ? "comprado" : "vendido"} ${Math.abs(p.qty)})`);
  return { trades: out, open };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round8(n: number) { return Math.round(n * 1e8) / 1e8; }
function fmt(n: number) { return Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 10 ? 4 : 2); }
