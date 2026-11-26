import "server-only";
import { decodeEventLog, getAddress, pad, toHex } from "viem";
import { CONTRACTS, registryLive } from "@/config/contracts";
import { REGISTRY_ABI } from "@/lib/abi";
import { headBlock, logReader, reads, type RawLog, type Read } from "@/lib/server/chainread";
import { scanBack } from "@/lib/logscan";

/*
 * Configs of one owner (or one config by id) read from OrlunoLimitRegistry views, with their history from the registry's logs:
 * registered, limits changed (now or from the 24 h queue), loosening queued / cancelled, retired, batches anchored. checkTrade
 * itself is a view: refusals leave no log, the report records them in the browser.
 */

const MAX_CONFIGS = 20;

export type LimitsView = { maxPositionBps: number; maxDailyLossBps: number; maxTradesPerDay: number; maxSlippageBps: number; maxPriceAge: number };
export type ConfigView = {
  id: number;
  owner: string;
  asset: string;
  feed: string;
  createdAt: number;
  version: number;
  retired: boolean;
  configHash: string;
  limits: LimitsView;
  effective: LimitsView;
  pending: { at: number; hash: string; limits: LimitsView } | null;
  head: string;
  lastTo: number;
  batches: number;
  decisions: number;
  trades: number;
};
export type RegistryEvent = { name: string; id: number; block: number; tx: string; logIndex: number; args: Record<string, unknown> };
export type RegistryActivity = {
  deployed: boolean;
  registry: string;
  head: number | null;
  configs: ConfigView[];
  events: RegistryEvent[];
  scanned: { fromBlock: number; toBlock: number; gaps: [number, number][]; complete: boolean } | null;
};

const r = (fn: string, args: readonly unknown[] = []): Read => ({ to: CONTRACTS.registry, abi: REGISTRY_ABI, fn, args });
function ok<T>(a: { kind: string; value?: unknown }): T {
  if (a.kind !== "ok") throw new Error("A registry read failed.");
  return a.value as T;
}
const lim = (l: Record<string, unknown>): LimitsView => ({
  maxPositionBps: Number(l.maxPositionBps),
  maxDailyLossBps: Number(l.maxDailyLossBps),
  maxTradesPerDay: Number(l.maxTradesPerDay),
  maxSlippageBps: Number(l.maxSlippageBps),
  maxPriceAge: Number(l.maxPriceAge),
});
const plain = (v: unknown): unknown => (typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);

export async function readRegistry(q: { owner?: string; id?: number }): Promise<RegistryActivity> {
  if (!registryLive()) return { deployed: false, registry: CONTRACTS.registry, head: null, configs: [], events: [], scanned: null };
  const head = await headBlock();
  let ids: number[];
  if (q.id !== undefined) ids = [q.id];
  else {
    const [a] = await reads([r("configsOf", [getAddress(q.owner!)])]);
    ids = ok<bigint[]>(a).slice(-MAX_CONFIGS).map(Number);
  }
  const configs: ConfigView[] = [];
  for (let i = 0; i < ids.length; i += 8) {
    const part = ids.slice(i, i + 8);
    const got = await reads(part.flatMap((id) => [r("getConfig", [BigInt(id)]), r("effectiveLimits", [BigInt(id)])]));
    part.forEach((id, k) => {
      if (got[2 * k].kind !== "ok") return; // unknown id
      const c = ok<Record<string, unknown>>(got[2 * k]);
      const e = ok<Record<string, unknown>>(got[2 * k + 1]);
      configs.push({
        id,
        owner: String(c.owner).toLowerCase(),
        asset: String(c.asset).toLowerCase(),
        feed: String(c.feed).toLowerCase(),
        createdAt: Number(c.createdAt),
        version: Number(c.version),
        retired: Boolean(c.retired),
        configHash: String(c.configHash),
        limits: lim(c.limits as Record<string, unknown>),
        effective: lim(e),
        pending: c.hasPending ? { at: Number(c.pendingAt), hash: String(c.pendingHash), limits: lim(c.pending as Record<string, unknown>) } : null,
        head: String(c.head),
        lastTo: Number(c.lastTo),
        batches: Number(c.batches),
        decisions: Number(c.decisions),
        trades: Number(c.trades),
      });
    });
  }
  const list = configs.map((c) => c.id);
  if (!list.length) return { deployed: true, registry: CONTRACTS.registry, head, configs, events: [], scanned: { fromBlock: CONTRACTS.block, toBlock: head, gaps: [], complete: true } };
  // Every registry event carries the config id in topic 1.
  const from = Math.max(0, CONTRACTS.block);
  const scan = await scanBack<RawLog>(logReader({ address: CONTRACTS.registry, topics: [null, list.map((id) => pad(toHex(id), { size: 32 }))] }), from, head, { maxCalls: 16 });
  const seen = new Set<string>();
  const events: RegistryEvent[] = [];
  for (const l of scan.logs) {
    if ((l as RawLog & { removed?: boolean }).removed) continue;
    const key = `${l.transactionHash}:${l.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const d = decodeEventLog({ abi: REGISTRY_ABI, data: l.data as `0x${string}`, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] });
      const args = plain(d.args ?? {}) as Record<string, unknown>;
      const id = Number(args.id ?? -1);
      if (!list.includes(id)) continue;
      events.push({ name: String(d.eventName), id, block: Number(BigInt(l.blockNumber)), tx: l.transactionHash, logIndex: Number(BigInt(l.logIndex)), args });
    } catch {
      // not a registry event
    }
  }
  events.sort((x, y) => y.block - x.block || y.logIndex - x.logIndex);
  return { deployed: true, registry: CONTRACTS.registry, head, configs, events: events.slice(0, 300), scanned: { fromBlock: from, toBlock: head, gaps: scan.gaps, complete: scan.gaps.length === 0 } };
}
