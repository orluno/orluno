// verify-lib against a fake chain built from this build's artifacts: a true deployment matches; a foreign runtime, a wrong chain,
// extra constructor bytes, a missing tx, a failed tx or a tx for another address each fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { match, verifyDeployment } from "./verify-lib.mjs";

const ART = JSON.parse(readFileSync(new URL("../src/lib/contracts/artifacts.json", import.meta.url), "utf8")).contracts;
const A = (n) => "0x" + n.toString(16).padStart(40, "0");
const REG = A(0x0f11);
const TX1 = "0x" + "01".repeat(32);
const R = ART.OrlunoLimitRegistry;

function chain(over = {}) {
  const codes = { [REG]: R.runtime, ...over.codes };
  const txs = { [TX1]: { input: over.input ?? R.creation, to: over.to ?? null, created: over.created ?? REG, status: over.status ?? "0x1" } };
  return async (method, params) => {
    if (over.down) throw new Error("down");
    if (method === "eth_chainId") return over.chainId ?? "0x1237";
    if (method === "eth_getCode") return codes[params[0].toLowerCase()] ?? "0x";
    if (method === "eth_getTransactionByHash") return txs[params[0]] ? { input: txs[params[0]].input, to: txs[params[0]].to } : null;
    if (method === "eth_getTransactionReceipt") return txs[params[0]] ? { status: txs[params[0]].status, contractAddress: txs[params[0]].created } : null;
    throw new Error(`unexpected ${method}`);
  };
}
const run = (over = {}, args = {}) => verifyDeployment({ registry: REG, registryTx: TX1, rpc: chain(over), ART, ...args });

test("the registry has no immutables and matches its own runtime", () => {
  assert.equal(R.immutables.length, 0);
  assert.ok(match(ART, R.runtime));
  assert.equal(match(ART, R.runtime.slice(0, -2) + "00"), false);
});

test("a true deployment matches", async () => {
  const r = await run();
  assert.equal(r.ok, true, r.lines.join("\n"));
});

test("every way to be wrong fails", async () => {
  assert.equal((await run({ chainId: "0x1" })).ok, false);
  assert.equal((await run({ codes: { [REG]: "0x6000" } })).ok, false);
  assert.equal((await run({ codes: { [REG]: "0x" } })).ok, false);
  assert.equal((await run({ input: R.creation + "00".repeat(32) })).ok, false);
  assert.equal((await run({ created: A(9) })).ok, false);
  assert.equal((await run({ status: "0x0" })).ok, false);
  assert.equal((await run({ to: A(5) })).ok, false);
  assert.equal((await run({}, { registryTx: undefined })).ok, false);
  assert.equal((await run({}, { registry: "nope" })).ok, false);
  assert.equal((await run({ down: true })).ok, false);
});
