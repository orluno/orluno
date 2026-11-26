import Link from "next/link";
import type { Metadata } from "next";
import { BRAND, CHAIN } from "@/config/brand";
import { MARKETS } from "@/config/markets";
import { HeroForm } from "@/components/home/HeroForm";
import { Raster, Reveal } from "@/components/site/Reveal";
import { SiteFooter } from "@/components/site/SiteFooter";
import { EquityChart } from "@/components/report/EquityChart";
import { houseReport } from "@/lib/sample";
import { leafOf } from "@/lib/engine/anchor";
import { ACTION, ACTION_NAME, RULE_NAME, type Decision } from "@/lib/engine/simulate";
import { bitNames, BIT_WORDS } from "@/lib/engine/risk";
import { HOUSE_START } from "@/lib/engine/report";
import { configHash } from "@/lib/engine/config";
import { age, bps, int, pct, price, utc } from "@/lib/format";
import { pageMeta, HOME_DESCRIPTION, HOME_TITLE } from "@/lib/seo";

export const revalidate = 300;
export const metadata: Metadata = pageMeta({ path: "/", title: HOME_TITLE, description: HOME_DESCRIPTION });

const CATS = [
  { n: "1", key: "entry", label: "Entry · 4 templates", q: "When does the strategy buy?", text: "Pick a block: trend cross, breakout, dip to average or RSI rebound. Every buy names the numbers that fired it." },
  { n: "2", key: "exit", label: "Exit · 3 ways out", q: "What makes it sell?", text: "A stop loss from the entry fill, an optional target, then the template's own exit rule, checked in that order." },
  { n: "3", key: "size", label: "Size · share of equity", q: "How much does each buy use?", text: "One position at a time, sized as a share of current equity. No leverage: the engine refuses anything over 100 %." },
  { n: "4", key: "limits", label: "Limits · 5 rules", q: "Where does it have to stop?", text: "Max position, max daily loss, max trades a day, max slippage, max price age. Checked before every fill, with the registry's own rules." },
  { n: "5", key: "costs", label: "Costs · per fill", q: "What does each trade cost?", text: "Fee and slippage are inputs you set, charged on every buy and every sell, and summed in the report." },
  { n: "6", key: "data", label: "Data · Chainlink rounds", q: "Which prices did it read?", text: `Hourly bars from the Chainlink feeds on ${CHAIN.name}: every round of the current phase, with the round number behind each close.` },
];

function counts(ds: Decision[]) {
  return {
    trades: ds.filter((d) => d.action === ACTION.BUY || d.action === ACTION.SELL).length,
    hold: ds.filter((d) => d.action === ACTION.HOLD).length,
    wait: ds.filter((d) => d.action === ACTION.WAIT).length,
    refused: ds.filter((d) => d.action === ACTION.REFUSED).length,
  };
}

function Cells({ n, kind, max = 10 }: { n: number; kind: "" | "o" | "d"; max?: number }) {
  const shown = Math.min(n, max);
  return (
    <div className="cells" data-cells="">
      {Array.from({ length: shown }, (_, i) => (
        <i key={i} className={`${kind} ${kind === "" ? "" : ""} ${i % 3 === 0 && kind !== "d" ? "dot" : ""}`} />
      ))}
      {n === 0 ? <i className="d" /> : null}
    </div>
  );
}

export default async function Home() {
  const house = await houseReport().catch(() => null);
  const rep = house?.report ?? null;
  const bt = rep?.backtest ?? null;
  const pp = rep?.paper ?? null;
  const c = bt ? counts(bt.decisions) : null;
  const example = bt ? [...bt.decisions].reverse().find((d) => d.action === ACTION.BUY || d.action === ACTION.SELL) ?? bt.decisions.at(-1) : undefined;
  // A server render (revalidated every 5 minutes): the clock is read once per render on purpose.
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000);

  return (
    <>
      {/* ---------------- hero ---------------- */}
      <section className="wrap" style={{ paddingTop: 56 }} data-sec="0">
        <div className="grid-main" style={{ rowGap: 28 }}>
          <div>
            <p style={{ margin: 0 }}>
              <span className="tag" data-scramble="">
                {BRAND.slogan.replace(/\.$/, "")}
              </span>
              <span className="tag-tail" data-scramble="">
                that run your rules twice and
              </span>
            </p>
            <Raster as="h1" className="h-display" delay={150}>
              <span style={{ display: "block", marginTop: 18 }}>show every decision they made.</span>
            </Raster>
          </div>
          <Reveal className="lede rail-col keep" delay={200}>
            <p style={{ margin: "34px 0 0" }}>{BRAND.tagline}</p>
            <p className="small" style={{ margin: "10px 0 0" }}>
              One strategy, one asset, the same rules as a backtest and as paper trading, side by side.
            </p>
          </Reveal>
        </div>
        <div style={{ marginTop: 120 }}>
          <HeroForm />
        </div>
        <div style={{ marginTop: 120 }}>
          <Raster as="p" className="ht-line halftone">
            Backtests are not future results.
          </Raster>
        </div>
      </section>

      {/* ---------------- ticker ---------------- */}
      {house ? (
        <div className="ticker mono" style={{ marginTop: 72, fontSize: 13 }} aria-label="Assets with their latest feed answer">
          <div className="track">
            {[0, 1].map((k) => (
              <span key={k} style={{ display: "inline-flex" }} aria-hidden={k === 1}>
                {MARKETS.map((m) => (
                  <span key={m.id} style={{ padding: "8px 22px", borderRight: "1px solid var(--line)" }}>
                    {m.id} · {m.kind === "stock" ? "stock token" : "24/7"} · Chainlink feed {m.feed.slice(0, 6)}…{m.feed.slice(-4)}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------------- 1 what your report gives you ---------------- */}
      <section className="wrap sec" data-sec="A">
        <div className="grid-main">
          <div>
            <Raster className="h-sec sec-head">
              What your report<span className="tail">gives you.</span>
            </Raster>
            <div className="grid-main" style={{ gridTemplateColumns: "minmax(0,1.05fr) minmax(0,1fr)", rowGap: 32, alignItems: "center" }}>
              <Reveal>
                <div className="bar-row" style={{ height: 64 }}>
                  <div className="bar-b">
                    <span className="t">Backtest</span>
                    <span className="m">same rules</span>
                  </div>
                  <span className="sq" />
                </div>
                <div className="bar-row" style={{ height: 48, marginTop: 4, marginRight: 0 }}>
                  <div className="bar-b">
                    <span className="t" style={{ fontSize: 16 }}>Paper trading</span>
                    <span className="m">same rules</span>
                  </div>
                  <span className="sq" />
                  <span className="sq" />
                </div>
                <div className="bar-row" style={{ height: 40, marginTop: 4 }}>
                  <div className="bar-b o">
                    <span style={{ fontSize: 15 }}>Your limits</span>
                    <span className="m">your call</span>
                  </div>
                  <span className="sq o" style={{ width: 40 }} />
                  <span className="sq o" style={{ width: 40 }} />
                </div>
              </Reveal>
              <Reveal delay={120}>
                <h3 className="hd-3">Side by side</h3>
                <p className="body" style={{ maxWidth: 340 }}>
                  The rules that produced the backtest are the rules that decide the paper session. One config hash for both, so neither side can drift.
                </p>
              </Reveal>
            </div>
          </div>
          <div className="rail-col" aria-hidden="true">
            <div className="rail-num">
              <span className="halftone">2×</span>
            </div>
          </div>
        </div>

        {/* counts */}
        <div style={{ marginTop: 120 }}>
          <Reveal>
            <h3 className="hd-3">What came back from the run.</h3>
            <p className="body" style={{ margin: "10px 0 32px" }}>
              Not only the trades: every bar the strategy looked at, including the ones where it waited and the ones your limits refused.
            </p>
          </Reveal>
          {c && bt ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, maxWidth: 988 }} data-testid="home-counts">
              <div>
                <div className="count-head">
                  <span>traded</span>
                  <span>{int(c.trades)}</span>
                </div>
                <Cells n={c.trades} kind="" />
              </div>
              <div>
                <div className="count-head">
                  <span>held</span>
                  <span>{int(c.hold)}</span>
                </div>
                <Cells n={Math.ceil(c.hold / 60)} kind="" />
              </div>
              <div>
                <div className="count-head d">
                  <span>refused by a limit</span>
                  <span>{int(c.refused)}</span>
                </div>
                <Cells n={c.refused} kind="d" />
              </div>
              <div>
                <div className="count-head o">
                  <span>waited</span>
                  <span>{int(c.wait)}</span>
                </div>
                <Cells n={Math.ceil(c.wait / 60)} kind="o" />
              </div>
            </div>
          ) : (
            <p className="small">The feed history could not be read right now.</p>
          )}
          {bt ? (
            <p className="small mono" style={{ marginTop: 16 }}>
              House report: Trend cross on ETH, default settings, {int(bt.metrics.bars)} hourly decisions from {utc(bt.metrics.from ?? 0)} to {utc(bt.metrics.to ?? 0)}. Held and waited squares: one per 60 bars.
            </p>
          ) : null}
        </div>

        {/* the decision and its proof */}
        {example ? (
          <div className="grid-main" style={{ marginTop: 120, rowGap: 32 }}>
            <div className="grid-main" style={{ gridTemplateColumns: "minmax(0,0.85fr) minmax(0,1fr)", rowGap: 32, alignItems: "start" }}>
              <Reveal>
                <h3 className="hd-3">The bar it decided on, and the reason.</h3>
                <p className="body">Each decision shows the close it read, the rule that fired or stayed quiet, what your limits said, and its hash.</p>
              </Reveal>
              <Reveal delay={120} className="doc" data-testid="home-decision">
                <div className="doc-head">
                  <span className="k">■</span>
                  <span className="k">/</span>
                  <span className="path">{utc(example.t, true)}</span>
                </div>
                <div style={{ padding: 12, display: "grid", gap: 4 }}>
                  <div className="bar-b" style={{ minHeight: 40 }}>
                    <span className="mono" style={{ fontSize: 13 }}>What the rule saw</span>
                    <span className="m">{RULE_NAME[example.rule]}</span>
                  </div>
                  <p className="mono" style={{ fontSize: 13, margin: "6px 4px 10px", lineHeight: "20px" }}>{example.text}</p>
                  <div className="bar-b o" style={{ minHeight: 40 }}>
                    <span className="mono" style={{ fontSize: 13 }}>What the limits said</span>
                    <span className="m">{example.bits ? "refused" : "inside every limit"}</span>
                  </div>
                  <p className="mono" style={{ fontSize: 13, margin: "6px 4px 10px" }}>
                    {example.bits ? bitNames(example.bits).map((b) => BIT_WORDS[b].label).join(", ") : `${ACTION_NAME[example.action]} at ${price(example.price)} (feed close), position after ${bps(example.positionBps)}`}
                  </p>
                  <div className="bar-b" style={{ minHeight: 40, background: "repeating-linear-gradient(90deg,#111110 0 2px,transparent 2px 4px)", color: "var(--ink)" }}>
                    <span className="mono" style={{ fontSize: 13, background: "var(--paper)", padding: "0 6px" }}>Stored hash</span>
                  </div>
                  <p className="mono" style={{ fontSize: 12, margin: "6px 4px 0", overflowWrap: "anywhere" }}>{leafOf(example)}</p>
                </div>
              </Reveal>
            </div>
            <div className="rail-col" />
          </div>
        ) : null}

        {/* backtest vs paper */}
        {bt ? (
          <div className="grid-main" style={{ marginTop: 120, rowGap: 32 }}>
            <div className="grid-main" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,0.85fr)", rowGap: 32, alignItems: "start" }}>
              <Reveal>
                <div className="doc-head" style={{ border: "1px solid var(--ink)", borderBottom: 0 }}>
                  <span className="k">■</span>
                  <span className="k">/</span>
                  <span className="path">trend-cross · ETH · {configHash(rep!.config).slice(0, 10)}…</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                  <span className="lbl">Backtest · {rep!.backtestDays} d</span>
                  <span className="lbl">Paper · since {utc(HOUSE_START)}</span>
                  {[
                    ["Return", pct(bt.metrics.returnPct), pp && pp.metrics.bars ? pct(pp.metrics.returnPct) : "—"],
                    ["Holding", pct(bt.metrics.holdReturnPct), pp && pp.metrics.bars ? pct(pp.metrics.holdReturnPct) : "—"],
                    ["Max drawdown", pct(bt.metrics.maxDrawdownPct), pp && pp.metrics.bars ? pct(pp.metrics.maxDrawdownPct) : "—"],
                    ["Decisions", int(bt.metrics.bars), pp ? int(pp.metrics.bars) : "—"],
                  ].map(([k, a, b]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <span className="mono box dash" style={{ padding: "8px 12px", fontSize: 13.5 }}>
                        {k} <b style={{ float: "right", fontWeight: 500 }}>{a}</b>
                      </span>
                      <span className="mono box dash" style={{ padding: "8px 12px", fontSize: 13.5 }}>
                        {k} <b style={{ float: "right", fontWeight: 500 }}>{b}</b>
                      </span>
                    </div>
                  ))}
                </div>
              </Reveal>
              <Reveal delay={120}>
                <h3 className="hd-3">What the paper side read.</h3>
                <p className="body">
                  The house paper session started at {utc(HOUSE_START, true)}, after the rules were fixed in the code. It has {pp ? int(pp.metrics.bars) : 0} decision{pp?.metrics.bars === 1 ? "" : "s"} so far; a short run says little about results, only about the decisions.
                </p>
                <p className="small">Backtest numbers describe the past bars they ran on. They are not a forecast.</p>
              </Reveal>
            </div>
            <div className="rail-col" />
          </div>
        ) : null}

        {bt ? (
          <div style={{ marginTop: 64, maxWidth: 988 }}>
            <Reveal>
              <EquityChart curve={bt.curve} trades={bt.trades} label="House report backtest: strategy equity against holding ETH" testid="home-chart" />
            </Reveal>
          </div>
        ) : null}
      </section>

      {/* ---------------- what we test ---------------- */}
      <section className="wrap sec">
        <Raster className="h-sec sec-head">
          What we test<span className="tail">on your strategy.</span>
        </Raster>
        <div className="grid-main">
          <div style={{ display: "grid", gap: 120 }}>
            {CATS.map((k, i) => (
              <div key={k.key} data-sec={k.n} className="grid-main" style={{ gridTemplateColumns: i % 2 ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,0.9fr) minmax(0,1.1fr)", rowGap: 24, alignItems: "center" }}>
                <Reveal className={i % 2 ? "order-2" : ""}>
                  <p className="kicker" style={{ margin: "0 0 10px" }}>{k.label}</p>
                  <h3 className="hd-3">{k.q}</h3>
                  <p className="body" style={{ maxWidth: 380 }}>{k.text}</p>
                  <Link href={`/method#${k.key}`} className="chip">
                    <span className="k">/</span>
                    <span>{k.key}</span>
                  </Link>
                </Reveal>
                <Reveal delay={100} className={i % 2 ? "order-1" : ""}>
                  <Diagram k={k.key} />
                </Reveal>
              </div>
            ))}
            <Reveal>
              <p className="body" style={{ maxWidth: 420 }}>Every rule is written out on the method page: what it compares, in which order, and what the report does when data is missing.</p>
              <Link href="/method" className="chip">
                <span className="k">/</span>
                <span>method</span>
              </Link>
            </Reveal>
          </div>
          <div className="rail-col" aria-hidden="true">
            <div className="rail-num" data-railnum="">
              <span className="halftone">1</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- free ---------------- */}
      <section className="wrap sec" data-sec="B">
        <Raster className="h-sec sec-head">
          What you get<span className="tail">for free.</span>
        </Raster>
        <div className="grid-main">
          <Reveal>
            <table className="table" data-testid="home-table">
              <thead>
                <tr>
                  <th style={{ width: "34%" }} />
                  <th>
                    <span className="lbl o">Without a wallet</span>
                  </th>
                  <th>
                    <span className="lbl">With a wallet</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr><th colSpan={3}>Reports</th></tr>
                <tr><td>Backtest</td><td>Up to 120 days of hourly bars</td><td>Same</td></tr>
                <tr><td>Paper sessions</td><td>Kept in this browser</td><td>Same, plus anchored on chain</td></tr>
                <tr><td>Decisions</td><td>Every one, with its reason</td><td>Every one, with its reason</td></tr>
                <tr><td>Export</td><td>JSON and CSV</td><td>JSON and CSV</td></tr>
                <tr><th colSpan={3}>Limits</th></tr>
                <tr><td>Checked before each fill</td><td>In the engine</td><td>Same rules as the registry</td></tr>
                <tr><td>Recorded on chain</td><td className="m">Wallet only</td><td>Config hash + limits, 24 h wait to loosen</td></tr>
                <tr><td>Paper decision anchors</td><td className="m">Wallet only</td><td>Hash-chained batches</td></tr>
                <tr><th colSpan={3}>Not built</th></tr>
                <tr><td>Trading with real money</td><td className="m">Concept</td><td className="m">Concept: a vault only after limits and permissions are tested</td></tr>
                <tr><td>{BRAND.symbol} token features</td><td className="m">Concept</td><td className="m">Concept</td></tr>
              </tbody>
            </table>
          </Reveal>
          <div className="rail-col">
            <div style={{ position: "sticky", top: 140, display: "grid", gap: 16 }}>
              <span className="ht-line halftone" style={{ fontSize: 120, lineHeight: 1 }} aria-hidden="true">
                ↓
              </span>
              <Link href="/evaluate" className="cut wide">
                <span className="face">Open the builder</span>
              </Link>
            </div>
          </div>
        </div>
        {house?.latest ? (
          <p className="small mono" style={{ marginTop: 24 }}>
            Data: Chainlink ETH / USD on {CHAIN.name}, round {int(house.latest.round)} at {utc(house.latest.updatedAt)} ({age(now - house.latest.updatedAt)} ago). Snapshot block {int(house.snapshot.block)} + {int(house.live.rounds)} rounds read live.
          </p>
        ) : null}
      </section>

      <SiteFooter
        cta={
          <div className="dark">
            <Raster className="h-sec" as="h2">
              Start with<span className="tail">your strategy.</span>
            </Raster>
            <div style={{ marginTop: 48 }}>
              <HeroForm dark id="foot" />
            </div>
          </div>
        }
      />
    </>
  );
}

/* Small line diagrams per category, drawn in the reference's boxed style (no images). */
function Diagram({ k }: { k: string }) {
  const box = (label: string) => (
    <div className="doc" style={{ width: 240 }}>
      <div className="doc-head">
        <span className="k">/</span>
        <span className="path">{label}</span>
      </div>
      <div style={{ padding: "18px 14px", display: "grid", gap: 14 }}>
        <i style={{ display: "block", height: 1, background: "var(--line)" }} />
        <i style={{ display: "block", height: 1, background: "var(--line)" }} />
        <i style={{ display: "block", height: 1, borderTop: "1px dashed var(--ink)" }} />
      </div>
    </div>
  );
  const row = (children: React.ReactNode) => <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", rowGap: 12 }}>{children}</div>;
  const wire = <i data-draw="" style={{ display: "block", width: 64, height: 1, background: "var(--ink)" }} />;
  switch (k) {
    case "entry":
      return row(<>{<span className="lbl">fast &gt; slow</span>}{wire}{<span className="sq" style={{ width: 56, height: 120 }} />}{wire}{box("buy")}</>);
    case "exit":
      return row(<>{box("position")}{wire}<div style={{ display: "grid", gap: 4 }}><span className="lbl">stop</span><span className="lbl o">target</span><span className="lbl d">rule</span></div></>);
    case "size":
      return (
        <div style={{ maxWidth: 420 }}>
          <div className="bar-row" style={{ height: 32, border: "1px solid var(--ink)" }}>
            <div className="bar-b" style={{ flex: "0 0 50%", minHeight: 30 }}>
              <span className="mono" style={{ fontSize: 13 }}>position 50 %</span>
            </div>
            <span className="mono" style={{ fontSize: 13, alignSelf: "center", paddingLeft: 10 }}>cash</span>
          </div>
          <p className="small mono" style={{ marginTop: 8 }}>limit 80 % · over 100 % refused</p>
        </div>
      );
    case "limits":
      return row(<><span className="lbl" style={{ padding: "10px 12px" }}>checkTrade</span>{wire}<div style={{ display: "grid", gap: 4 }}>{["position", "daily loss", "trades / day", "slippage", "price age"].map((x, i) => <span key={x} className={`lbl ${i % 2 ? "o" : ""}`}>{x}</span>)}</div></>);
    case "costs":
      return (
        <div style={{ maxWidth: 420, display: "grid", gap: 4 }}>
          <div className="bar-row" style={{ height: 28, border: "1px solid var(--ink)" }}>
            <div className="bar-b" style={{ flex: "0 0 70%", minHeight: 26 }}><span className="mono" style={{ fontSize: 12.5 }}>fill</span></div>
          </div>
          <div className="bar-row" style={{ height: 28, border: "1px dashed var(--ink)" }}>
            <div className="bar-b" style={{ flex: "0 0 12%", minHeight: 26 }} />
            <span className="mono" style={{ fontSize: 12.5, alignSelf: "center", paddingLeft: 8 }}>fee 0.30 % + slippage 0.10 %</span>
          </div>
        </div>
      );
    default:
      return row(<><span className="lbl">round 3,928</span>{wire}{box("bar 18:00 UTC")}</>);
  }
}
