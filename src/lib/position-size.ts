export interface AssetSpec {
  pipSize: number; // value of 1 pip in price terms (e.g., 0.0001 for EURUSD, 0.01 for JPY pairs)
  tickSize: number; // minimum price increment
  contractSize: number; // units per 1 lot / unit of position
}

// Configurable specifications per asset. Avoids hardcoded incorrect formulas.
export const ASSET_SPECS: Record<string, AssetSpec> = {
  EURUSD: { pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000 },
  GBPUSD: { pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000 },
  AUDUSD: { pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000 },
  NZDUSD: { pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000 },
  USDCAD: { pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000 },
  USDCHF: { pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000 },
  USDJPY: { pipSize: 0.01, tickSize: 0.001, contractSize: 100000 },
  XAUUSD: { pipSize: 0.1, tickSize: 0.01, contractSize: 100 }, // gold
  XAGUSD: { pipSize: 0.01, tickSize: 0.001, contractSize: 5000 }, // silver
  NAS100: { pipSize: 1, tickSize: 0.25, contractSize: 1 }, // index CFD
  US30: { pipSize: 1, tickSize: 1, contractSize: 1 },
  BTCUSD: { pipSize: 1, tickSize: 0.5, contractSize: 1 },
};

export interface PositionSizeResult {
  riskAmount: number;
  stopDistance: number;
  pips: number;
  ticks: number;
  unitsPerRisk: number; // position size in base units per contract
}

export function calculatePositionSize(
  balance: number,
  riskPercent: number,
  asset: string,
  entry: number,
  stop: number
): PositionSizeResult | null {
  if (!balance || !entry || !stop || balance <= 0) return null;
  const spec = ASSET_SPECS[asset.toUpperCase()];
  if (!spec) return null;

  const riskAmount = (riskPercent / 100) * balance;
  const stopDistance = Math.abs(entry - stop);
  if (stopDistance <= 0) return null;

  const pips = stopDistance / spec.pipSize;
  const ticks = stopDistance / spec.tickSize;

  // units per risk = total risk amount / (stopDistance per unit * contractSize).
  // Risk per lot = stopDistance * contractSize (in quote currency units).
  const riskPerLot = stopDistance * spec.contractSize;
  const lots = riskPerLot > 0 ? riskAmount / riskPerLot : 0;

  return { riskAmount, stopDistance, pips, ticks, unitsPerRisk: lots };
}
