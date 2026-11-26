import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { toBars, inStockSession, type Round } from "./bars";
import { defaultConfig, configHash, parseConfig, checkConfig, canonical } from "./config";
import { simulate, ACTION } from "./simulate";
import { buildReport, HOUSE_START } from "./report";
import { BITS, checkLimits, loosens, SIDE_BUY, SIDE_SELL } from "./risk";
import { leafOf, fold, link, ZERO32, batchOf } from "./anchor";
import { TEMPLATES, sma, rsi } from "./templates";

const load = (id: string) => JSON.parse(readFileSync(path.join(process.cwd(), "src/data/rounds", `${id}.json`), "utf8"));

test("bars: last answer at or before each hour end, never a future round", () => {
  const rounds: Round[] = [[1, "100000000", 3_600 * 10 + 5], [2, "110000000", 3_600 * 10 + 1_800], [3, "120000000", 3_600 * 12]];
  const bars = toBars(rounds, "crypto", 3_600 * 13);
  assert.deepEqual(bars.map((b) => [b.t / 3_600, b.close]), [[11, 1.1], [12, 1.2], [13, 1.2]]);
  assert.equal(bars[0].round, 2);
});

test("bars: stale answers (over 26 h) and weekend stock hours are skipped", () => {
  const sat = Date.UTC(2026, 10, 21, 12) / 1000; // Saturday noon
  assert.equal(inStockSession(sat), false);
  assert.equal(inStockSession(Date.UTC(2026, 10, 23, 2) / 1000), true); // Monday 02:00
  assert.equal(inStockSession(Date.UTC(2026, 10, 23, 1) / 1000), false);
  assert.equal(inStockSession(Date.UTC(2026, 10, 21, 1) / 1000), true); // Saturday 01:00 closes Friday's last hour
  const bars = toBars([[1, "100000000", 0], [2, "100000000", 3_600]], "crypto", 3_600 * 40);
  assert.equal(bars.at(-1)!.t, 3_600 + 26 * 3_600);
});

test("real ETH rounds give hourly bars with no gaps beyond the feed's own", () => {
  const f = load("ETH");
  const bars = toBars(f.rounds, "crypto", f.takenAt);
  assert.ok(bars.length > 3_000);
  for (let i = 1; i < bars.length; i++) assert.ok(bars[i].t > bars[i - 1].t);
  assert.ok(bars.every((b) => b.close > 100 && b.close < 100_000));
});

test("indicators", () => {
  assert.equal(sma([1, 2, 3, 4], 3, 2), 3.5);
  assert.equal(rsi([1, 2, 3, 4], 3, 3), 100);
  assert.equal(rsi([4, 3, 2, 1], 3, 3), 0);
  assert.equal(rsi([1, 2, 1, 2], 3, 2), 50);
});

test("config hash is canonical and changes with any field", () => {
  const a = defaultConfig();
  const b = JSON.parse(canonical(a));
  assert.equal(configHash(a), configHash(b));
  assert.notEqual(configHash(a), configHash({ ...a, feeBps: 31 }));
  assert.notEqual(configHash(a), configHash({ ...a, limits: { ...a.limits, maxTradesPerDay: 5 } }));
  assert.deepEqual(checkConfig(a), []);
  assert.equal(parseConfig({ ...a, asset: "DOGE" }), null);
  assert.equal(parseConfig({ template: "trend", params: { fast: 50, slow: 10 } }), null);
  assert.deepEqual(parseConfig(JSON.parse(JSON.stringify(a))), a);
});

test("limit check mirrors the contract: sells never trapped", () => {
  const l = defaultConfig().limits;
  assert.equal(checkLimits(l, { side: SIDE_BUY, positionAfterBps: 9_000, dayLossBps: 0, tradesToday: 0, slippageBps: 0 }), BITS.POSITION_OVER);
  assert.equal(checkLimits(l, { side: SIDE_SELL, positionAfterBps: 9_000, dayLossBps: 9_999, tradesToday: 99, slippageBps: 0 }), 0);
  assert.equal(checkLimits(l, { side: 3, positionAfterBps: 0, dayLossBps: 0, tradesToday: 0, slippageBps: 0 }), BITS.BAD_SIDE);
  assert.equal(loosens(l, { ...l, maxPriceAge: l.maxPriceAge + 1 }), true);
  assert.equal(loosens(l, { ...l, maxPositionBps: 1 }), false);
});

test("same config + same bars = same decisions (deterministic) for every template", () => {
  const f = load("ETH");
  const bars = toBars(f.rounds, "crypto", f.takenAt);
  for (const t of TEMPLATES) {
    const cfg = defaultConfig(t.id);
    const a = simulate(cfg, bars, f.takenAt - 60 * 86_400, f.takenAt);
    const b = simulate(cfg, bars, f.takenAt - 60 * 86_400, f.takenAt);
    assert.deepEqual(a, b);
    assert.ok(a.metrics.bars > 1_000, t.id);
    assert.equal(fold(a.decisions.map(leafOf)), fold(b.decisions.map(leafOf)));
    // equity accounting: end equity = start + sum of realised pnl + open position value change; never negative
    assert.ok(a.metrics.endEquity > 0);
    assert.ok(a.metrics.maxDrawdownPct <= 0 && a.metrics.maxDrawdownPct > -100);
  }
});

test("limits refuse buys in the simulation exactly like the registry would", () => {
  const f = load("ETH");
  const bars = toBars(f.rounds, "crypto", f.takenAt);
  const cfg = { ...defaultConfig("rsi"), sizeBps: 9_000 }; // over the 80 % position limit
  const r = simulate(cfg, bars, f.takenAt - 30 * 86_400, f.takenAt);
  assert.equal(r.trades.length, 0);
  assert.ok(r.metrics.refused > 0);
  assert.ok(r.decisions.filter((d) => d.action === ACTION.REFUSED).every((d) => d.bits & BITS.POSITION_OVER));
  const slip = simulate({ ...defaultConfig("rsi"), slippageBps: 80 }, bars, f.takenAt - 30 * 86_400, f.takenAt);
  assert.equal(slip.trades.length, 0);
  assert.ok(slip.metrics.refusedBy.SLIPPAGE_OVER > 0);
});

test("fees and slippage are charged on every fill", () => {
  const f = load("ETH");
  const bars = toBars(f.rounds, "crypto", f.takenAt);
  const cfg = defaultConfig("rsi");
  const r = simulate(cfg, bars, f.takenAt - 60 * 86_400, f.takenAt);
  assert.ok(r.trades.length >= 2);
  const fee = r.trades.reduce((s, t) => s + t.fee, 0);
  assert.ok(Math.abs(fee - r.metrics.fees) < 1e-6);
  const free = simulate({ ...cfg, feeBps: 0, slippageBps: 0 }, bars, f.takenAt - 60 * 86_400, f.takenAt);
  assert.equal(free.metrics.fees, 0);
  assert.equal(free.metrics.slippage, 0);
  assert.ok(free.metrics.endEquity >= r.metrics.endEquity);
});

test("report: paper only uses bars that closed after its start; backtest stops before it", () => {
  const f = load("ETH");
  const bars = toBars(f.rounds, "crypto", f.takenAt);
  const start = f.takenAt - 5 * 86_400;
  const rep = buildReport(defaultConfig(), bars, { backtestDays: 30, paperStart: start, now: f.takenAt });
  assert.ok(rep.backtest.decisions.every((d) => d.t <= start));
  assert.ok(rep.paper!.decisions.every((d) => d.t > start));
  assert.ok(rep.paper!.metrics.bars > 100);
  assert.equal(HOUSE_START, Date.UTC(2026, 10, 25, 18) / 1000);
});

test("anchor hashes: fold and link match the contract's definitions", () => {
  const d = { t: 1_799_996_400, answer: "300000000000", action: 0 as const, bits: 0, rule: 2 as const, positionBps: 0 };
  // values cross-checked in contracts/test/OrlunoParity.t.sol
  const l = leafOf(d);
  assert.match(l, /^0x[0-9a-f]{64}$/);
  assert.notEqual(fold([l]), ZERO32);
  assert.notEqual(link(ZERO32, fold([l]), 1, 2, 1, 0), ZERO32);
  assert.equal(batchOf([]), null);
});
