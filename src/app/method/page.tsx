import type { Metadata } from "next";
import Link from "next/link";
import { CHAIN } from "@/config/brand";
import { MARKETS } from "@/config/markets";
import { CONTRACTS, registryLive } from "@/config/contracts";
import { PageHead } from "@/components/site/PageHead";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { TEMPLATES } from "@/lib/engine/templates";
import { BIT_WORDS, BITS, type BitName } from "@/lib/engine/risk";
import { HOUSE_START } from "@/lib/engine/report";
import { utc } from "@/lib/format";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({ path: "/method", title: "Method, data and limits | Orluno", description: "How an Orluno report is computed: data from Chainlink rounds on Robinhood Chain, the four strategy templates, fills, fees, slippage, risk limits, paper sessions, decision hashes, and what is not built." });

function Part({ id, n, title, children }: { id: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal as="section">
      <div id={id} data-sec={n} style={{ borderTop: "1px solid var(--ink)", paddingTop: 20, marginTop: 64, scrollMarginTop: 120 }}>
        <p className="kicker" style={{ margin: 0 }}>{n.padStart(2, "0")} · {id}</p>
        <h2 className="hd-3" style={{ margin: "8px 0 16px" }}>{title}</h2>
        <div className="body" style={{ display: "grid", gap: 12, maxWidth: 820 }}>{children}</div>
      </div>
    </Reveal>
  );
}

export default function MethodPage() {
  return (
    <>
      <PageHead kicker="Every rule, written out" title="How a report" tail="is computed." lede={<p style={{ margin: 0 }}>If the page and the code disagree, the code in src/lib/engine is what ran. It is short; read it.</p>} />
      <div className="wrap">
        <div className="grid-main">
          <div>
            <Part id="data" n="1" title="Data: Chainlink rounds on Robinhood Chain">
              <p>Prices come from the Chainlink feeds on {CHAIN.name} (chain {CHAIN.id}). Every round of each feed&apos;s current phase was read on chain with getRoundData (scripts/snapshot-rounds.mjs) and is topped up live with the rounds published since. A feed publishes when the price moves 0.5 % or once a day, so between answers the last one stands: a bar close can be up to about 0.5 % away from the market.</p>
              <p>Bars are hourly. ETH has a bar every hour. Stock tokens follow US market hours (24 hours on weekdays, Monday 01:00 to Saturday 01:00 UTC); there are no weekend bars, and no bar while the last answer is older than 26 hours. Nothing is filled in with a made-up price.</p>
              <table className="table">
                <thead>
                  <tr><th>Asset</th><th>Feed</th><th>Hours</th></tr>
                </thead>
                <tbody>
                  {MARKETS.map((m) => (
                    <tr key={m.id}>
                      <td>{m.id} · {m.label}</td>
                      <td className="m" style={{ overflowWrap: "anywhere" }}>{m.feedDescription} · {m.feed}</td>
                      <td className="m">{m.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small">Stock tokens are tokens on {CHAIN.name}, not the shares. A ticker is never taken as identity: a stock token shows as proven only when it is in the vetted list and, read live, has the Robinhood stock-token proxy code, the Robinhood beacon in its ERC-1967 slot and a minted supply (/api/proof).</p>
            </Part>
            <Part id="entry" n="2" title="Entry: four templates">
              {TEMPLATES.map((t) => (
                <p key={t.id}>
                  <b>{t.name}.</b> {t.short} Parameters: {t.params.map((p) => `${p.label.toLowerCase()} (default ${p.def}${p.unit === "%" ? " %" : p.unit === "bars" ? " bars" : ""})`).join(", ")}.
                </p>
              ))}
              <p>Moving averages are simple averages of hourly closes. The RSI uses simple averages of gains and losses over the period. A template needs enough history before its first decision (its warm-up); the backtest takes it from the bars before the window.</p>
            </Part>
            <Part id="exit" n="3" title="Exit: stop, target, rule">
              <p>While a position is open, each bar is checked in this order: stop loss (close at or under the entry fill minus the stop), take profit (close at or over the entry fill plus the target), then the template&apos;s exit rule. The first one that fires sells the whole position.</p>
            </Part>
            <Part id="size" n="4" title="Size and fills">
              <p>Long only, one position at a time, paper money in USD. A buy spends the position size (a share of current equity). Fills happen at the bar close: buys at the close plus slippage, sells at the close minus slippage; the fee is charged on the traded value of every fill. The comparison line buys with all paper money at the first decision bar, with the same fee and slippage, and holds.</p>
              <p>Max drawdown is the largest fall of equity from its running peak. Return vs holding is the strategy&apos;s return minus the holding line&apos;s return over the same bars. A position still open at the end is valued at the last close.</p>
            </Part>
            <Part id="limits" n="5" title="Risk limits">
              <p>Before every fill the engine asks the same question as OrlunoLimitRegistry.checkTrade(): does this trade stay inside the limits? The answer is a set of reason bits; a refused buy is logged with its reasons and never filled. A day is the UTC day of the bar close; daily loss is the drop from the equity at the day&apos;s first bar.</p>
              <table className="table">
                <tbody>
                  {(Object.keys(BITS) as BitName[]).map((k) => (
                    <tr key={k}>
                      <td className="m">bit {Math.log2(BITS[k])}</td>
                      <td><b>{BIT_WORDS[k].label}</b></td>
                      <td>{BIT_WORDS[k].text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>Sells are never refused for size, daily loss or trade count (only for slippage), so a limit can never trap a position. Bits 8–11 come only from the registry (config state and its price feed).</p>
            </Part>
            <Part id="costs" n="6" title="Costs">
              <p>Fee and slippage are inputs, per fill, in percent of the traded value. Defaults are 0.30 % fee and 0.10 % slippage; they are examples, not a quote from any venue. The report adds up what each side paid.</p>
            </Part>
            <Part id="paper" n="7" title="Paper sessions and decision hashes">
              <p>A paper session stores a config and a start time in this browser. Every hourly bar that closes after the start is decided with that config; changing any setting changes the config hash, and the paper side then stays empty until you start a new session. Decisions are recomputed from the feed rounds on each visit; the ones this browser saw within two hours of the bar close are marked &ldquo;seen live&rdquo;, the rest &ldquo;replayed&rdquo;.</p>
              <p>The house session (Trend cross on ETH, default settings) started {utc(HOUSE_START, true)}; its rules were committed in the code before any of its bars existed.</p>
              <p>Each decision hashes to keccak256(abi.encode(uint64 time, uint256 feed answer, uint8 action, uint256 reasons, uint16 position bps)), where reasons = limit bits | rule code &lt;&lt; 16. A batch folds the hashes in order (root = keccak(root, hash), from zero) and the registry links each batch to the previous head, so an anchored run cannot be rewritten without changing every later head.</p>
            </Part>
            <Part id="contract" n="8" title="The contract">
              <p>OrlunoLimitRegistry (with the internal library OrlunoRiskMath) records a config hash, its asset, its price feed and its limits per owner; tightening applies in the same block, loosening waits 24 hours and can be cancelled; checkTrade() is a view that reads the feed; anchorBatch() extends the hash chain. It holds no funds, places no orders, and has no admin, fee or upgrade path. {registryLive() ? <>Address: <span className="mono">{CONTRACTS.registry}</span>.</> : "It is not deployed yet."}</p>
            </Part>
            <Part id="not-built" n="9" title="What is not built">
              <p>
                <span className="badge dash">Concept</span> Trading with real money through a vault. The PK puts it after the permission and limit mechanics are tested; nothing on this site moves funds, and the agent never signs for you.
              </p>
              <p>
                <span className="badge dash">Concept</span> Token features (more active strategies, longer backtests, advanced exports). The report works fully without any token.
              </p>
              <p>No model or AI writes the decisions: the templates are fixed code. Nothing here is advice, and a backtest result is not a future result.</p>
            </Part>
          </div>
          <div className="rail-col" aria-hidden="true">
            <div className="rail-num" data-railnum="">
              <span className="halftone">1</span>
            </div>
          </div>
        </div>
        <p style={{ marginTop: 48 }}>
          <Link href="/evaluate" className="cut">
            <span className="face">Open the builder</span>
          </Link>
        </p>
      </div>
      <SiteFooter />
    </>
  );
}
