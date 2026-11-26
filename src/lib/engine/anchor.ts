/*
 * Decision hashes exactly as OrlunoRiskMath.leaf / fold / link compute them, so a batch of paper decisions anchored on chain can
 * be re-checked by anyone holding the list (the registry also exposes decisionLeaf, foldLeaves and linkHead as views).
 */
import { encodeAbiParameters, encodePacked, keccak256, type Hex } from "viem";
import type { Decision } from "./simulate";

export const ZERO32 = `0x${"0".repeat(64)}` as Hex;

/** reasons = limit bits | rule << 16 (rule codes from simulate.ts). */
export const reasonsOf = (d: Pick<Decision, "bits" | "rule">) => BigInt(d.bits) | (BigInt(d.rule) << 16n);

export function leafOf(d: Pick<Decision, "t" | "answer" | "action" | "bits" | "rule" | "positionBps">): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint64" }, { type: "uint256" }, { type: "uint8" }, { type: "uint256" }, { type: "uint16" }],
      [BigInt(d.t), BigInt(d.answer), d.action, reasonsOf(d), d.positionBps],
    ),
  );
}

export function fold(leaves: Hex[]): Hex {
  let root = ZERO32;
  for (const l of leaves) root = keccak256(encodePacked(["bytes32", "bytes32"], [root, l]));
  return root;
}

export function link(head: Hex, root: Hex, fromTs: number, toTs: number, decisions: number, trades: number): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint64" }, { type: "uint64" }, { type: "uint32" }, { type: "uint32" }],
      [head, root, BigInt(fromTs), BigInt(toTs), decisions, trades],
    ),
  );
}

export type Batch = { fromTs: number; toTs: number; decisions: number; trades: number; root: Hex };
export function batchOf(ds: Decision[]): Batch | null {
  if (!ds.length) return null;
  return { fromTs: ds[0].t, toTs: ds.at(-1)!.t, decisions: ds.length, trades: ds.filter((d) => d.action === 2 || d.action === 3).length, root: fold(ds.map(leafOf)) };
}
