import ART from "@/lib/contracts/artifacts.json";
import type { Abi } from "viem";

/** OrlunoLimitRegistry ABI from the committed build (scripts/contracts-artifacts.mjs). */
export const REGISTRY_ABI = ART.contracts.OrlunoLimitRegistry.abi as Abi;

export const FEED_ABI = [
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] },
  { type: "function", name: "getRoundData", stateMutability: "view", inputs: [{ type: "uint80" }], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] },
  { type: "function", name: "phaseId", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "description", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;
