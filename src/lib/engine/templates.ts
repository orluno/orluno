/*
 * Strategy templates: the no-code blocks of an Orluno report. Each template is deterministic code over hourly bar closes
 * (no model, no randomness): the same config and the same bars always give the same decisions.
 * Every rule says why it fired with the numbers it compared, so each decision in a report can be read and checked.
 */
import type { Bar } from "./bars";

export type TemplateId = "trend" | "breakout" | "dip" | "rsi";
export type ParamSpec = { key: string; label: string; unit: "bars" | "%" | "level"; min: number; max: number; step: number; def: number; help: string };
export type Signal = { fire: boolean; text: string };
export type Template = {
  id: TemplateId;
  name: string;
  short: string;
  entryBlock: string;
  exitBlock: string;
  params: ParamSpec[];
  /** Bars needed before the first decision. */
  warmup: (p: Record<string, number>) => number;
  entry: (closes: number[], i: number, p: Record<string, number>) => Signal;
  exit: (closes: number[], i: number, p: Record<string, number>, entryPrice: number, peak: number) => Signal;
};

export function sma(c: number[], i: number, n: number): number {
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += c[k];
  return s / n;
}
export function highest(c: number[], from: number, to: number): number {
  let h = -Infinity;
  for (let k = from; k <= to; k++) h = Math.max(h, c[k]);
  return h;
}
/** Wilder-free RSI: simple average gain / loss over n bars (keeps the rule easy to recompute by hand). */
export function rsi(c: number[], i: number, n: number): number {
  let up = 0;
  let down = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const d = c[k] - c[k - 1];
    if (d > 0) up += d;
    else down -= d;
  }
  if (down === 0) return up === 0 ? 50 : 100;
  return 100 - 100 / (1 + up / down);
}

const f = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v.toLocaleString("en-US", { maximumFractionDigits: 4 }));
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} %`;

export const TEMPLATES: Template[] = [
  {
    id: "trend",
    name: "Trend cross",
    short: "Buys when a fast average crosses above a slow one, sells on the cross back down.",
    entryBlock: "Fast average crosses above slow average",
    exitBlock: "Fast average crosses below slow average",
    params: [
      { key: "fast", label: "Fast average", unit: "bars", min: 2, max: 100, step: 1, def: 12, help: "Hourly closes in the fast simple moving average." },
      { key: "slow", label: "Slow average", unit: "bars", min: 5, max: 400, step: 1, def: 48, help: "Hourly closes in the slow simple moving average. Must be longer than the fast one." },
    ],
    warmup: (p) => Math.max(p.fast, p.slow) + 1,
    entry: (c, i, p) => {
      const a = sma(c, i, p.fast), b = sma(c, i, p.slow), a0 = sma(c, i - 1, p.fast), b0 = sma(c, i - 1, p.slow);
      const fire = a0 <= b0 && a > b;
      return { fire, text: fire ? `Fast ${p.fast} ${f(a)} crossed above slow ${p.slow} ${f(b)}` : a > b ? `Fast ${f(a)} already above slow ${f(b)}, no fresh cross` : `Fast ${f(a)} below slow ${f(b)}` };
    },
    exit: (c, i, p) => {
      const a = sma(c, i, p.fast), b = sma(c, i, p.slow), a0 = sma(c, i - 1, p.fast), b0 = sma(c, i - 1, p.slow);
      const fire = a0 >= b0 && a < b;
      return { fire, text: fire ? `Fast ${f(a)} crossed below slow ${f(b)}` : `Fast ${f(a)} vs slow ${f(b)}: no cross down` };
    },
  },
  {
    id: "breakout",
    name: "Breakout",
    short: "Buys a close above the highest close of the lookback, exits on a trailing stop from the peak.",
    entryBlock: "Close breaks above the recent high",
    exitBlock: "Trailing stop from the highest close since entry",
    params: [
      { key: "lookback", label: "Lookback", unit: "bars", min: 6, max: 400, step: 1, def: 24, help: "Hourly closes that set the recent high (the current bar excluded)." },
      { key: "trail", label: "Trailing stop", unit: "%", min: 0.5, max: 30, step: 0.5, def: 3, help: "Sell when the close falls this far below the highest close since entry." },
    ],
    warmup: (p) => p.lookback + 1,
    entry: (c, i, p) => {
      const hi = highest(c, i - p.lookback, i - 1);
      const fire = c[i] > hi;
      return { fire, text: fire ? `Close ${f(c[i])} above the ${p.lookback}-bar high ${f(hi)}` : `Close ${f(c[i])} under the ${p.lookback}-bar high ${f(hi)} (${pct((c[i] / hi - 1) * 100)})` };
    },
    exit: (c, i, p, _e, peak) => {
      const stop = peak * (1 - p.trail / 100);
      const fire = c[i] <= stop;
      return { fire, text: fire ? `Close ${f(c[i])} hit the trailing stop ${f(stop)} (${p.trail} % under peak ${f(peak)})` : `Close ${f(c[i])} above the trailing stop ${f(stop)}` };
    },
  },
  {
    id: "dip",
    name: "Dip to average",
    short: "Buys when the close sits a set distance under its average, sells when it gets back to the average.",
    entryBlock: "Close is X % under its moving average",
    exitBlock: "Close is back at or above the average",
    params: [
      { key: "avg", label: "Average", unit: "bars", min: 5, max: 400, step: 1, def: 48, help: "Hourly closes in the moving average." },
      { key: "depth", label: "Dip depth", unit: "%", min: 0.5, max: 30, step: 0.5, def: 3, help: "How far under the average the close must be to buy." },
    ],
    warmup: (p) => p.avg + 1,
    entry: (c, i, p) => {
      const a = sma(c, i, p.avg);
      const gap = (c[i] / a - 1) * 100;
      const fire = gap <= -p.depth;
      return { fire, text: fire ? `Close ${f(c[i])} is ${pct(gap)} vs the ${p.avg}-bar average ${f(a)} (buy at −${p.depth} %)` : `Close ${pct(gap)} vs average ${f(a)}; needs −${p.depth} %` };
    },
    exit: (c, i, p) => {
      const a = sma(c, i, p.avg);
      const fire = c[i] >= a;
      return { fire, text: fire ? `Close ${f(c[i])} back at the average ${f(a)}` : `Close ${f(c[i])} still under the average ${f(a)}` };
    },
  },
  {
    id: "rsi",
    name: "RSI rebound",
    short: "Buys when the RSI drops under a low level, sells when it climbs back over a high level.",
    entryBlock: "RSI under the buy level",
    exitBlock: "RSI over the sell level",
    params: [
      { key: "period", label: "RSI period", unit: "bars", min: 3, max: 100, step: 1, def: 14, help: "Hourly changes in the RSI (simple averages of gains and losses)." },
      { key: "buyBelow", label: "Buy below", unit: "level", min: 5, max: 50, step: 1, def: 30, help: "RSI level that triggers a buy." },
      { key: "sellAbove", label: "Sell above", unit: "level", min: 40, max: 95, step: 1, def: 55, help: "RSI level that triggers a sell." },
    ],
    warmup: (p) => p.period + 2,
    entry: (c, i, p) => {
      const r = rsi(c, i, p.period);
      const fire = r < p.buyBelow;
      return { fire, text: fire ? `RSI(${p.period}) ${r.toFixed(1)} under ${p.buyBelow}` : `RSI(${p.period}) ${r.toFixed(1)}, buy under ${p.buyBelow}` };
    },
    exit: (c, i, p) => {
      const r = rsi(c, i, p.period);
      const fire = r > p.sellAbove;
      return { fire, text: fire ? `RSI(${p.period}) ${r.toFixed(1)} over ${p.sellAbove}` : `RSI(${p.period}) ${r.toFixed(1)}, sell over ${p.sellAbove}` };
    },
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id) ?? null;
export function defaults(t: Template): Record<string, number> {
  return Object.fromEntries(t.params.map((p) => [p.key, p.def]));
}
/** Parameters clamped to their ranges; slow > fast and sell level > buy level are enforced. Returns problems in plain words. */
export function checkParams(t: Template, p: Record<string, number>): string[] {
  const out: string[] = [];
  for (const s of t.params) {
    const v = p[s.key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < s.min || v > s.max) out.push(`${s.label} must be between ${s.min} and ${s.max}.`);
    else if (s.unit === "bars" && !Number.isInteger(v)) out.push(`${s.label} must be a whole number of bars.`);
  }
  if (t.id === "trend" && p.slow <= p.fast) out.push("The slow average must be longer than the fast one.");
  if (t.id === "rsi" && p.sellAbove <= p.buyBelow) out.push("The sell level must be above the buy level.");
  return out;
}
export type { Bar };
