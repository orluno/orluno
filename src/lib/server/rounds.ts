import "server-only";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { MARKETS, marketById, type Market } from "@/config/markets";
import { FEED_ABI } from "@/lib/abi";
import { multicall } from "@/lib/server/chainread";
import { toBars, type Bar, type Round } from "@/lib/engine/bars";
import ETH from "@/data/rounds/ETH.json";
import NVDA from "@/data/rounds/NVDA.json";
import TSLA from "@/data/rounds/TSLA.json";
import AAPL from "@/data/rounds/AAPL.json";
import MSFT from "@/data/rounds/MSFT.json";
import AMZN from "@/data/rounds/AMZN.json";
import META from "@/data/rounds/META.json";
import SPY from "@/data/rounds/SPY.json";
import QQQ from "@/data/rounds/QQQ.json";

/*
 * Round history per market: the committed snapshot (scripts/snapshot-rounds.mjs, every round of the feed's current phase read on
 * chain) plus the rounds published since, read live with getRoundData through Multicall3. Rules:
 *   - at most 600 new rounds per refresh, newest snapshot first; the rest follows on the next refresh;
 *   - a refresh that fails is never cached (the last complete answer is served, with its read time);
 *   - a phase change (the feed proxy moved to a new aggregator) stops the top-up and the page says so, instead of mixing phases;
 *   - one refresh per market at a time, at most once a minute.
 */

type Snap = { asset: string; feed: string; phase: number; block: number; takenAt: number; rounds: Round[] };
const SNAPSHOTS: Record<string, Snap> = { ETH, NVDA, TSLA, AAPL, MSFT, AMZN, META, SPY, QQQ } as unknown as Record<string, Snap>;

export type History = {
  asset: string;
  feed: string;
  phase: number;
  snapshot: { block: number; takenAt: number; rounds: number; lastRound: number };
  live: { rounds: number; lastRound: number | null; readAt: number | null; phaseChanged: boolean; complete: boolean };
  latest: { round: number; answer: string; updatedAt: number } | null;
  bars: [number, string, number][]; // [bar close time, answer, round]
};

const TTL = 60_000;
const MAX_NEW = 600;
const state = new Map<string, { at: number; extra: Round[]; phaseChanged: boolean; complete: boolean; readAt: number }>();
const inflight = new Map<string, Promise<void>>();

const SEL_LATEST = encodeFunctionData({ abi: FEED_ABI, functionName: "latestRoundData" });
const SEL_PHASE = encodeFunctionData({ abi: FEED_ABI, functionName: "phaseId" });

async function topUp(m: Market, snap: Snap) {
  const prev = state.get(m.id);
  const known = prev?.extra.at(-1)?.[0] ?? snap.rounds.at(-1)?.[0] ?? 0;
  const head = await multicall([
    { to: m.feed, data: SEL_PHASE },
    { to: m.feed, data: SEL_LATEST },
  ]);
  if (!head[0] || !head[1]) throw new Error("feed unreadable");
  const phase = Number(decodeFunctionResult({ abi: FEED_ABI, functionName: "phaseId", data: head[0] as `0x${string}` }));
  if (phase !== snap.phase) {
    state.set(m.id, { at: Date.now(), extra: prev?.extra ?? [], phaseChanged: true, complete: false, readAt: Date.now() });
    return;
  }
  const latest = decodeFunctionResult({ abi: FEED_ABI, functionName: "latestRoundData", data: head[1] as `0x${string}` }) as readonly [bigint, bigint, bigint, bigint, bigint];
  const base = BigInt(phase) << 64n;
  const last = Number(latest[0] - base);
  const want: number[] = [];
  for (let n = known + 1; n <= last && want.length < MAX_NEW; n++) want.push(n);
  const raw = await multicall(want.map((n) => ({ to: m.feed, data: encodeFunctionData({ abi: FEED_ABI, functionName: "getRoundData", args: [base + BigInt(n)] }) })), 100);
  const got: Round[] = [];
  for (let k = 0; k < want.length; k++) {
    const r = raw[k];
    if (!r) break; // stop at the first unread round so no gap is ever skipped silently
    const d = decodeFunctionResult({ abi: FEED_ABI, functionName: "getRoundData", data: r as `0x${string}` }) as readonly [bigint, bigint, bigint, bigint, bigint];
    if (d[3] === 0n || d[1] <= 0n) break;
    got.push([want[k], d[1].toString(), Number(d[3])]);
  }
  if (want.length && !got.length) throw new Error("no new round could be read");
  const extra = [...(prev?.extra ?? []), ...got];
  const done = (extra.at(-1)?.[0] ?? known) >= last;
  state.set(m.id, { at: Date.now(), extra, phaseChanged: false, complete: done, readAt: Date.now() });
}

async function refresh(m: Market, snap: Snap) {
  const s = state.get(m.id);
  if (s && Date.now() - s.at < TTL && s.complete) return;
  if (s && Date.now() - s.at < 10_000) return;
  let p = inflight.get(m.id);
  if (!p) {
    p = topUp(m, snap)
      .catch(() => {})
      .finally(() => inflight.delete(m.id));
    inflight.set(m.id, p);
  }
  await p;
}

export async function history(id: string, now = Math.floor(Date.now() / 1000)): Promise<History | null> {
  const m = marketById(id);
  const snap = m ? SNAPSHOTS[m.id] : null;
  if (!m || !snap) return null;
  await refresh(m, snap);
  const s = state.get(m.id);
  const all = [...snap.rounds, ...(s?.extra ?? [])];
  const bars: Bar[] = toBars(all, m.kind, now);
  const lr = all.at(-1);
  return {
    asset: m.id,
    feed: m.feed,
    phase: snap.phase,
    snapshot: { block: snap.block, takenAt: snap.takenAt, rounds: snap.rounds.length, lastRound: snap.rounds.at(-1)?.[0] ?? 0 },
    live: { rounds: s?.extra.length ?? 0, lastRound: s?.extra.at(-1)?.[0] ?? null, readAt: s?.readAt ?? null, phaseChanged: s?.phaseChanged ?? false, complete: s?.complete ?? false },
    latest: lr ? { round: lr[0], answer: lr[1], updatedAt: lr[2] } : null,
    bars: bars.map((b) => [b.t, b.answer, b.round]),
  };
}

/** Latest answer of every market (from the same cache), for the home page and the asset picker. */
export async function latestAll() {
  const out = await Promise.all(MARKETS.map((m) => history(m.id)));
  return out.map((h, i) => {
    const m = MARKETS[i];
    return { id: m.id, label: m.label, kind: m.kind, hours: m.hours, feed: m.feed, token: m.token, latest: h?.latest ?? null, bars: h?.bars.length ?? 0, firstBar: h?.bars[0]?.[0] ?? null, live: h?.live ?? null };
  });
}
