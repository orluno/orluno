"use client";

import { useEffect, useState } from "react";
import { CONTRACTS, registryLive } from "@/config/contracts";
import { explorerAddress, explorerTx } from "@/config/brand";
import { MARKETS } from "@/config/markets";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { DEFAULT_LIMITS } from "@/lib/engine/config";
import { BIT_WORDS, BITS, bitNames, checkLimits, SIDE_BUY, SIDE_SELL, type Limits } from "@/lib/engine/risk";
import { bps, int, utc } from "@/lib/format";

type Cfg = { id: number; owner: string; asset: string; version: number; retired: boolean; configHash: string; limits: Limits; effective: Limits; pending: { at: number; limits: Limits } | null; batches: number; decisions: number; trades: number; lastTo: number; head: string };
type Ev = { name: string; id: number; block: number; tx: string; args: Record<string, unknown> };
type Answer = { deployed: boolean; configs: Cfg[]; events: Ev[]; scanned: { complete: boolean; gaps: [number, number][] } | null; error?: string };

const assetName = (a: string) => MARKETS.find((m) => m.token === a.toLowerCase())?.id ?? `${a.slice(0, 8)}…`;
const limitText = (l: Limits) => `position ${bps(l.maxPositionBps)} · daily loss ${bps(l.maxDailyLossBps)} · ${l.maxTradesPerDay} trades/day · slippage ${bps(l.maxSlippageBps)} · price age ${Math.round(l.maxPriceAge / 60)} min`;

/* The limit check playground (runs the registry's rules here) and, once deployed, the configs and history of a wallet or id. */
export function LimitsApp() {
  const { address } = useWallet();
  const { open } = useWalletModal();
  const [lim, setLim] = useState<Limits>(DEFAULT_LIMITS);
  const [t, setT] = useState({ side: SIDE_BUY, positionAfterBps: 5_000, dayLossBps: 0, tradesToday: 0, slippageBps: 10 });
  const [q, setQ] = useState("");
  const [ans, setAns] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const bits = checkLimits(lim, t);

  const lookup = async (query: string) => {
    if (!registryLive()) return;
    setBusy(true);
    const p = /^0x[0-9a-fA-F]{40}$/.test(query) ? `owner=${query}` : /^\d+$/.test(query) ? `id=${query}` : null;
    if (!p) {
      setAns({ deployed: true, configs: [], events: [], scanned: null, error: "Give a wallet address or a config number." });
      setBusy(false);
      return;
    }
    const r = await fetch(`/api/registry?${p}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ error: "The registry could not be read." }));
    setAns(r);
    setBusy(false);
  };
  useEffect(() => {
    if (address && !q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ(address);
      lookup(address);
    }
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  return (
    <div className="wrap" style={{ marginTop: 48 }}>
      <div className="grid-main" style={{ rowGap: 32 }}>
        <div>
          <h2 className="hd-3">Try the limit check.</h2>
          <p className="body">The same rules the report applies before every fill and the registry applies in checkTrade(). Sells are never refused for size, daily loss or trade count, so a limit can never trap a position.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginTop: 16 }}>
            {(
              [
                ["Max position (bps)", "maxPositionBps"],
                ["Max daily loss (bps)", "maxDailyLossBps"],
                ["Max trades a day", "maxTradesPerDay"],
                ["Max slippage (bps)", "maxSlippageBps"],
              ] as const
            ).map(([label, k]) => (
              <label key={k}>
                <span className="flab">{label}</span>
                <input className="inp" type="number" value={lim[k]} onChange={(e) => setLim({ ...lim, [k]: num(e.target.value) })} data-testid={`pg-${k}`} />
              </label>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginTop: 12 }}>
            <label>
              <span className="flab">Side</span>
              <select className="inp" value={t.side} onChange={(e) => setT({ ...t, side: Number(e.target.value) })} data-testid="pg-side">
                <option value={SIDE_BUY}>Buy</option>
                <option value={SIDE_SELL}>Sell</option>
              </select>
            </label>
            {(
              [
                ["Position after (bps)", "positionAfterBps"],
                ["Loss today (bps)", "dayLossBps"],
                ["Trades today", "tradesToday"],
                ["Slippage (bps)", "slippageBps"],
              ] as const
            ).map(([label, k]) => (
              <label key={k}>
                <span className="flab">{label}</span>
                <input className="inp" type="number" value={t[k]} onChange={(e) => setT({ ...t, [k]: num(e.target.value) })} data-testid={`pg-${k}`} />
              </label>
            ))}
          </div>
          <div className={bits ? "box dash" : "box"} style={{ marginTop: 16 }} data-testid="pg-result">
            <span className="flab">checkLimits → {bits}</span>
            {bits ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {bitNames(bits).map((n) => (
                  <li key={n}>
                    <b>{BIT_WORDS[n].label}</b> (bit {Math.log2(BITS[n])}): {BIT_WORDS[n].text}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0 }}>Inside every limit.</p>
            )}
          </div>
        </div>
        <div className="rail-col keep" />
      </div>

      <div style={{ marginTop: 96 }}>
        <h2 className="hd-3">Configs on chain.</h2>
        {!registryLive() ? (
          <div className="box dash" style={{ marginTop: 16 }} data-testid="limits-off">
            OrlunoLimitRegistry is not deployed yet. Once the owner deploys it, any wallet can record a config hash with its limits here, and anyone can look a config up by number.
          </div>
        ) : (
          <>
            <p className="body">
              Registry <a href={explorerAddress(CONTRACTS.registry)} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 13, overflowWrap: "anywhere" }}>{CONTRACTS.registry}</a>
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                lookup(q.trim());
              }}
              style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 760 }}
            >
              <input className="inp" style={{ flex: 1, minWidth: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="0x… wallet or config number" aria-label="Wallet or config number" data-testid="limits-q" />
              <button type="submit" className="btn solid" disabled={busy}>Look up</button>
              {!address ? <button type="button" className="btn" onClick={open}>Use my wallet</button> : null}
            </form>
            {ans?.error ? <p className="err">{ans.error}</p> : null}
            {ans?.configs?.length ? (
              <div style={{ marginTop: 24, display: "grid", gap: 16 }} data-testid="limits-configs">
                {ans.configs.map((c) => (
                  <div key={c.id} className="doc">
                    <div className="doc-head">
                      <span className="k">#{c.id}</span>
                      <span className="path">{assetName(c.asset)} · v{c.version} · {c.configHash.slice(0, 18)}…{c.retired ? " · retired" : ""}</span>
                    </div>
                    <div style={{ padding: 14 }} className="small">
                      <div>In force: {limitText(c.effective)}</div>
                      {c.pending ? <div>Looser limits queued until {utc(c.pending.at)}: {limitText(c.pending.limits)}</div> : null}
                      <div>Anchored: {int(c.batches)} batches · {int(c.decisions)} decisions · {int(c.trades)} trades{c.lastTo ? ` · up to ${utc(c.lastTo)}` : ""}</div>
                      <div className="mono" style={{ fontSize: 11, overflowWrap: "anywhere" }}>head {c.head}</div>
                    </div>
                  </div>
                ))}
                <div>
                  <h3 className="hd-4">History from the registry&apos;s logs</h3>
                  {ans.events.map((e) => (
                    <div key={`${e.tx}${e.name}${e.block}`} className="dec" style={{ gridTemplateColumns: "120px 170px minmax(0,1fr)" }}>
                      <span className="t">block {int(e.block)}</span>
                      <span className="act">{e.name}</span>
                      <a className="why mono" style={{ fontSize: 12 }} href={explorerTx(e.tx)} target="_blank" rel="noreferrer">#{e.id} · {e.tx.slice(0, 14)}…</a>
                    </div>
                  ))}
                  {ans.scanned && !ans.scanned.complete ? <p className="err">Some block ranges could not be read: {ans.scanned.gaps.map((g) => g.join("–")).join(", ")}.</p> : null}
                </div>
              </div>
            ) : ans && !ans.error ? (
              <p className="small" style={{ marginTop: 16 }}>No configs found.</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
