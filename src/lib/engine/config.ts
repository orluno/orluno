/*
 * One strategy config = everything a report needs to run the same rules twice. Its hash (keccak256 of the canonical JSON below)
 * is what OrlunoLimitRegistry stores, so a saved report, a paper session and an on-chain config can be matched exactly.
 */
import { keccak256, toBytes } from "viem";
import { type Limits, validLimits } from "./risk";
import { checkParams, defaults, templateById, type TemplateId, TEMPLATES } from "./templates";
import { MARKET_IDS } from "@/config/markets";

export type StrategyConfig = {
  v: 1;
  template: TemplateId;
  params: Record<string, number>;
  asset: string;
  /** Share of equity each buy uses, basis points. */
  sizeBps: number;
  /** 0 = off. Sell when the close is this far under the entry fill. */
  stopLossBps: number;
  /** 0 = off. Sell when the close is this far over the entry fill. */
  takeProfitBps: number;
  /** Fee per fill (each buy and each sell), basis points of the traded value. */
  feeBps: number;
  /** Slippage assumed per fill: buys fill this much above the close, sells this much below. */
  slippageBps: number;
  limits: Limits;
  /** Paper money each run starts with, in USD. */
  startCash: number;
};

export const DEFAULT_LIMITS: Limits = { maxPositionBps: 8_000, maxDailyLossBps: 300, maxTradesPerDay: 6, maxSlippageBps: 50, maxPriceAge: 86_400 };

export function defaultConfig(template: TemplateId = "trend", asset = "ETH"): StrategyConfig {
  const t = templateById(template) ?? TEMPLATES[0];
  return { v: 1, template: t.id, params: defaults(t), asset, sizeBps: 5_000, stopLossBps: 500, takeProfitBps: 0, feeBps: 30, slippageBps: 10, limits: { ...DEFAULT_LIMITS }, startCash: 10_000 };
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]));
  return v;
}
export const canonical = (c: StrategyConfig) => JSON.stringify(sortDeep(c));
export const configHash = (c: StrategyConfig) => keccak256(toBytes(canonical(c)));

/** Problems in plain words; empty when the config can run. */
export function checkConfig(c: StrategyConfig): string[] {
  const out: string[] = [];
  const t = templateById(c.template);
  if (!t) return ["Unknown strategy template."];
  out.push(...checkParams(t, c.params));
  if (!MARKET_IDS.includes(c.asset)) out.push("Unknown asset.");
  const int = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!int(c.sizeBps, 100, 10_000)) out.push("Position size must be between 1 % and 100 % of equity.");
  if (!int(c.stopLossBps, 0, 5_000)) out.push("Stop loss must be between 0 (off) and 50 %.");
  if (!int(c.takeProfitBps, 0, 10_000)) out.push("Take profit must be between 0 (off) and 100 %.");
  if (!int(c.feeBps, 0, 500)) out.push("Fee must be between 0 and 5 % per fill.");
  if (!int(c.slippageBps, 0, 1_000)) out.push("Slippage must be between 0 and 10 % per fill.");
  if (!validLimits(c.limits)) out.push("A risk limit is out of range (position 0.01–100 %, daily loss 0.01–100 %, 1–96 trades a day, slippage ≤ 10 %, price age 1 min–7 days).");
  if (!(c.startCash >= 100 && c.startCash <= 10_000_000)) out.push("Paper money must be between $100 and $10,000,000.");
  return out;
}

/** Reads a config from untrusted JSON (saved reports, imports, URLs): unknown keys dropped, numbers coerced, then checked. */
export function parseConfig(raw: unknown): StrategyConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const t = templateById(String(r.template));
  if (!t) return null;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  const base = defaultConfig(t.id, typeof r.asset === "string" ? r.asset : "ETH");
  const p = (r.params ?? {}) as Record<string, unknown>;
  const l = (r.limits ?? {}) as Record<string, unknown>;
  const c: StrategyConfig = {
    v: 1,
    template: t.id,
    params: Object.fromEntries(t.params.map((s) => [s.key, num(p[s.key], s.def)])),
    asset: base.asset,
    sizeBps: num(r.sizeBps, base.sizeBps),
    stopLossBps: num(r.stopLossBps, base.stopLossBps),
    takeProfitBps: num(r.takeProfitBps, base.takeProfitBps),
    feeBps: num(r.feeBps, base.feeBps),
    slippageBps: num(r.slippageBps, base.slippageBps),
    limits: {
      maxPositionBps: num(l.maxPositionBps, base.limits.maxPositionBps),
      maxDailyLossBps: num(l.maxDailyLossBps, base.limits.maxDailyLossBps),
      maxTradesPerDay: num(l.maxTradesPerDay, base.limits.maxTradesPerDay),
      maxSlippageBps: num(l.maxSlippageBps, base.limits.maxSlippageBps),
      maxPriceAge: num(l.maxPriceAge, base.limits.maxPriceAge),
    },
    startCash: num(r.startCash, base.startCash),
  };
  return checkConfig(c).length ? null : c;
}
