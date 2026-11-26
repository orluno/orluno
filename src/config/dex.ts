/*
 * Robinhood Chain (4663) contracts Orluno reads. Each address was read on chain on 26 Nov 2026 through the official RPC.
 * None of them is an Orluno contract.
 */

/** Wrapped ether, 18 decimals. The ETH market's token. */
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";

/** Chainlink ETH / USD on Robinhood Chain: description() "ETH / USD", decimals() 8. */
export const ETH_USD_FEED = "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9";

/** Multicall3 (code present at the canonical address). */
export const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

/**
 * Robinhood's stock tokens are BeaconProxy contracts pointing at one beacon. Orluno shows a stock token as proven only when it is in
 * the vetted list (src/lib/fixtures/stock-tokens.json) AND, read live:
 *   - keccak256 of its runtime code equals STOCK_PROXY_CODEHASH,
 *   - its ERC-1967 beacon slot holds STOCK_BEACON, and
 *   - totalSupply() > 0.
 * The code hash and the slot alone can be copied by anyone who deploys the same proxy, which is why the vetted list is required too.
 */
export const STOCK_BEACON = "0xe10b6f6b275de231345c20d14ab812db62151b00";
export const STOCK_PROXY_CODEHASH = "0x6c1fdd40002dcb440c7fff6a84171404d279ccb057803b65826f7546acd65630";
export const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
