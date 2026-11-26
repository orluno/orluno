import { isAddress } from "@/config/brand";

/*
 * Orluno's own contract on Robinhood Chain (chain 4663). Deployed 26 Nov 2026 by the owner; address, block and
 * transaction below. With an empty address every on-chain panel says "Not deployed yet" and the report still works.
 *   registry  OrlunoLimitRegistry (+ internal library OrlunoRiskMath, inlined): strategy config hashes with the risk limits their
 *             owner set (tightening at once, loosening after 24 h), checkTrade reason bits read against the config's Chainlink
 *             feed, and hash-chained batches of paper decisions. No funds, no admin, no fee, no upgrade.
 * Check a deployment yourself: `npm run verify-deployment -- --registry <address> --registry-tx <tx>` prints MATCH.
 */
const DEPLOYED = {
  registry: "0x3b39a27f07d37274bde3852b3296bf311e0b9b79",
  /** Block of the deployment transaction (log scans start here). */
  block: 123517111,
  /** Creation transaction. */
  tx: "0x3024bb49f801349590228a59480b2982dfaf869161fb7d43871702f8d42e76c7",
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
