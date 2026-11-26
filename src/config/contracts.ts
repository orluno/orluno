import { isAddress } from "@/config/brand";

/*
 * Orluno's own contract on Robinhood Chain (chain 4663). Not deployed yet: the owner deploys it from the local-only /deploy page
 * and pastes the address, block and transaction here (one edit). Until then every on-chain panel says "Not deployed yet" and the
 * report works fully without it.
 *   registry  OrlunoLimitRegistry (+ internal library OrlunoRiskMath, inlined): strategy config hashes with the risk limits their
 *             owner set (tightening at once, loosening after 24 h), checkTrade reason bits read against the config's Chainlink
 *             feed, and hash-chained batches of paper decisions. No funds, no admin, no fee, no upgrade.
 * Check a deployment yourself: `npm run verify-deployment -- --registry <address> --registry-tx <tx>` prints MATCH.
 */
const DEPLOYED = {
  registry: "",
  /** Block of the deployment transaction (log scans start here). */
  block: 0,
  /** Creation transaction. */
  tx: "",
};

/**
 * Local tests only: NEXT_PUBLIC_ORLUNO_TEST_CONTRACTS='{"registry":"0x…","block":1}' at build time points a second build at a
 * contract on an anvil chain. Never set it on Vercel.
 */
function testOverride(): typeof DEPLOYED | null {
  const raw = process.env.NEXT_PUBLIC_ORLUNO_TEST_CONTRACTS;
  if (!raw) return null;
  try {
    const v = { ...DEPLOYED, ...(JSON.parse(raw) as Partial<typeof DEPLOYED>) };
    return isAddress(v.registry) ? v : null;
  } catch {
    return null;
  }
}

export const CONTRACTS = testOverride() ?? DEPLOYED;
export const registryLive = () => isAddress(CONTRACTS.registry);
export const CONTRACT_NAME = "OrlunoLimitRegistry" as const;
