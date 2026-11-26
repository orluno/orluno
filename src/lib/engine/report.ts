/*
 * The evaluation report: the same config run as a backtest (history before the paper start) and as paper trading (bars that
 * closed after the paper start), side by side, with plain notes on where they differ. Nothing here predicts anything: a
 * backtest result is not a future result.
 */
import type { Hex } from "viem";
import type { Bar } from "./bars";
import { configHash, type StrategyConfig } from "./config";
import { simulate, type RunResult } from "./simulate";

export const DAY = 86_400;
export const BACKTEST_DAYS = [14, 30, 60, 120] as const;

export type PaperSession = {
  id: string;
  hash: Hex;
  config: StrategyConfig;
  /** Unix seconds. Only bars that closed after this moment count as paper decisions. */
  startedAt: number;
  label: string;
  house?: boolean;
};

/**
 * The house paper session: Trend cross on ETH with the default settings, frozen in this file on 25 Nov 2026 before 18:00 UTC
 * (the commit that added it predates every bar it decides on). Anyone can recompute it from the same feed rounds.
 */
export const HOUSE_START = 1_795_629_600; // 2026-11-25 18:00:00 UTC

export type Report = {
  hash: Hex;
  config: StrategyConfig;
  backtestDays: number;
  paperStart: number | null;
  backtest: RunResult;
  paper: RunResult | null;
  notes: string[];
  dataEnd: number | null;
};

export function buildReport(cfg: StrategyConfig, bars: Bar[], opts: { backtestDays: number; paperStart: number | null; now: number }): Report {
  const anchor = opts.paperStart ?? opts.now + 1;
  const backtest = simulate(cfg, bars, anchor - opts.backtestDays * DAY, opts.paperStart !== null ? opts.paperStart + 1 : anchor);
  const paper = opts.paperStart !== null ? simulate(cfg, bars, opts.paperStart + 1, Number.MAX_SAFE_INTEGER) : null;
  return { hash: configHash(cfg), config: cfg, backtestDays: opts.backtestDays, paperStart: opts.paperStart, backtest, paper, notes: compare(backtest, paper), dataEnd: bars.at(-1)?.t ?? null };
}

const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)} %`;

/** Deterministic notes on how the two sides differ. Each one is a fact about the two runs, never a forecast. */
export function compare(b: RunResult, p: RunResult | null): string[] {
  const out: string[] = [];
  const bm = b.metrics;
  if (!bm.bars) out.push("The backtest window has no bars for this asset yet (or the averages need more history than the window gives).");
  if (!p) {
    out.push("No paper session yet: start one and every bar that closes after that moment is decided with these exact rules.");
    return out;
  }
  const m = p.metrics;
  if (m.bars === 0) {
    out.push("The paper session has not seen a closed bar yet. The first decision appears after the next hourly close (stock tokens: market-hours bars only).");
    return out;
  }
  if (m.bars < 72) out.push(`Paper has ${m.bars} decision${m.bars === 1 ? "" : "s"} against ${bm.bars} in the backtest: too few to compare results, only the decisions themselves.`);
  if (bm.bars && Math.sign(bm.excessPct) !== Math.sign(m.excessPct) && Math.abs(bm.excessPct - m.excessPct) > 0.5)
    out.push(`Against simply holding, the backtest came out ${pp(bm.excessPct)} and paper ${pp(m.excessPct)}: the backtest result did not carry over to the paper period so far.`);
  if (Math.abs(bm.holdReturnPct - m.holdReturnPct) > 2) out.push(`The asset itself moved ${pp(bm.holdReturnPct)} in the backtest window and ${pp(m.holdReturnPct)} during paper: different markets, so compare each side with its own buy-and-hold line.`);
  const bt = bm.bars ? (bm.trades / bm.bars) * 100 : 0;
  const pt = (m.trades / m.bars) * 100;
  if (bm.bars && m.bars >= 24 && Math.abs(bt - pt) > Math.max(1, bt)) out.push(`Trades per 100 bars: ${bt.toFixed(1)} in the backtest, ${pt.toFixed(1)} on paper.`);
  if (m.refused > 0 || bm.refused > 0) out.push(`Your limits refused ${bm.refused} backtest decision${bm.refused === 1 ? "" : "s"} and ${m.refused} on paper.`);
  if (m.fees + m.slippage > 0 && m.endEquity > 0) out.push(`Paper paid $${(m.fees + m.slippage).toFixed(2)} in simulated fees and slippage; the backtest $${(bm.fees + bm.slippage).toFixed(2)}.`);
  return out;
}
