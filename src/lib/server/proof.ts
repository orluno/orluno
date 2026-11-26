import "server-only";
import { keccak256 } from "viem";
import { MARKETS } from "@/config/markets";
import { BEACON_SLOT, STOCK_BEACON, STOCK_PROXY_CODEHASH } from "@/config/dex";
import { rpcBatchAnswers } from "@/lib/feeds/rpc";
import TOKENS from "@/lib/fixtures/stock-tokens.json";

/*
 * Identity proof of every market token, read live. A stock token counts as proven only when ALL hold:
 * it is in the vetted list, its runtime code hash is the Robinhood stock-token proxy's, its ERC-1967 beacon slot holds the
 * Robinhood beacon, and totalSupply() > 0. WETH: symbol() "WETH" and a minted supply. A failed read is "Not known", never a pass.
 * Code and slot are cached for the process (a beacon proxy cannot change either); supply for a minute. Failures are not cached.
 */

export type Proof = {
  id: string;
  token: string;
  inList: boolean;
  codeHash: boolean | null;
  beacon: boolean | null;
  supply: string | null;
  proven: boolean;
  method: string;
};

const LIST = new Set((TOKENS.tokens as { a: string; proven: boolean }[]).filter((t) => t.proven).map((t) => t.a.toLowerCase()));
const fixed = new Map<string, { code: boolean; slot: boolean }>();
let cache: { at: number; value: Proof[] } | null = null;
let inflight: Promise<Proof[]> | null = null;

async function readAll(): Promise<Proof[]> {
  const stocks = MARKETS.filter((m) => m.kind === "stock");
  const todo = stocks.filter((m) => !fixed.has(m.token));
  if (todo.length) {
    const ans = await rpcBatchAnswers(todo.flatMap((m) => [{ method: "eth_getCode", params: [m.token, "latest"] }, { method: "eth_getStorageAt", params: [m.token, BEACON_SLOT, "latest"] }]));
    todo.forEach((m, k) => {
      const code = ans[2 * k];
      const slot = ans[2 * k + 1];
      if (code.kind !== "ok" || slot.kind !== "ok") return;
      const c = typeof code.result === "string" && code.result.length > 2 && keccak256(code.result as `0x${string}`) === STOCK_PROXY_CODEHASH;
      const s = typeof slot.result === "string" && /^0x[0-9a-f]+$/i.test(slot.result) && BigInt(slot.result) === BigInt(STOCK_BEACON);
      fixed.set(m.token, { code: c, slot: s });
    });
  }
  const sup = await rpcBatchAnswers([
    ...MARKETS.map((m) => ({ method: "eth_call", params: [{ to: m.token, data: "0x18160ddd" }, "latest"] })),
    { method: "eth_call", params: [{ to: MARKETS[0].token, data: "0x95d89b41" }, "latest"] },
  ]);
  const supplyOf = (k: number) => {
    const a = sup[k];
    return a.kind === "ok" && typeof a.result === "string" && a.result.length >= 66 ? BigInt(a.result.slice(0, 66)).toString() : null;
  };
  const wethSym = sup[MARKETS.length];
  const isWeth = wethSym.kind === "ok" && typeof wethSym.result === "string" && wethSym.result.toLowerCase().includes("57455448"); // "WETH"
  return MARKETS.map((m, k) => {
    const supply = supplyOf(k);
    if (m.kind === "crypto") {
      return { id: m.id, token: m.token, inList: true, codeHash: null, beacon: null, supply, proven: isWeth && supply !== null && supply !== "0", method: "symbol() WETH + minted supply" };
    }
    const f = fixed.get(m.token) ?? null;
    const inList = LIST.has(m.token.toLowerCase());
    return { id: m.id, token: m.token, inList, codeHash: f?.code ?? null, beacon: f?.slot ?? null, supply, proven: inList && f?.code === true && f?.slot === true && supply !== null && supply !== "0", method: "vetted list + proxy code hash + beacon slot + minted supply" };
  });
}

export async function proofs(): Promise<{ proofs: Proof[]; readAt: number } | null> {
  if (cache && Date.now() - cache.at < 60_000) return { proofs: cache.value, readAt: cache.at };
  inflight ??= readAll().finally(() => {
    inflight = null;
  });
  try {
    const value = await inflight;
    // Cache only an answer where every supply was read; otherwise serve it once without caching.
    if (value.every((p) => p.supply !== null)) cache = { at: Date.now(), value };
    return { proofs: value, readAt: Date.now() };
  } catch {
    return cache ? { proofs: cache.value, readAt: cache.at } : null;
  }
}
