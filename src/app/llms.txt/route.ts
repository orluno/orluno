import { BRAND, CHAIN } from "@/config/brand";
import { CONTRACTS, registryLive } from "@/config/contracts";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.slogan} ${BRAND.tagline} Orluno builds an evaluation report for one no-code strategy on one Robinhood Chain asset (chain ${CHAIN.id}): the same deterministic rules run as a backtest over hourly bars from Chainlink round history and as paper trading from the moment a session starts, side by side, with return against buy-and-hold, maximum drawdown, simulated fees and slippage, trade count and every decision with its reason. Risk limits (position size, daily loss, trades per day, slippage, price age) are checked before every simulated fill with the same rules as OrlunoLimitRegistry, which records config hashes and limits on chain (tightening at once, loosening after 24 hours) and anchors hash-chained batches of paper decisions. Paper money only: no vault, no real orders, the agent never signs for the user. Backtest results are not future results. Not affiliated with Robinhood.`,
    "",
    `Report builder: ${BRAND.url}/evaluate`,
    `Saved reports (this browser): ${BRAND.url}/reports`,
    `Limits on chain: ${BRAND.url}/limits`,
    `Method, data and limits: ${BRAND.url}/method`,
    `Hourly bars of a market (JSON): ${BRAND.url}/api/history?asset=ETH`,
    `Latest prices (JSON): ${BRAND.url}/api/latest`,
    `Token identity proofs (JSON): ${BRAND.url}/api/proof`,
    `OrlunoLimitRegistry: ${registryLive() ? CONTRACTS.registry : "not deployed yet"}`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
