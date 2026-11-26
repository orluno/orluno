/*
 * One run of a strategy config over a window of hourly bars. Backtest and paper trading call this same function with the same
 * config; only the window differs (backtest: history before the paper start, paper: bars that closed after it).
 * Model (all stated on /method):
 *   - long only, one position at a time, paper money in USD, no leverage;
 *   - decisions at each bar close; fills at that close plus slippage (buys) or minus slippage (sells), then the fee;
 *   - each buy uses sizeBps of current equity; exits: stop loss, take profit, then the template's exit rule;
 *   - risk limits checked with the registry's own rules (risk.ts) before every fill; refused buys are logged, never filled;
 *   - day = UTC day of the bar close; daily loss = drop from the equity at the day's first bar.
 */
import type { Bar } from "./bars";
import type { StrategyConfig } from "./config";
import { BITS, SIDE_BUY, SIDE_SELL, checkLimits, u16, u8 } from "./risk";
import { templateById } from "./templates";

export const ACTION = { WAIT: 0, HOLD: 1, BUY: 2, SELL: 3, REFUSED: 4 } as const;
export type Action = (typeof ACTION)[keyof typeof ACTION];
export const ACTION_NAME: Record<Action, string> = { 0: "Wait", 1: "Hold", 2: "Buy", 3: "Sell", 4: "Refused" };

export const RULE = { ENTRY: 1, NO_ENTRY: 2, EXIT: 3, STOP_LOSS: 4, TAKE_PROFIT: 5, NO_EXIT: 6 } as const;
export type Rule = (typeof RULE)[keyof typeof RULE];
export const RULE_NAME: Record<Rule, string> = { 1: "Entry rule", 2: "No entry", 3: "Exit rule", 4: "Stop loss", 5: "Take profit", 6: "No exit" };

export type Decision = {
  t: number;
  answer: string;
  price: number;
  action: Action;
  rule: Rule;
  /** Limit bits from risk.ts (0 when inside every limit or when no trade was attempted). */
  bits: number;
  text: string;
  positionBps: number;
  equity: number;
  fill?: number;
  fee?: number;
  qty?: number;
};
export type Trade = { t: number; side: "buy" | "sell"; price: number; fill: number; qty: number; value: number; fee: number; slip: number; pnl?: number };
export type Point = { t: number; equity: number; hold: number; price: number };
export type Metrics = {
  bars: number;
  from: number | null;
  to: number | null;
  startEquity: number;
  endEquity: number;
  returnPct: number;
  holdReturnPct: number;
  excessPct: number;
  maxDrawdownPct: number;
  holdMaxDrawdownPct: number;
  fees: number;
  slippage: number;
  trades: number;
  roundTrips: number;
  winRatePct: number | null;
  exposurePct: number;
  refused: number;
  refusedBy: Record<string, number>;
  openPosition: boolean;
};
export type RunResult = { decisions: Decision[]; trades: Trade[]; curve: Point[]; metrics: Metrics };

export function simulate(cfg: StrategyConfig, bars: Bar[], from: number, to: number): RunResult {
  const tpl = templateById(cfg.template);
  if (!tpl) throw new Error("unknown template");
  const p = cfg.params;
  const closes = bars.map((b) => b.close);
  const warm = tpl.warmup(p);
  const fee = cfg.feeBps / 10_000;
  const slip = cfg.slippageBps / 10_000;
  let cash = cfg.startCash;
  let qty = 0;
  let entryFill = 0;
  let entryCost = 0;
  let peak = 0;
  let day = -1;
  let dayOpen = cfg.startCash;
  let tradesToday = 0;
  let fees = 0;
  let slipCost = 0;
  let holdQty = 0;
  let holdBought = false;
  const decisions: Decision[] = [];
  const trades: Trade[] = [];
  const curve: Point[] = [];

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (b.t < from || b.t >= to || i < warm) continue;
    const px = b.close;
    if (!holdBought) {
      // Buy-and-hold comparison: the whole start cash buys at the first decision bar with the same fee and slippage.
      holdQty = (cfg.startCash * (1 - fee)) / (px * (1 + slip));
      holdBought = true;
    }
    const eq = cash + qty * px;
    const d = Math.floor(b.t / 86_400);
    if (d !== day) {
      day = d;
      dayOpen = eq;
      tradesToday = 0;
    }
    const dayLossBps = eq < dayOpen ? u16(((dayOpen - eq) / dayOpen) * 10_000) : 0;
    let dec: Decision;
    if (qty > 0) {
      peak = Math.max(peak, px);
      const sl = cfg.stopLossBps > 0 && px <= entryFill * (1 - cfg.stopLossBps / 10_000);
      const tp = cfg.takeProfitBps > 0 && px >= entryFill * (1 + cfg.takeProfitBps / 10_000);
      const ex = tpl.exit(closes, i, p, entryFill, peak);
      if (sl || tp || ex.fire) {
        const rule = sl ? RULE.STOP_LOSS : tp ? RULE.TAKE_PROFIT : RULE.EXIT;
        const text = sl ? `Close ${px.toFixed(2)} at or under the stop ${(entryFill * (1 - cfg.stopLossBps / 10_000)).toFixed(2)} (−${cfg.stopLossBps / 100} % from the entry fill ${entryFill.toFixed(2)})` : tp ? `Close ${px.toFixed(2)} at or over the target ${(entryFill * (1 + cfg.takeProfitBps / 10_000)).toFixed(2)} (+${cfg.takeProfitBps / 100} %)` : ex.text;
        const bits = checkLimits(cfg.limits, { side: SIDE_SELL, positionAfterBps: 0, dayLossBps, tradesToday: u8(tradesToday), slippageBps: cfg.slippageBps });
        if (bits === 0) {
          const fill = px * (1 - slip);
          const gross = qty * fill;
          const fe = gross * fee;
          cash += gross - fe;
          fees += fe;
          slipCost += qty * (px - fill);
          trades.push({ t: b.t, side: "sell", price: px, fill, qty, value: gross, fee: fe, slip: qty * (px - fill), pnl: gross - fe - entryCost });
          dec = { t: b.t, answer: b.answer, price: px, action: ACTION.SELL, rule, bits: 0, text, positionBps: 0, equity: cash, fill, fee: fe, qty };
          qty = 0;
          tradesToday++;
        } else {
          dec = { t: b.t, answer: b.answer, price: px, action: ACTION.REFUSED, rule, bits, text, positionBps: u16(((qty * px) / eq) * 10_000), equity: eq };
        }
      } else {
        dec = { t: b.t, answer: b.answer, price: px, action: ACTION.HOLD, rule: RULE.NO_EXIT, bits: 0, text: ex.text, positionBps: u16(((qty * px) / eq) * 10_000), equity: eq };
      }
    } else {
      const en = tpl.entry(closes, i, p);
      if (en.fire) {
        const bits = checkLimits(cfg.limits, { side: SIDE_BUY, positionAfterBps: cfg.sizeBps, dayLossBps, tradesToday: u8(tradesToday), slippageBps: cfg.slippageBps });
        if (bits === 0) {
          const spend = (eq * cfg.sizeBps) / 10_000;
          const fill = px * (1 + slip);
          const fe = spend * fee;
          qty = (spend - fe) / fill;
          cash -= spend;
          fees += fe;
          slipCost += qty * (fill - px);
          entryFill = fill;
          entryCost = spend;
          peak = px;
          tradesToday++;
          trades.push({ t: b.t, side: "buy", price: px, fill, qty, value: spend - fe, fee: fe, slip: qty * (fill - px) });
          const eq2 = cash + qty * px;
          dec = { t: b.t, answer: b.answer, price: px, action: ACTION.BUY, rule: RULE.ENTRY, bits: 0, text: en.text, positionBps: u16(((qty * px) / eq2) * 10_000), equity: eq2, fill, fee: fe, qty };
        } else {
          dec = { t: b.t, answer: b.answer, price: px, action: ACTION.REFUSED, rule: RULE.ENTRY, bits, text: en.text, positionBps: 0, equity: eq };
        }
      } else {
        dec = { t: b.t, answer: b.answer, price: px, action: ACTION.WAIT, rule: RULE.NO_ENTRY, bits: 0, text: en.text, positionBps: 0, equity: eq };
      }
    }
    decisions.push(dec);
    curve.push({ t: b.t, equity: cash + qty * px, hold: holdQty * px, price: px });
  }
  return { decisions, trades, curve, metrics: metrics(cfg, decisions, trades, curve, fees, slipCost, qty > 0) };
}

function maxDrawdown(xs: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const x of xs) {
    peak = Math.max(peak, x);
    if (peak > 0) worst = Math.min(worst, x / peak - 1);
  }
  return worst * 100;
}

function metrics(cfg: StrategyConfig, decisions: Decision[], trades: Trade[], curve: Point[], fees: number, slippage: number, open: boolean): Metrics {
  const end = curve.at(-1);
  const endEquity = end ? end.equity : cfg.startCash;
  const holdEnd = end ? end.hold : cfg.startCash;
  const sells = trades.filter((t) => t.side === "sell");
  const refusedBy: Record<string, number> = {};
  for (const d of decisions) {
    if (d.action !== ACTION.REFUSED) continue;
    for (const [k, v] of Object.entries(BITS)) if (d.bits & v) refusedBy[k] = (refusedBy[k] ?? 0) + 1;
  }
  const returnPct = (endEquity / cfg.startCash - 1) * 100;
  const holdReturnPct = curve.length ? (holdEnd / cfg.startCash - 1) * 100 : 0;
  return {
    bars: decisions.length,
    from: decisions[0]?.t ?? null,
    to: decisions.at(-1)?.t ?? null,
    startEquity: cfg.startCash,
    endEquity,
    returnPct,
    holdReturnPct,
    excessPct: returnPct - holdReturnPct,
    maxDrawdownPct: maxDrawdown(curve.map((c) => c.equity)),
    holdMaxDrawdownPct: maxDrawdown(curve.map((c) => c.hold)),
    fees,
    slippage,
    trades: trades.length,
    roundTrips: sells.length,
    winRatePct: sells.length ? (sells.filter((s) => (s.pnl ?? 0) > 0).length / sells.length) * 100 : null,
    exposurePct: decisions.length ? (decisions.filter((d) => d.positionBps > 0).length / decisions.length) * 100 : 0,
    refused: decisions.filter((d) => d.action === ACTION.REFUSED).length,
    refusedBy,
    openPosition: open,
  };
}
