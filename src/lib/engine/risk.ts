/*
 * The limit check, exactly as contracts/src/OrlunoRiskMath.sol and OrlunoLimitRegistry.checkTrade define it.
 * contracts/test/OrlunoParity.t.sol replays the cases scripts/make-parity.ts writes from this file.
 */
export const SIDE_BUY = 1;
export const SIDE_SELL = 2;

export const BITS = {
  BAD_SIDE: 1 << 0,
  POSITION_OVER: 1 << 1,
  DAILY_LOSS_HIT: 1 << 2,
  TRADES_PER_DAY_HIT: 1 << 3,
  SLIPPAGE_OVER: 1 << 4,
  POSITION_BAD: 1 << 5,
  // registry-only bits
  UNKNOWN_CONFIG: 1 << 8,
  RETIRED: 1 << 9,
  PRICE_BAD: 1 << 10,
  PRICE_STALE: 1 << 11,
} as const;
export type BitName = keyof typeof BITS;

export const BIT_WORDS: Record<BitName, { label: string; text: string }> = {
  BAD_SIDE: { label: "Bad side", text: "The trade is neither a buy nor a sell." },
  POSITION_OVER: { label: "Position limit", text: "The buy would leave the position above your maximum share of equity." },
  DAILY_LOSS_HIT: { label: "Daily loss limit", text: "Today's loss reached your daily maximum, so no new buys until the next UTC day." },
  TRADES_PER_DAY_HIT: { label: "Trades per day", text: "Today's trade count reached your maximum, so no new buys until the next UTC day." },
  SLIPPAGE_OVER: { label: "Slippage limit", text: "The slippage this run assumes is above the maximum you accept." },
  POSITION_BAD: { label: "Over 100 %", text: "The position would be larger than all equity (leverage is not supported)." },
  UNKNOWN_CONFIG: { label: "Unknown config", text: "No config with this number exists in the registry." },
  RETIRED: { label: "Retired", text: "The owner retired this config." },
  PRICE_BAD: { label: "Price unreadable", text: "The config's price feed did not give a positive, current answer." },
  PRICE_STALE: { label: "Price too old", text: "The feed's latest answer is older than the config's maximum price age." },
};

export type Limits = {
  maxPositionBps: number;
  maxDailyLossBps: number;
  maxTradesPerDay: number;
  maxSlippageBps: number;
  maxPriceAge: number;
};
export type TradeQuery = { side: number; positionAfterBps: number; dayLossBps: number; tradesToday: number; slippageBps: number };

export const LIMIT_RANGES = {
  maxPositionBps: [1, 10_000],
  maxDailyLossBps: [1, 10_000],
  maxTradesPerDay: [1, 96],
  maxSlippageBps: [0, 1_000],
  maxPriceAge: [60, 7 * 86_400],
} as const;

const inRange = (v: number, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && v >= lo && v <= hi;

export function validLimits(l: Limits): boolean {
  return (Object.keys(LIMIT_RANGES) as (keyof Limits)[]).every((k) => inRange(l[k], LIMIT_RANGES[k]));
}

/** True when `next` allows anything `cur` refuses: the registry queues such a change for 24 hours. */
export function loosens(cur: Limits, next: Limits): boolean {
  return (Object.keys(LIMIT_RANGES) as (keyof Limits)[]).some((k) => next[k] > cur[k]);
}

/** Solidity uint8/uint16 arguments: callers clamp here so the site and the contract read the same numbers. */
export const u16 = (v: number) => Math.max(0, Math.min(65_535, Math.floor(v)));
export const u8 = (v: number) => Math.max(0, Math.min(255, Math.floor(v)));

export function checkLimits(l: Limits, t: TradeQuery): number {
  let bits = 0;
  if (t.side !== SIDE_BUY && t.side !== SIDE_SELL) bits |= BITS.BAD_SIDE;
  if (t.positionAfterBps > 10_000) bits |= BITS.POSITION_BAD;
  if (t.slippageBps > l.maxSlippageBps) bits |= BITS.SLIPPAGE_OVER;
  if (t.side === SIDE_BUY) {
    if (t.positionAfterBps > l.maxPositionBps) bits |= BITS.POSITION_OVER;
    if (t.dayLossBps >= l.maxDailyLossBps) bits |= BITS.DAILY_LOSS_HIT;
    if (t.tradesToday >= l.maxTradesPerDay) bits |= BITS.TRADES_PER_DAY_HIT;
  }
  return bits;
}

export function bitNames(bits: number | bigint): BitName[] {
  const b = BigInt(bits);
  return (Object.keys(BITS) as BitName[]).filter((k) => (b & BigInt(BITS[k])) !== 0n);
}
