"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MARKETS, marketById } from "@/config/markets";
import { TEMPLATES, templateById, defaults, type TemplateId } from "@/lib/engine/templates";
import { checkConfig, configHash, defaultConfig, parseConfig, type StrategyConfig } from "@/lib/engine/config";
import { buildReport, BACKTEST_DAYS, HOUSE_START, type PaperSession, type Report } from "@/lib/engine/report";
import type { Bar } from "@/lib/engine/bars";
import { loadSessions, loadSeen, markSeen, removeSession, saveReport, startSession } from "@/lib/local";
import { ReportView } from "@/components/report/ReportView";
import { ChainPanel } from "@/components/report/ChainPanel";
import { CopyChip } from "@/components/site/CaCopy";
import { age, int, utc } from "@/lib/format";

/*
 * The report builder. Everything runs in this browser: the bars come from /api/history (Chainlink rounds on Robinhood Chain), the
 * engine in src/lib/engine runs the backtest and the paper session with the same config, and sessions / saved reports stay in
 * localStorage. Refreshes the bars every minute while the tab is visible, so paper decisions appear as hours close.
 */

type HistoryAnswer = { asset: string; feed: string; bars: [number, string, number][]; latest: { round: number; answer: string; updatedAt: number } | null; live: { rounds: number; readAt: number | null; phaseChanged: boolean }; snapshot: { block: number; rounds: number } };
type ProofAnswer = { proofs: { id: string; proven: boolean; inList: boolean; codeHash: boolean | null; beacon: boolean | null; supply: string | null; method: string }[]; readAt: number };

const HOUSE: PaperSession = { id: "house", config: defaultConfig("trend", "ETH"), hash: configHash(defaultConfig("trend", "ETH")), startedAt: HOUSE_START, label: "House session · Trend cross on ETH", house: true };

const pctIn = (bps: number) => +(bps / 100).toFixed(2);
const toBps = (v: string) => Math.round(Number(v) * 100);

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span className="flab">{label}</span>
      {children}
      {hint ? <span className="hint" style={{ display: "block" }}>{hint}</span> : null}
    </label>
  );
}

function Step({ n, title, children, aside }: { n: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid var(--ink)", padding: "20px 0 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span className="lbl">{n}</span>
        <h2 className="hd-4">{title}</h2>
        {aside ? <span style={{ marginLeft: "auto" }}>{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function EvaluateApp() {
  const params = useSearchParams();
  const router = useRouter();
  const [cfg, setCfg] = useState<StrategyConfig>(() => defaultConfig());
  const [days, setDays] = useState<number>(30);
  const [sessions, setSessions] = useState<PaperSession[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [hist, setHist] = useState<HistoryAnswer | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [proof, setProof] = useState<ProofAnswer | null>(null);
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const boot = useRef(false);

  // Read the URL once: ?t=<template>&a=<asset>, or ?cfg=<json> from a saved report.
  useEffect(() => {
    if (boot.current) return;
    boot.current = true;
    const list = loadSessions();
    setSessions(list);
    const raw = params.get("cfg");
    const fromCfg = raw ? parseConfig((() => { try { return JSON.parse(raw); } catch { return null; } })()) : null;
    const t = templateById(params.get("t") ?? "");
    const a = marketById(params.get("a") ?? "");
    const d = Number(params.get("d"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with the URL, localStorage or a fetch result
    if (BACKTEST_DAYS.includes(d as never)) setDays(d);
    const sid = params.get("s");
    if (sid === "house") {
      setCfg(HOUSE.config);
      setSessionId("house");
    } else if (sid && list.some((s) => s.id === sid)) {
      const s = list.find((x) => x.id === sid)!;
      setCfg(s.config);
      setSessionId(s.id);
    } else if (fromCfg) setCfg(fromCfg);
    else if (t || a) setCfg(defaultConfig((t?.id ?? "trend") as TemplateId, a?.id ?? "ETH"));
  }, [params]);

  const allSessions = useMemo(() => [HOUSE, ...sessions], [sessions]);
  const session = allSessions.find((s) => s.id === sessionId) ?? null;
  const hash = useMemo(() => configHash(cfg), [cfg]);
  const problems = useMemo(() => checkConfig(cfg), [cfg]);
  const sameRules = session ? session.hash === hash : false;

  // Bars of the chosen asset, refreshed every minute while visible.
  const load = useCallback(async (asset: string) => {
    try {
      const res = await fetch(`/api/history?asset=${asset}`, { cache: "no-store" });
      const body = (await res.json()) as HistoryAnswer & { error?: string };
      if (!res.ok || !Array.isArray(body.bars)) throw new Error(body.error ?? `HTTP ${res.status}`);
      setHist(body);
      setBars(body.bars.map(([t, answer, round]) => ({ t, answer, round, close: Number(BigInt(answer)) / 1e8, age: 0 })));
      setLoadErr(null);
      setNow(Math.floor(Date.now() / 1000));
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "The price history could not be loaded.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with the URL, localStorage or a fetch result
    setBars(null);
    load(cfg.asset);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load(cfg.asset);
    }, 60_000);
    return () => clearInterval(id);
  }, [cfg.asset, load]);
  useEffect(() => {
    fetch("/api/proof").then((r) => (r.ok ? r.json() : null)).then((p) => p && setProof(p)).catch(() => {});
  }, []);

  const report: Report | null = useMemo(() => {
    if (!bars || problems.length) return null;
    return buildReport(cfg, bars, { backtestDays: days, paperStart: session && sameRules ? session.startedAt : null, now });
  }, [bars, cfg, days, session, sameRules, problems.length, now]);

  // Paper decisions seen while fresh are logged as "seen live".
  useEffect(() => {
    if (!session || !report?.paper) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with the URL, localStorage or a fetch result
    setSeen(markSeen(session.id, report.paper.decisions.map((d) => d.t)));
  }, [session, report]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with the URL, localStorage or a fetch result
    setSeen(session ? loadSeen(session.id) : {});
  }, [session]);

  // Keep the URL shareable (template, asset, window, session).
  useEffect(() => {
    if (!boot.current) return;
    const q = new URLSearchParams();
    q.set("t", cfg.template);
    q.set("a", cfg.asset);
    q.set("d", String(days));
    if (sessionId) q.set("s", sessionId);
    router.replace(`/evaluate?${q.toString()}`, { scroll: false });
  }, [cfg.template, cfg.asset, days, sessionId, router]);

  const tpl = templateById(cfg.template)!;
  const set = (patch: Partial<StrategyConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const setLimit = (k: keyof StrategyConfig["limits"], v: number) => setCfg((c) => ({ ...c, limits: { ...c.limits, [k]: v } }));
  const assetProof = proof?.proofs.find((p) => p.id === cfg.asset) ?? null;
  const market = marketById(cfg.asset)!;

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div className="wrap" style={{ paddingTop: 24 }}>
      <div className="grid-main" style={{ rowGap: 24 }}>
        {/* ---------------- builder ---------------- */}
        <div data-testid="builder">
          <Step n="01" title="Strategy block">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 4 }} role="radiogroup" aria-label="Strategy template">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={cfg.template === t.id}
                  onClick={() => set({ template: t.id, params: defaults(t) })}
                  className={cfg.template === t.id ? "bar-b" : "bar-b o"}
                  style={{ display: "block", textAlign: "left", padding: "12px 14px", cursor: "pointer", border: "1px solid var(--ink)" }}
                  data-testid={`tpl-${t.id}`}
                >
                  <span className="t" style={{ fontSize: 16, display: "block" }}>{t.name}</span>
                  <span style={{ fontSize: 12.5, lineHeight: "17px", display: "block", marginTop: 4, opacity: 0.85 }}>{t.short}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
              <div className="box dash" style={{ padding: 12 }}>
                <span className="flab">Entry block</span>
                <span className="mono" style={{ fontSize: 13 }}>{tpl.entryBlock}</span>
              </div>
              <div className="box dash" style={{ padding: 12 }}>
                <span className="flab">Exit block</span>
                <span className="mono" style={{ fontSize: 13 }}>{tpl.exitBlock}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 16 }}>
              {tpl.params.map((p) => (
                <Field key={p.key} label={`${p.label} (${p.unit === "bars" ? "hourly bars" : p.unit === "%" ? "%" : "level"})`} hint={p.help}>
                  <input className="inp" type="number" min={p.min} max={p.max} step={p.step} value={cfg.params[p.key]} onChange={(e) => set({ params: { ...cfg.params, [p.key]: Number(e.target.value) } })} data-testid={`param-${p.key}`} />
                </Field>
              ))}
            </div>
          </Step>

          <Step n="02" title="Asset" aside={assetProof ? <span className={`badge ${assetProof.proven ? "solid" : "dash"}`} title={assetProof.method}>{assetProof.proven ? "proven on chain" : "not proven"}</span> : <span className="badge dash">checking…</span>}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
              <Field label="Asset on Robinhood Chain">
                <select className="inp" value={cfg.asset} onChange={(e) => set({ asset: e.target.value })} data-testid="asset">
                  {MARKETS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} · {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="small mono" style={{ fontSize: 12, lineHeight: "18px", alignSelf: "end" }}>
                <div>token {market.token.slice(0, 8)}…{market.token.slice(-6)}</div>
                <div>feed {market.feedDescription} · {market.hours}</div>
                {hist?.latest ? <div>last answer {(Number(BigInt(hist.latest.answer)) / 1e8).toLocaleString("en-US")} · round {int(hist.latest.round)} · {age(now - hist.latest.updatedAt)} old</div> : null}
              </div>
            </div>
            {assetProof && !assetProof.proven ? <p className="err" style={{ marginTop: 10 }}>This token did not pass every identity check just now ({assetProof.method}). The report still runs on its feed, but treat the asset as unproven.</p> : null}
            {market.kind === "stock" ? <p className="hint">Stock tokens are tokens on Robinhood Chain, not the shares. Their feed follows US market hours (24 hours on weekdays); weekend hours have no bars.</p> : null}
          </Step>

          <Step n="03" title="Size and exits">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <Field label="Position size (% of equity)" hint="Each buy uses this share of current equity.">
                <input className="inp" type="number" min={1} max={100} step={1} value={pctIn(cfg.sizeBps)} onChange={(e) => set({ sizeBps: toBps(e.target.value) })} data-testid="size" />
              </Field>
              <Field label="Stop loss (%)" hint="0 = off. From the entry fill.">
                <input className="inp" type="number" min={0} max={50} step={0.5} value={pctIn(cfg.stopLossBps)} onChange={(e) => set({ stopLossBps: toBps(e.target.value) })} data-testid="stop" />
              </Field>
              <Field label="Take profit (%)" hint="0 = off.">
                <input className="inp" type="number" min={0} max={100} step={0.5} value={pctIn(cfg.takeProfitBps)} onChange={(e) => set({ takeProfitBps: toBps(e.target.value) })} data-testid="target" />
              </Field>
              <Field label="Paper money (USD)">
                <input className="inp" type="number" min={100} max={10000000} step={100} value={cfg.startCash} onChange={(e) => set({ startCash: Number(e.target.value) })} />
              </Field>
            </div>
          </Step>

          <Step n="04" title="Risk limits" aside={<span className="badge">same rules as the registry</span>}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <Field label="Max position (%)" hint="A buy above it is refused.">
                <input className="inp" type="number" min={0.01} max={100} step={1} value={pctIn(cfg.limits.maxPositionBps)} onChange={(e) => setLimit("maxPositionBps", toBps(e.target.value))} data-testid="lim-pos" />
              </Field>
              <Field label="Max daily loss (%)" hint="No new buys for the rest of the UTC day.">
                <input className="inp" type="number" min={0.01} max={100} step={0.5} value={pctIn(cfg.limits.maxDailyLossBps)} onChange={(e) => setLimit("maxDailyLossBps", toBps(e.target.value))} data-testid="lim-loss" />
              </Field>
              <Field label="Max trades a day" hint="Buys stop once reached; sells never.">
                <input className="inp" type="number" min={1} max={96} step={1} value={cfg.limits.maxTradesPerDay} onChange={(e) => setLimit("maxTradesPerDay", Math.round(Number(e.target.value)))} data-testid="lim-trades" />
              </Field>
              <Field label="Max slippage (%)" hint="Above it, every fill is refused.">
                <input className="inp" type="number" min={0} max={10} step={0.05} value={pctIn(cfg.limits.maxSlippageBps)} onChange={(e) => setLimit("maxSlippageBps", toBps(e.target.value))} data-testid="lim-slip" />
              </Field>
              <Field label="Max price age (hours)" hint="Used by checkTrade on chain.">
                <input className="inp" type="number" min={0.02} max={168} step={1} value={+(cfg.limits.maxPriceAge / 3600).toFixed(2)} onChange={(e) => setLimit("maxPriceAge", Math.round(Number(e.target.value) * 3600))} data-testid="lim-age" />
              </Field>
            </div>
          </Step>

          <Step n="05" title="Costs per fill">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <Field label="Fee (%)" hint="Charged on every buy and every sell.">
                <input className="inp" type="number" min={0} max={5} step={0.05} value={pctIn(cfg.feeBps)} onChange={(e) => set({ feeBps: toBps(e.target.value) })} data-testid="fee" />
              </Field>
              <Field label="Slippage (%)" hint="Buys fill above the close, sells below.">
                <input className="inp" type="number" min={0} max={10} step={0.05} value={pctIn(cfg.slippageBps)} onChange={(e) => set({ slippageBps: toBps(e.target.value) })} data-testid="slip" />
              </Field>
            </div>
          </Step>

          <Step n="06" title="Windows">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end" }}>
              <div>
                <span className="flab">Backtest window</span>
                <div className="seg" role="group" aria-label="Backtest window">
                  {BACKTEST_DAYS.map((d) => (
                    <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} data-testid={`days-${d}`}>
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ minWidth: 260, flex: 1 }}>
                <span className="flab">Paper session</span>
                <select
                  className="inp"
                  value={sessionId}
                  onChange={(e) => {
                    const s = allSessions.find((x) => x.id === e.target.value);
                    setSessionId(e.target.value);
                    if (s) setCfg(s.config);
                  }}
                  data-testid="session"
                >
                  <option value="">No paper session</option>
                  {allSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} · since {utc(s.startedAt)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn solid"
                disabled={problems.length > 0}
                onClick={() => {
                  const s = startSession(cfg, `${tpl.name} on ${cfg.asset}`);
                  if (!s) return flash("This browser refused to store the session (private window or blocked storage).");
                  setSessions(loadSessions());
                  setSessionId(s.id);
                  flash("Paper session started. Decisions appear as hourly bars close after this moment.");
                }}
                data-testid="start-paper"
              >
                Start paper session with these rules
              </button>
              {session && !session.house ? (
                <button
                  type="button"
                  className="btn dashed"
                  onClick={() => {
                    removeSession(session.id);
                    setSessions(loadSessions());
                    setSessionId("");
                  }}
                >
                  Delete session
                </button>
              ) : null}
            </div>
            {session && !sameRules ? (
              <p className="err" style={{ marginTop: 12 }} data-testid="rules-changed">
                The rules differ from this paper session&apos;s rules, so the paper side is empty. Start a new session with these rules, or pick the session again to restore its rules.
              </p>
            ) : null}
          </Step>
          {problems.length ? (
            <div className="box" style={{ borderColor: "var(--bad)" }} role="alert" data-testid="problems">
              {problems.map((p) => (
                <p key={p} className="err" style={{ margin: "2px 0" }}>{p}</p>
              ))}
            </div>
          ) : null}
        </div>

        {/* ---------------- right rail ---------------- */}
        <aside className="rail-col keep">
          <div style={{ position: "sticky", top: 120, display: "grid", gap: 14 }}>
            <div>
              <span className="flab">Config hash</span>
              <CopyChip value={hash} head={10} tail={6} />
              <p className="hint">keccak256 of the config. Backtest, paper session and the on-chain record all carry it.</p>
            </div>
            <div className="mono small" style={{ fontSize: 12 }} data-testid="data-status">
              {loadErr ? <span className="err">History: {loadErr}</span> : hist ? `${int(hist.bars.length)} hourly bars · ${int(hist.snapshot.rounds + hist.live.rounds)} rounds` : "Loading bars…"}
              {hist?.live.phaseChanged ? <span className="err"> · the feed moved to a new phase: newer rounds are not mixed in</span> : null}
            </div>
            <button
              type="button"
              className="cut wide"
              disabled={!report}
              onClick={() => {
                if (!report) return;
                const r = saveReport({ hash, config: cfg, backtestDays: days, sessionId: session && sameRules ? session.id : null, paperStart: report.paperStart, backtest: report.backtest.metrics, paper: report.paper?.metrics ?? null, note: `${tpl.name} on ${cfg.asset}` });
                flash(r ? "Saved in this browser. Open /reports to compare." : "This browser refused to store the report.");
              }}
              data-testid="save-report"
            >
              <span className="face">Save this report</span>
            </button>
            {msg ? <p className="note" role="status" data-testid="flash">{msg}</p> : null}
            <ChainPanel cfg={cfg} hash={hash} report={report} session={session && sameRules ? session : null} />
          </div>
        </aside>
      </div>

      {report ? <ReportView report={report} seen={seen} session={session && sameRules ? session : null} now={now} /> : !problems.length ? <p className="small" style={{ marginTop: 40 }}>{loadErr ? "No report without the price history." : "Running the report…"}</p> : null}
    </div>
  );
}
