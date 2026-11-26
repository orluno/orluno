# Orluno

Orluno is for people who want to run a trading bot but only ever see its best number. It takes one no-code strategy and runs the same rules twice: as a backtest over past hourly prices and as paper trading from the moment you start it. The evaluation report puts both side by side, with the return against simply holding, the deepest drawdown, the simulated fees and slippage, the trade count, and every decision with the reason it was made, so you can see how the strategy behaves before any real money is involved.

No-code trading agents. Test strategies, track decisions, set your limits for Robinhood Chain.

## Read this before anything else

This repository is the working code behind https://orluno.xyz.

- **What runs today.** The report builder (`/evaluate`): four strategy templates (trend cross, breakout, dip to average, RSI rebound), nine assets on Robinhood Chain (ETH and eight stock tokens), position size, stop loss and take profit, five risk limits, fee and slippage per fill, a backtest window of 14 to 120 days, and paper sessions kept in your browser. Saved reports and a side-by-side comparison (`/reports`), a limit-check playground and on-chain config lookup (`/limits`), and the full method (`/method`). Paper money only.
- **Live data.** Prices are Chainlink feed answers read from Robinhood Chain: every round of each feed's current phase was read on chain into `src/data/rounds/`, and newer rounds are read live. Stock-token identity is re-proven live (vetted list + proxy code hash + beacon slot + minted supply).
- **The contract.** `OrlunoLimitRegistry` records a strategy config hash with the risk limits its owner set (stricter limits apply at once, looser ones wait 24 hours), answers `checkTrade()` against the config's price feed, and anchors hash-chained batches of paper decisions. It is **not deployed yet**; the site works fully without it.
- **Not built.** Trading with real money through a vault, and any $ORLUNO token feature. Both are concepts. The agent never signs for you; no order is ever placed.
- **What nothing here claims.** A backtest result is not a future result. Nothing here is advice or a promise of any result, and $ORLUNO has no promised value.

## Layout

| Path | What it is |
|---|---|
| `src/app/` | Pages and API routes (Next.js App Router): `/`, `/evaluate`, `/reports`, `/limits`, `/method`, `/token`, local-only `/deploy`, `/api/history`, `/api/latest`, `/api/proof`, `/api/registry`, `/api/chain`, `/api/rpc`. |
| `src/lib/engine/` | The report engine: hourly bars from Chainlink rounds, the templates, the shared simulation, the limit check (same rules as the contract) and the decision hashes. |
| `src/lib/server/` | Chain reads: round top-up, token proofs, registry views and logs, the hardened RPC relay and rate limits. |
| `src/components/` | Interface components (report, builder, wallet, site). |
| `src/config/` | `brand.ts` (name, ticker, token address, links), `markets.ts` (assets and feeds), `contracts.ts` (deployed addresses). |
| `src/data/rounds/` | The Chainlink round snapshot per asset (`npm run rounds` refreshes it). |
| `contracts/` | Solidity sources (`src/`) and Foundry tests (`test/`, including parity fixtures written by the engine). |
| `scripts/` | `verify-deployment`, the contract artifact builder, the round snapshot and the parity fixture writer. |
| `public/` | Static images and wallet icons. |

## Run the tests

Node.js 20 or newer.

```
npm install
npm run typecheck
npm test
```

Contracts use [Foundry](https://book.getfoundry.sh/):

```
cd contracts
bash setup.sh
forge test --no-match-contract Fork
forge test --match-contract Fork --fork-url https://rpc.mainnet.chain.robinhood.com --evm-version cancun
```

### What was checked for this snapshot

2026-11-26 (UTC), Node.js 25, forge 1.x, solc 0.8.28: `npm run typecheck` exit 0; `npm test` 32 pass / 0 fail (engine on real ETH rounds, relay, rate limits, verify-deployment); build 22 routes; `forge test` 31 passed (`OrlunoLimitRegistryTest` 25 unit and fuzz, `OrlunoParityTest` 2 replaying 600 limit cases and 400 real decisions from the engine, `OrlunoLimitRegistryInvariantTest` 4 invariants); fork suite 4 passed on a Robinhood Chain mainnet fork. A browser run on an anvil fork with chain id 4663 passed 11 steps (wallet connect and add-chain, reports, paper session, record, tighten, queued loosening, anchoring with the head recomputed from the exported decisions, the local deploy page) and `verify-deployment` printed MATCH for both deployments. Not run here: a deployment on mainnet.

## Look at the site

```
npm install
npm run build
npm start
```

Open http://localhost:6780. Everything works with no configuration: reports, paper sessions, saved reports and the limit playground. Without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` the wallet dialog shows WalletConnect as "Not configured on this site yet"; without `KV_REST_API_URL` / `KV_REST_API_TOKEN` rate limits are kept per server instance.

## Contracts

| Contract | Address | Explorer |
|---|---|---|
| OrlunoLimitRegistry (+ internal library OrlunoRiskMath) | not deployed yet | — |

The registry records, per owner, a config hash, its asset, its price feed and five limits (max position, max daily loss, max trades a day, max slippage, max price age). Tightening applies in the same block; loosening waits 24 hours and can be cancelled. `checkTrade()` returns reason bits for a described trade, `anchorBatch()` extends a per-config hash chain of paper decisions, and `decisionLeaf` / `foldLeaves` / `linkHead` let anyone recompute an anchored batch. It has no owner, no admin, no fee, no upgrade, and holds no funds.

## Verify a deployment

```
npm run verify-deployment -- --registry <address> --registry-tx <creation tx>
```

The script compares the bytecode on Robinhood Chain with the build in this repository and prints MATCH or the first difference.

## Add the network to your wallet

| Field | Value |
|---|---|
| Network | Robinhood Chain |
| Chain ID | 4663 |
| Currency | ETH |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |

The site offers to add it when you connect.

## Data sources and limits

- **Robinhood Chain RPC** (official endpoint, then public fallbacks): Chainlink rounds (`getRoundData` through Multicall3, at most 600 new rounds per refresh, one refresh a minute), token proofs, registry views and logs. A failed read is never cached; the last complete answer is served with its time.
- **Chainlink feeds** publish when the price moves 0.5 % or once a day, so a bar close can be about 0.5 % away from the market. Stock-token feeds follow US market hours (24 hours on weekdays): there are no weekend bars. If a feed moves to a new phase, newer rounds are not mixed in and the page says so.
- **Stock tokens** are tokens on Robinhood Chain, not the shares. A ticker is never treated as identity.
- Numbers that cannot be read show "—".

## Token

$ORLUNO is the community token of Orluno on Robinhood Chain. Contract address: announced on https://orluno.xyz at launch. It has no promised value. Token features (more active paper sessions, longer backtests, advanced exports) are concepts, not built yet; the report never needs the token.

## Deploy your own

1. Import the repository into a Next.js host (preset Next.js, root `./`), Node.js 20+.
2. Optional environment variables:

| Variable | What it is for | Format |
|---|---|---|
| `ROBINHOOD_RPC_URL` | Private Robinhood Chain RPC for server reads (recommended for log scans) | `https://…` |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Public RPC override for the browser | `https://…` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect in the wallet dialog | 32 hex characters |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared store for rate limits across instances | `https://…`, token string |
| `STORE_KEY_PREFIX` | Key prefix in that store | text, default `orluno:` |

3. After the deploy: `/` returns 200, `/api/chain` returns a block number, `/api/history?asset=ETH` returns bars, `/api/proof` lists nine proven tokens.
4. Contract: run the site locally, open http://localhost:6780/deploy, connect the deployer wallet and deploy `OrlunoLimitRegistry` (no constructor arguments). Put the address, block and creation tx into `src/config/contracts.ts`, then run `npm run verify-deployment`.

## Contributing

Fork the repository, branch from `main`, and run `npm run typecheck`, `npm test` and `npm run build`, and `bash setup.sh && forge test` in `contracts/` before opening a pull request. For a bug, open an issue with the expected and actual behavior and minimal steps. Keep private keys, seed phrases and environment values out of issues.

## Security

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. The contracts, the API routes, the RPC relay and transaction building are in scope; wallets, RPC providers, explorers and launchpads are not. There is no bug bounty.

## Notices and license

This project's original code is released under the [MIT License](LICENSE). Self-hosted fonts: Instrument Sans and IBM Plex Mono, both under the SIL Open Font License 1.1 (`src/fonts/OFL-*.txt`). Wallet logos in `public/wallets/` belong to their projects and are used only to identify the wallet. Chainlink round data is public on-chain data. The Orluno name, logo and artwork belong to the project and are not licensed for reuse as a brand.
