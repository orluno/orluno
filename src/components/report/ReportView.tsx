"use client";

import { useMemo, useState } from "react";
import { marketById } from "@/config/markets";
import { templateById } from "@/lib/engine/templates";
import type { Report, PaperSession } from "@/lib/engine/report";
import { ACTION, ACTION_NAME, RULE_NAME, type Decision, type Metrics, type RunResult } from "@/lib/engine/simulate";
import { bitNames, BIT_WORDS } from "@/lib/engine/risk";
import { leafOf, reasonsOf } from "@/lib/engine/anchor";
import { canonical } from "@/lib/engine/config";
import { EquityChart } from "@/components/report/EquityChart";
import { bps, int, pct, price, usd, utc } from "@/lib/format";

/*
 * The evaluation report: backtest and paper side by side with the same config hash, the notes on how they differ, both equity
 * curves against holding, and the full decision log (every bar: buy, sell, hold, wait or refused, with the rule's numbers and the
 * limit that refused it). Exports: JSON (config + both runs) and CSV (decisions).
 */

type Row = { k: string; f: (m: Metrics) => string; hint?: string };
const ROWS: Row[] = [
  { k: "Return", f: (m) => pct(m.returnPct) },
  { k: "Buy and hold", f: (m) => pct(m.holdReturnPct), hint: "All paper money bought at the first decision bar, same fee and slippage." },
  { k: "Return vs holding", f: (m) => pct(m.excessPct) },
  { k: "Max drawdown", f: (m) => pct(m.maxDrawdownPct), hint: "Largest drop of equity from its running peak." },
  { k: "Holding drawdown", f: (m) => pct(m.holdMaxDrawdownPct) },
  { k: "End equity", f: (m) => usd(m.endEquity) },
  { k: "Simulated fees", f: (m) => usd(m.fees) },
  { k: "Simulated slippage", f: (m) => usd(m.slippage) },
  { k: "Trades (fills)", f: (m) => int(m.trades) },
  { k: "Round trips", f: (m) => int(m.roundTrips) },
  { k: "Winning round trips", f: (m) => (m.winRatePct === null ? "—" : `${m.winRatePct.toFixed(0)} %`) },
  { k: "Time in a position", f: (m) => `${m.exposurePct.toFixed(1)} %` },
  { k: "Refused by a limit", f: (m) => int(m.refused) },
  { k: "Decisions (hourly bars)", f: (m) => int(m.bars) },
  { k: "Position open at the end", f: (m) => (m.bars ? (m.openPosition ? "yes (marked at the last close)" : "no") : "—") },
];

const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "trades", label: "Trades", test: (d: Decision) => d.action === ACTION.BUY || d.action === ACTION.SELL },
  { id: "refused", label: "Refused", test: (d: Decision) => d.action === ACTION.REFUSED },
  { id: "quiet", label: "Hold / wait", test: (d: Decision) => d.action === ACTION.HOLD || d.action === ACTION.WAIT },
] as const;

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function csv(side: string, run: RunResult) {
  const head = "side,bar_close_utc,unix,feed_answer,price,action,rule,limit_bits,limits,reason,position_bps,equity,fill,fee,decision_hash";
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [
    head,
    ...run.decisions.map((d) =>
      [side, new Date(d.t * 1000).toISOString(), d.t, d.answer, d.price, ACTION_NAME[d.action], RULE_NAME[d.rule], d.bits, esc(bitNames(d.bits).join(" ")), esc(d.text), d.positionBps, d.equity.toFixed(2), d.fill?.toFixed(6) ?? "", d.fee?.toFixed(6) ?? "", leafOf(d)].join(","),
    ),
  ].join("\n");
}

export function ReportView({ report, seen, session, now }: { report: Report; seen: Record<string, number>; session: PaperSession | null; now: number }) {
  const [side, setSide] = useState<"backtest" | "paper">("backtest");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("trades");
  const [limit, setLimit] = useState(60);
  const tpl = templateById(report.config.template)!;
  const market = marketById(report.config.asset)!;
  const bt = report.backtest;
  const pp = report.paper;
  const run = side === "paper" && pp ? pp : bt;
  const list = useMemo(() => [...run.decisions].reverse().filter(FILTERS.find((f) => f.id === filter)!.test), [run, filter]);

  return (
    <section style={{ marginTop: 72 }} data-testid="report">
      <div style={{ borderTop: "6px solid var(--ink)", paddingTop: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline", justifyContent: "space-between" }}>
          <h2 className="h-sec" style={{ fontSize: "clamp(32px,3.6vw,52px)" }}>
            Evaluation report<span className="tail">{tpl.name} · {market.id}</span>
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => download(`orluno-report-${report.hash.slice(2, 10)}.json`, JSON.stringify({ config: JSON.parse(canonical(report.config)), configHash: report.hash, backtestDays: report.backtestDays, paperStart: report.paperStart, dataEnd: report.dataEnd, backtest: bt, paper: pp, notes: report.notes, decisionHash: "keccak256(abi.encode(uint64 t, uint256 answer, uint8 action, uint256 reasons, uint16 positionBps))" }, null, 1), "application/json")} data-testid="export-json">
              Export JSON
            </button>
            <button type="button" className="btn" onClick={() => download(`orluno-decisions-${report.hash.slice(2, 10)}.csv`, [csv("backtest", bt), ...(pp ? [csv("paper", pp).split("\n").slice(1).join("\n")] : [])].join("\n"), "text/csv")} data-testid="export-csv">
              Export CSV
            </button>
          </div>
        </div>
        <p className="mono small" style={{ marginTop: 10, overflowWrap: "anywhere" }}>
          config {report.hash} · {market.feedDescription} feed · bars up to {report.dataEnd ? utc(report.dataEnd) : "—"}
        </p>
        <p className="note" style={{ marginTop: 16, maxWidth: 820 }}>
          A backtest result is not a future result. Both sides use paper money and the fees and slippage you entered; no order was placed anywhere.
        </p>
      </div>

      {/* side-by-side metrics */}
      <div style={{ marginTop: 32, maxWidth: 988 }} data-testid="metrics">
        <div className="metric-row head">
          <span>Same rules</span>
          <span className="v">Backtest · {report.backtestDays} d</span>
          <span className="v">Paper{session ? ` · since ${utc(session.startedAt)}` : ""}</span>
        </div>
        {ROWS.map((r) => (
          <div className="metric-row" key={r.k} title={r.hint}>
            <span style={{ fontSize: 15 }}>{r.k}</span>
            <span className="v" data-testid={`bt-${r.k}`}>{bt.metrics.bars ? r.f(bt.metrics) : "—"}</span>
            <span className="v" data-testid={`pp-${r.k}`}>{pp && pp.metrics.bars ? r.f(pp.metrics) : "—"}</span>
          </div>
        ))}
        <p className="small mono" style={{ marginTop: 8 }}>
          Backtest {bt.metrics.from ? `${utc(bt.metrics.from, true)} → ${utc(bt.metrics.to!, true)}` : "no bars"} · Paper {pp?.metrics.from ? `${utc(pp.metrics.from, true)} → ${utc(pp.metrics.to!, true)}` : session ? "waiting for the first closed bar" : "no session"}
        </p>
      </div>

      {report.notes.length ? (
        <div style={{ marginTop: 32, maxWidth: 820, display: "grid", gap: 10 }} data-testid="notes">
          <h3 className="hd-4">Where the two sides differ</h3>
          {report.notes.map((n) => (
            <p key={n} className="note" style={{ margin: 0 }}>{n}</p>
          ))}
        </div>
      ) : null}

      {/* charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32, marginTop: 48 }}>
        <div>
          <span className="lbl" style={{ marginBottom: 10 }}>Backtest equity vs holding</span>
          <EquityChart curve={bt.curve} trades={bt.trades} label="Backtest equity against buy and hold" testid="chart-backtest" />
        </div>
        <div>
          <span className="lbl o" style={{ marginBottom: 10 }}>Paper equity vs holding</span>
          {pp ? <EquityChart curve={pp.curve} trades={pp.trades} label="Paper equity against buy and hold" testid="chart-paper" /> : <div className="box dash small" style={{ height: 220, display: "grid", placeItems: "center", textAlign: "center", padding: 20 }}>Start a paper session (step 06) and every hourly bar that closes after that moment is decided with these rules.</div>}
        </div>
      </div>

      {/* decision log */}
      <div style={{ marginTop: 56 }} data-testid="log">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <h3 className="hd-3">Every decision, with its reason.</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div className="seg" role="group" aria-label="Side">
              <button type="button" aria-pressed={side === "backtest"} onClick={() => setSide("backtest")} data-testid="log-backtest">Backtest {int(bt.decisions.length)}</button>
              <button type="button" aria-pressed={side === "paper"} onClick={() => setSide("paper")} disabled={!pp} data-testid="log-paper">Paper {int(pp?.decisions.length ?? 0)}</button>
            </div>
            <div className="seg" role="group" aria-label="Filter">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} data-testid={`filter-${f.id}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, borderTop: "1px solid var(--ink)" }}>
          {list.slice(0, limit).map((d) => {
            const names = bitNames(d.bits);
            const live = side === "paper" ? seen[String(d.t)] : undefined;
            return (
              <div key={d.t} className="dec" data-testid="decision">
                <span className="t">{utc(d.t)}</span>
                <span className={`act ${ACTION_NAME[d.action].toLowerCase()}`}>{ACTION_NAME[d.action]}</span>
                <span className="why">
                  <b style={{ fontWeight: 600 }}>{RULE_NAME[d.rule]}:</b> {d.text}
                  {names.length ? <span className="err"> · refused: {names.map((n) => BIT_WORDS[n].label).join(", ")}</span> : null}
                  {d.fill ? <span className="small"> · fill {price(d.fill)}, fee {usd(d.fee ?? 0)}</span> : null}
                  {side === "paper" ? <span className="badge dash" style={{ marginLeft: 8 }} title={live ? "This browser decided it within 2 hours of the bar close." : "Recomputed from the feed rounds after the bar closed (rules fixed at the session start)."}>{live ? "seen live" : "replayed"}</span> : null}
                  <span className="small mono" style={{ display: "block", fontSize: 11 }}>
                    pos {bps(d.positionBps)} · reasons {reasonsOf(d).toString()} · {leafOf(d).slice(0, 18)}…
                  </span>
                </span>
                <span className="p">{price(d.price)}</span>
              </div>
            );
          })}
          {!list.length ? <p className="small" style={{ padding: "16px 0" }}>No decisions match this filter{side === "paper" && session ? " yet" : ""}.</p> : null}
        </div>
        {list.length > limit ? (
          <button type="button" className="btn" style={{ marginTop: 16 }} onClick={() => setLimit((l) => l + 120)} data-testid="log-more">
            Show more ({int(list.length - limit)} left)
          </button>
        ) : null}
        <p className="small" style={{ marginTop: 16 }}>
          Prices are the Chainlink answer at each hourly close (8 decimals), so a close can differ from the market by up to the feed&apos;s 0.5 % threshold. Data read {utc(now)}.
        </p>
      </div>
    </section>
  );
}
