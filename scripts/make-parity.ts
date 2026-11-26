// Writes contracts/test/fixtures/parity-*.hex from the site's engine, so OrlunoParity.t.sol can replay them in Solidity.
//   npx tsx scripts/make-parity.ts
// 1. limit cases: random + edge limits and trades, with the bits risk.ts returns;
// 2. decisions: 400 real decisions of a backtest over the ETH/USD rounds, with the fold root and a linked head.
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { encodeAbiParameters } from "viem";
import { checkLimits, type Limits } from "../src/lib/engine/risk";
import { toBars } from "../src/lib/engine/bars";
import { defaultConfig } from "../src/lib/engine/config";
import { simulate } from "../src/lib/engine/simulate";
import { fold, leafOf, link, reasonsOf, ZERO32 } from "../src/lib/engine/anchor";

const OUT = path.join(process.cwd(), "contracts/test/fixtures");
let seed = 7;
const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
const pick = <T,>(xs: T[]) => xs[rnd(xs.length)];

const cases: { l: Limits; side: number; pos: number; loss: number; trades: number; slip: number; bits: number }[] = [];
for (let i = 0; i < 600; i++) {
  const l: Limits = { maxPositionBps: pick([1, 2_500, 5_000, 9_999, 10_000, 1 + rnd(10_000)]), maxDailyLossBps: pick([1, 300, 10_000, 1 + rnd(10_000)]), maxTradesPerDay: pick([1, 4, 96, 1 + rnd(96)]), maxSlippageBps: pick([0, 50, 1_000, rnd(1_001)]), maxPriceAge: 86_400 };
  const side = pick([0, 1, 2, 3, 1, 2]);
  const pos = pick([0, l.maxPositionBps, l.maxPositionBps + 1, 10_000, 10_001, rnd(65_536)]);
  const loss = pick([0, l.maxDailyLossBps - 1, l.maxDailyLossBps, rnd(65_536)]);
  const trades = pick([0, l.maxTradesPerDay - 1, l.maxTradesPerDay, rnd(256)]);
  const slip = pick([0, l.maxSlippageBps, l.maxSlippageBps + 1, rnd(65_536)]);
  cases.push({ l, side, pos, loss, trades, slip, bits: checkLimits(l, { side, positionAfterBps: pos, dayLossBps: loss, tradesToday: trades, slippageBps: slip }) });
}
const caseHex = encodeAbiParameters(
  [{ type: "tuple[]", components: [{ type: "uint16" }, { type: "uint16" }, { type: "uint8" }, { type: "uint16" }, { type: "uint32" }, { type: "uint8" }, { type: "uint16" }, { type: "uint16" }, { type: "uint8" }, { type: "uint16" }, { type: "uint256" }] }],
  [cases.map((c) => [c.l.maxPositionBps, c.l.maxDailyLossBps, c.l.maxTradesPerDay, c.l.maxSlippageBps, c.l.maxPriceAge, c.side, c.pos, c.loss, c.trades, c.slip, BigInt(c.bits)] as const)],
);
writeFileSync(path.join(OUT, "parity-limits.hex"), caseHex);

const f = JSON.parse(readFileSync(path.join(process.cwd(), "src/data/rounds/ETH.json"), "utf8"));
const bars = toBars(f.rounds, "crypto", f.takenAt);
const run = simulate({ ...defaultConfig("rsi"), limits: { ...defaultConfig().limits, maxTradesPerDay: 2 } }, bars, f.takenAt - 30 * 86_400, f.takenAt);
const ds = run.decisions.slice(0, 400);
const root = fold(ds.map(leafOf));
const head = link(ZERO32, root, ds[0].t, ds.at(-1)!.t, ds.length, ds.filter((d) => d.action === 2 || d.action === 3).length);
const decHex = encodeAbiParameters(
  [{ type: "tuple[]", components: [{ type: "uint64" }, { type: "uint256" }, { type: "uint8" }, { type: "uint256" }, { type: "uint16" }] }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint64" }, { type: "uint64" }, { type: "uint32" }, { type: "uint32" }],
  [ds.map((d) => [BigInt(d.t), BigInt(d.answer), d.action, reasonsOf(d), d.positionBps] as const), root, head, BigInt(ds[0].t), BigInt(ds.at(-1)!.t), ds.length, ds.filter((d) => d.action === 2 || d.action === 3).length],
);
writeFileSync(path.join(OUT, "parity-decisions.hex"), decHex);
console.log(`limit cases ${cases.length} (${cases.filter((c) => c.bits).length} with bits), decisions ${ds.length}, trades ${run.trades.length}, refused ${run.metrics.refused}, root ${root}`);
