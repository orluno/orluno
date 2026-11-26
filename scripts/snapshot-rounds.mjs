// Takes the Chainlink round history of every Orluno market from Robinhood Chain and writes src/data/rounds/<ID>.json.
//   RPC_URL=<robinhood chain rpc> npm run rounds          (from this Mac: the DoH relay of ../referensi/start.sh, port 6782)
// Every round 1..latest of the current phase is read with getRoundData through Multicall3 (aggregate3, failures allowed).
// The feed's description() must match src/config/markets.ts and decimals() must be 8, or the market is refused.
// Rounds that do not answer (updatedAt 0) are counted, never invented.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbi } from "viem";

const RPC = process.env.RPC_URL || "http://127.0.0.1:6782";
const MC3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "src/config/markets.ts"), "utf8");
const markets = [...src.matchAll(/\{ id: "([A-Z]+)".*?feed: "(0x[0-9a-f]{40})", feedDescription: "([^"]+)"/g)].map((m) => ({ id: m[1], feed: m[2], desc: m[3] }));
const only = process.argv.slice(2);
const client = createPublicClient({ transport: http(RPC, { timeout: 60_000, retryCount: 6 }) });
const FEED = parseAbi([
  "function phaseId() view returns (uint16)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function getRoundData(uint80) view returns (uint80,int256,uint256,uint256,uint80)",
  "function description() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const block = Number(await client.getBlockNumber());
for (const m of markets) {
  if (only.length && !only.includes(m.id)) continue;
  const [desc, dec, phase, latest] = await Promise.all(["description", "decimals", "phaseId", "latestRoundData"].map((fn) => client.readContract({ address: m.feed, abi: FEED, functionName: fn, blockNumber: BigInt(block) })));
  if (desc !== m.desc || Number(dec) !== 8) { console.log(`${m.id}: REFUSED (description "${desc}", decimals ${dec})`); continue; }
  const base = BigInt(phase) << 64n;
  const last = Number(latest[0] - base);
  const out = [];
  let unreadable = 0;
  for (let from = 1; from <= last; from += 250) {
    const ids = []; for (let n = from; n <= Math.min(last, from + 249); n++) ids.push(n);
    const res = await client.multicall({ multicallAddress: MC3, allowFailure: true, blockNumber: BigInt(block), contracts: ids.map((n) => ({ address: m.feed, abi: FEED, functionName: "getRoundData", args: [base + BigInt(n)] })) });
    res.forEach((r, k) => {
      if (r.status !== "success" || r.result[3] === 0n || r.result[1] <= 0n) { unreadable++; return; }
      out.push([ids[k], r.result[1].toString(), Number(r.result[3])]);
    });
  }
  out.sort((a, b) => a[0] - b[0]);
  const file = { asset: m.id, feed: m.feed, description: desc, decimals: 8, phase: Number(phase), block, takenAt: Math.floor(Date.now() / 1000), unreadable, rounds: out };
  fs.writeFileSync(path.join(ROOT, "src/data/rounds", `${m.id}.json`), JSON.stringify(file));
  const first = out[0], end = out.at(-1);
  console.log(`${m.id}: ${out.length} rounds (phase ${phase}, ${unreadable} unreadable) ${new Date(first[2] * 1000).toISOString().slice(0, 10)} → ${new Date(end[2] * 1000).toISOString()}`);
}
console.log(`block ${block}`);
