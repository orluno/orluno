/*
 * The assets an Orluno report can run on, all on Robinhood Chain (4663).
 *   - ETH: wrapped ether (WETH) priced by the Chainlink ETH / USD feed (trades around the clock).
 *   - Stock tokens: Robinhood stock tokens from the vetted list in src/lib/fixtures/stock-tokens.json. The site re-proves each one
 *     live before showing it as proven (proxy code hash + ERC-1967 beacon slot + minted supply, see src/lib/server/proof.ts); a
 *     ticker is never identity on its own. Priced by the market-hours Chainlink feed of that stock token.
 * Feed addresses come from the Chainlink directory for Robinhood Chain mainnet; description() and decimals() were read on chain
 * on 26 Nov 2026 through the official RPC (scripts/snapshot-rounds.mjs refuses a feed whose description does not match).
 * A stock token is a token on Robinhood Chain, not the share itself.
 */
export type MarketKind = "crypto" | "stock";
export type Market = {
  id: string;
  kind: MarketKind;
  label: string;
  token: `0x${string}`;
  feed: `0x${string}`;
  feedDescription: string;
  /** Hours of trading the feed follows. */
  hours: "24/7" | "US market hours (24/5)";
};

export const MARKETS: readonly Market[] = [
  { id: "ETH", kind: "crypto", label: "Ether (WETH)", token: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", feed: "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9", feedDescription: "ETH / USD", hours: "24/7" },
  { id: "NVDA", kind: "stock", label: "NVIDIA", token: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", feed: "0x379ec4f7c378f34a1b47e4f3cbebcbac3e8e9f15", feedDescription: "RHNVDA / USD", hours: "US market hours (24/5)" },
  { id: "TSLA", kind: "stock", label: "Tesla", token: "0x322f0929c4625ed5bad873c95208d54e1c003b2d", feed: "0x4a1166a659a55625345e9515b32adecea5547c38", feedDescription: "RHTSLA / USD", hours: "US market hours (24/5)" },
  { id: "AAPL", kind: "stock", label: "Apple", token: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", feed: "0x6b22a786baa607d76728168703a39ea9c99f2cd0", feedDescription: "Robinhood AAPL / USD", hours: "US market hours (24/5)" },
  { id: "MSFT", kind: "stock", label: "Microsoft", token: "0xe93237c50d904957cf27e7b1133b510c669c2e74", feed: "0x45c3c877c15e6ba2ebb19ea114ea508d14c1af2e", feedDescription: "RHMSFT / USD", hours: "US market hours (24/5)" },
  { id: "AMZN", kind: "stock", label: "Amazon", token: "0x12f190a9f9d7d37a250758b26824b97ce941bf54", feed: "0xd5a1508ced74c084ebf3cbe853e2c968fb2a651c", feedDescription: "Robinhood AMZN / USD", hours: "US market hours (24/5)" },
  { id: "META", kind: "stock", label: "Meta Platforms", token: "0xc0d6457c16cc70d6790dd43521c899c87ce02f35", feed: "0x7c38c00c30bee9378381e7b6135d7283356d71b1", feedDescription: "Robinhood META / USD", hours: "US market hours (24/5)" },
  { id: "SPY", kind: "stock", label: "SPDR S&P 500 ETF Trust", token: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", feed: "0x319724394d3a0e3669269846abe664cd621f9f6a", feedDescription: "RHSPY / USD", hours: "US market hours (24/5)" },
  { id: "QQQ", kind: "stock", label: "Invesco QQQ", token: "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68", feed: "0x80901d846d5d7b030f26b480776ee3b29374c2ae", feedDescription: "Robinhood QQQ / USD", hours: "US market hours (24/5)" },
] as const;

export const MARKET_IDS = MARKETS.map((m) => m.id);
export const marketById = (id: string) => MARKETS.find((m) => m.id === id) ?? null;
/** Chainlink feeds on Robinhood Chain answer with 8 decimals (checked on chain for every feed above). */
export const FEED_DECIMALS = 8;
