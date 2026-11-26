"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import { CONTRACTS, registryLive } from "@/config/contracts";
import { explorerAddress, explorerTx } from "@/config/brand";
import { marketById } from "@/config/markets";
import { REGISTRY_ABI } from "@/lib/abi";
import { explain, read, simulate, waitForReceipt } from "@/lib/client";
import type { StrategyConfig } from "@/lib/engine/config";
import type { PaperSession, Report } from "@/lib/engine/report";
import { batchOf, ZERO32 } from "@/lib/engine/anchor";
import { BIT_WORDS, bitNames, loosens, SIDE_BUY, u16 } from "@/lib/engine/risk";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { utc } from "@/lib/format";

/*
 * On-chain side of a report (OrlunoLimitRegistry). Optional: the report never needs it.
 *   - Record: register the config hash + asset + feed + limits, or change the limits of a config you own (tightening applies now,
 *     loosening waits 24 h on chain).
 *   - Check: checkTrade() for the next buy this config would make, read against the live feed (a view: no transaction).
 *   - Anchor: the paper decisions after the last anchored batch, folded into one root and linked to the config's head.
 * Every transaction is simulated first (eth_call) so a refusal shows in plain words before the wallet opens.
 */

type ConfigView = { id: number; owner: string; configHash: string; version: number; retired: boolean; limits: StrategyConfig["limits"]; effective: StrategyConfig["limits"]; pending: { at: number } | null; head: string; lastTo: number; batches: number; decisions: number; asset: string };

export function ChainPanel({ cfg, hash, report, session }: { cfg: StrategyConfig; hash: string; report: Report | null; session: PaperSession | null }) {
  const { address, onChain, sendTransaction, switchNetwork } = useWallet();
  const { open } = useWalletModal();
  const [configs, setConfigs] = useState<ConfigView[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const [bits, setBits] = useState<string | null>(null);
  const market = marketById(cfg.asset)!;

  const load = useCallback(async () => {
    if (!registryLive() || !address) return;
    const r = await fetch(`/api/registry?owner=${address}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r?.configs) setConfigs(r.configs);
  }, [address]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const mine = configs.filter((c) => !c.retired && c.asset === market.token.toLowerCase());
  // The picked config, else the one recorded with these exact rules, else the newest for this asset (so editing a limit keeps it).
  const chosen = mine.find((c) => c.id === pick) ?? mine.find((c) => c.configHash === hash) ?? mine.at(-1) ?? null;

  // checkTrade for the next buy of this config (position = size, today's numbers 0).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with the URL, localStorage or a fetch result
    if (!chosen) return setBits(null);
    read<bigint>({ to: CONTRACTS.registry, abi: REGISTRY_ABI, fn: "checkTrade", args: [BigInt(chosen.id), { side: SIDE_BUY, positionAfterBps: u16(cfg.sizeBps), dayLossBps: 0, tradesToday: 0, slippageBps: u16(cfg.slippageBps) }] })
      .then((b) => setBits(b.toString()))
      .catch(() => setBits(null));
  }, [chosen, cfg.sizeBps, cfg.slippageBps]);

  if (!registryLive()) {
    return (
      <div className="box dash small" data-testid="chain-off">
        <b>On chain: not deployed yet.</b> OrlunoLimitRegistry has no address on this build, so configs and paper decisions stay in this browser. Everything else works.
      </div>
    );
  }

  const send = async (label: string, data: `0x${string}`) => {
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy(label);
    setMsg(null);
    try {
      await simulate(address, CONTRACTS.registry, data);
      const h = await sendTransaction({ to: CONTRACTS.registry, data });
      setTx(h);
      setMsg(`${label}: sent, waiting for the block…`);
      const rc = await waitForReceipt(h);
      setMsg(rc.ok ? `${label}: confirmed in block ${rc.blockNumber}.` : `${label}: the transaction reverted.`);
      await load();
    } catch (e) {
      setMsg(`${label}: ${explain(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const register = () => send("Record config", encodeFunctionData({ abi: REGISTRY_ABI, functionName: "register", args: [hash as `0x${string}`, market.token, market.feed, cfg.limits] }));
  const update = () => chosen && send(loosens(chosen.limits, cfg.limits) ? "Queue looser limits" : "Tighten limits", encodeFunctionData({ abi: REGISTRY_ABI, functionName: "setLimits", args: [BigInt(chosen.id), hash as `0x${string}`, cfg.limits] }));
  const pendingAnchor = chosen && report?.paper ? report.paper.decisions.filter((d) => d.t > chosen.lastTo) : [];
  const batch = pendingAnchor.length ? batchOf(pendingAnchor) : null;
  const anchor = () =>
    chosen && batch && send("Anchor paper decisions", encodeFunctionData({ abi: REGISTRY_ABI, functionName: "anchorBatch", args: [BigInt(chosen.id), BigInt(batch.fromTs), BigInt(batch.toTs), batch.decisions, batch.trades, batch.root, (chosen.head || ZERO32) as `0x${string}`] }));

  return (
    <div className="box" style={{ display: "grid", gap: 10 }} data-testid="chain-panel">
      <span className="flab" style={{ margin: 0 }}>On chain · OrlunoLimitRegistry</span>
      <a className="mono small" href={explorerAddress(CONTRACTS.registry)} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, overflowWrap: "anywhere" }}>
        {CONTRACTS.registry}
      </a>
      {!address ? (
        <button type="button" className="btn solid" onClick={open} data-testid="chain-connect">Connect to record limits</button>
      ) : (
        <>
          {mine.length ? (
            <select className="inp" value={chosen?.id ?? ""} onChange={(e) => setPick(Number(e.target.value))} data-testid="chain-config">
              {mine.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} · v{c.version} · {c.configHash === hash ? "same rules" : "other rules"}
                </option>
              ))}
            </select>
          ) : (
            <p className="small" style={{ margin: 0 }}>No config of yours for {market.id} yet.</p>
          )}
          {chosen ? (
            <div className="small mono" style={{ fontSize: 11.5 }} data-testid="chain-config-info">
              <div>batches {chosen.batches} · decisions {chosen.decisions}{chosen.lastTo ? ` · last ${utc(chosen.lastTo)}` : ""}</div>
              {chosen.pending ? <div>looser limits wait until {utc(chosen.pending.at)}</div> : null}
              <div data-testid="chain-check">
                next buy: {bits === null ? "…" : bits === "0" ? "inside every limit" : bitNames(BigInt(bits)).map((n) => BIT_WORDS[n].label).join(", ")}
              </div>
            </div>
          ) : null}
          <button type="button" className="btn solid" disabled={!!busy} onClick={register} data-testid="chain-register">Record this config</button>
          {chosen ? (
            <button type="button" className="btn" disabled={!!busy || chosen.configHash === hash} onClick={update} data-testid="chain-update">
              {chosen.configHash === hash ? "Limits recorded" : loosens(chosen.limits, cfg.limits) ? "Queue looser limits (24 h)" : "Apply stricter limits now"}
            </button>
          ) : null}
          {chosen && session ? (
            <button type="button" className="btn" disabled={!!busy || !batch || chosen.configHash !== hash} onClick={anchor} data-testid="chain-anchor">
              {batch ? `Anchor ${batch.decisions} paper decisions` : "No new paper decisions"}
            </button>
          ) : null}
        </>
      )}
      {msg ? <p className="small" role="status" style={{ margin: 0 }} data-testid="chain-msg">{msg}</p> : null}
      {tx ? <a className="small mono" href={explorerTx(tx)} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>last tx {tx.slice(0, 12)}…</a> : null}
    </div>
  );
}
