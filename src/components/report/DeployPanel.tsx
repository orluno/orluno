"use client";

import { useState } from "react";
import ART from "@/lib/contracts/artifacts.json";
import { CHAIN, explorerAddress, explorerTx } from "@/config/brand";
import { CONTRACTS, registryLive } from "@/config/contracts";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { explain, waitForReceipt } from "@/lib/client";

/*
 * Sends the creation transaction of OrlunoLimitRegistry from the owner's wallet (no constructor arguments). Then: paste the
 * address, block and tx into src/config/contracts.ts, run verify-deployment, verify on Blockscout, and delete this page.
 */
export function DeployPanel() {
  const { address, onChain, chainId, sendTransaction, switchNetwork } = useWallet();
  const { open } = useWalletModal();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [out, setOut] = useState<{ address: string; tx: string; block: number } | null>(null);
  const a = ART.contracts.OrlunoLimitRegistry;

  const deploy = async () => {
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy(true);
    setMsg("Confirm the deployment in your wallet…");
    try {
      const tx = await sendTransaction({ data: a.creation });
      setMsg("Sent, waiting for the block…");
      const rc = await waitForReceipt(tx, 300_000);
      if (!rc.ok || !rc.contractAddress) throw new Error("The deployment reverted.");
      setOut({ address: rc.contractAddress, tx, block: rc.blockNumber });
      setMsg("Deployed.");
    } catch (e) {
      setMsg(explain(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid-main" style={{ rowGap: 24 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <p className="body">
          Chain: {CHAIN.name} ({CHAIN.id}) · wallet chain {chainId ?? "—"} · build sha256 {a.sha256.slice(0, 16)}… · {(a.creation.length - 2) / 2} bytes, no constructor arguments.
        </p>
        {registryLive() ? <p className="note">This build already points at {CONTRACTS.registry}.</p> : null}
        <button type="button" className="cut" onClick={deploy} disabled={busy} data-testid="deploy-registry">
          <span className="face">{address ? "Deploy OrlunoLimitRegistry" : "Connect wallet"}</span>
        </button>
        {msg ? <p className="small" role="status" data-testid="deploy-msg">{msg}</p> : null}
        {out ? (
          <div className="box mono" style={{ fontSize: 13, overflowWrap: "anywhere" }} data-testid="deploy-out">
            <div>registry: <a href={explorerAddress(out.address)} target="_blank" rel="noreferrer">{out.address}</a></div>
            <div>block: {out.block}</div>
            <div>tx: <a href={explorerTx(out.tx)} target="_blank" rel="noreferrer">{out.tx}</a></div>
            <p className="small" style={{ marginTop: 12 }}>
              Next: put these three values in src/config/contracts.ts (DEPLOYED), run npm run verify-deployment -- --registry {out.address} --registry-tx {out.tx}, then verify the source on Blockscout.
            </p>
          </div>
        ) : null}
      </div>
      <div />
    </div>
  );
}
