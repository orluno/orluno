"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadReports, removeReport, type SavedReport } from "@/lib/local";
import { templateById } from "@/lib/engine/templates";
import { bps, int, pct, utc } from "@/lib/format";

/* Reports saved in this browser, two of them comparable side by side. Nothing here leaves the browser. */
export function ReportsList() {
  const [list, setList] = useState<SavedReport[] | null>(null);
  const [cmp, setCmp] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setList(loadReports());
    sync();
    addEventListener("ol-local", sync);
    addEventListener("storage", sync);
    return () => {
      removeEventListener("ol-local", sync);
      removeEventListener("storage", sync);
    };
  }, []);
  if (list === null) return <p className="small">Reading this browser&apos;s saved reports…</p>;
  if (!list.length)
    return (
      <div className="box dash" data-testid="reports-empty">
        <p style={{ margin: 0 }}>No saved reports in this browser yet.</p>
        <Link href="/evaluate" className="chip" style={{ marginTop: 12 }}>
          <span className="k">/</span>
          <span>evaluate</span>
        </Link>
      </div>
    );
  const pair = cmp.map((id) => list.find((r) => r.id === id)).filter(Boolean) as SavedReport[];
  return (
    <div data-testid="reports">
      {pair.length === 2 ? (
        <div className="box" style={{ marginBottom: 32 }} data-testid="compare">
          <h3 className="hd-4" style={{ marginBottom: 12 }}>Two reports side by side</h3>
          {[
            ["Strategy", (r: SavedReport) => `${templateById(r.config.template)?.name} · ${r.config.asset}`],
            ["Backtest return", (r: SavedReport) => pct(r.backtest.returnPct)],
            ["Backtest vs holding", (r: SavedReport) => pct(r.backtest.excessPct)],
            ["Backtest max drawdown", (r: SavedReport) => pct(r.backtest.maxDrawdownPct)],
            ["Backtest fills", (r: SavedReport) => int(r.backtest.trades)],
            ["Paper return", (r: SavedReport) => (r.paper?.bars ? pct(r.paper.returnPct) : "—")],
            ["Paper decisions", (r: SavedReport) => (r.paper ? int(r.paper.bars) : "—")],
            ["Size / max position", (r: SavedReport) => `${bps(r.config.sizeBps)} / ${bps(r.config.limits.maxPositionBps)}`],
            ["Fee + slippage per fill", (r: SavedReport) => `${bps(r.config.feeBps)} + ${bps(r.config.slippageBps)}`],
          ].map(([k, f]) => (
            <div className="metric-row" key={k as string}>
              <span>{k as string}</span>
              {pair.map((r) => (
                <span key={r.id} className="v">{(f as (r: SavedReport) => string)(r)}</span>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="small" style={{ marginBottom: 16 }}>Tick two reports to compare them.</p>
      )}
      <div style={{ borderTop: "1px solid var(--ink)" }}>
        {list.map((r) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--line)" }} data-testid="saved-report">
            <input type="checkbox" aria-label="Compare" checked={cmp.includes(r.id)} onChange={(e) => setCmp((c) => (e.target.checked ? [...c, r.id].slice(-2) : c.filter((x) => x !== r.id)))} />
            <div style={{ minWidth: 0 }}>
              <b>{r.note || `${templateById(r.config.template)?.name} on ${r.config.asset}`}</b>
              <span className="small mono" style={{ display: "block", fontSize: 12 }}>
                saved {utc(r.savedAt, true)} · {r.backtestDays} d backtest {pct(r.backtest.returnPct)} (hold {pct(r.backtest.holdReturnPct)}) · paper {r.paper?.bars ? `${pct(r.paper.returnPct)} over ${int(r.paper.bars)} bars` : "none"} · {r.hash.slice(0, 10)}…
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link className="btn" href={`/evaluate?cfg=${encodeURIComponent(JSON.stringify(r.config))}&d=${r.backtestDays}${r.sessionId ? `&s=${r.sessionId}` : ""}`}>Open</Link>
              <button type="button" className="btn dashed" onClick={() => removeReport(r.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      <p className="small" style={{ marginTop: 16 }}>Saved numbers are the report at the moment you saved it; opening it reruns the same config on the bars available now.</p>
    </div>
  );
}
