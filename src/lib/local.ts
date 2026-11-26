"use client";

/*
 * What Orluno keeps in this browser (and nowhere else): paper sessions, saved reports and the "seen live" log of paper decisions.
 * Every read and write is wrapped: a private window or blocked storage only means nothing is remembered.
 * A paper session stores its config and start time only; its decisions are recomputed from the feed rounds on every visit,
 * and the seen-live log records which of them this browser saw within two hours of the bar close.
 */
import { storageKey } from "@/config/storage";
import { parseConfig, configHash, type StrategyConfig } from "@/lib/engine/config";
import type { PaperSession } from "@/lib/engine/report";
import type { Metrics } from "@/lib/engine/simulate";

const K_SESSIONS = storageKey("sessions");
const K_REPORTS = storageKey("reports");
const K_SEEN = (id: string) => storageKey("seen", id);

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event("ol-local"));
    return true;
  } catch {
    return false;
  }
}

export function loadSessions(): PaperSession[] {
  const raw = readJson<unknown[]>(K_SESSIONS, []);
  const out: PaperSession[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const s = r as Partial<PaperSession>;
    const cfg = parseConfig(s.config);
    if (!cfg || typeof s.id !== "string" || typeof s.startedAt !== "number") continue;
    out.push({ id: s.id.slice(0, 40), config: cfg, hash: configHash(cfg), startedAt: Math.floor(s.startedAt), label: String(s.label ?? "").slice(0, 80) });
  }
  return out;
}

export function startSession(cfg: StrategyConfig, label: string): PaperSession | null {
  const s: PaperSession = { id: `p${Date.now().toString(36)}`, config: cfg, hash: configHash(cfg), startedAt: Math.floor(Date.now() / 1000), label };
  const all = [s, ...loadSessions()].slice(0, 30);
  return writeJson(K_SESSIONS, all) ? s : null;
}

export function removeSession(id: string) {
  writeJson(K_SESSIONS, loadSessions().filter((s) => s.id !== id));
  try {
    localStorage.removeItem(K_SEEN(id));
  } catch {
    // nothing stored
  }
}

/** Bar times this browser saw decided while the bar was fresh (within 2 hours of its close). */
export function loadSeen(id: string): Record<string, number> {
  const v = readJson<Record<string, number>>(K_SEEN(id), {});
  return v && typeof v === "object" ? v : {};
}
export function markSeen(id: string, barTimes: number[], now = Math.floor(Date.now() / 1000)) {
  const seen = loadSeen(id);
  let changed = false;
  for (const t of barTimes) {
    if (seen[t] || now - t > 7_200 || now < t) continue;
    seen[t] = now;
    changed = true;
  }
  if (changed) writeJson(K_SEEN(id), seen);
  return seen;
}

export type SavedReport = {
  id: string;
  savedAt: number;
  hash: string;
  config: StrategyConfig;
  backtestDays: number;
  sessionId: string | null;
  paperStart: number | null;
  backtest: Metrics;
  paper: Metrics | null;
  note: string;
};

export function loadReports(): SavedReport[] {
  const raw = readJson<unknown[]>(K_REPORTS, []);
  const out: SavedReport[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const s = r as Partial<SavedReport>;
    const cfg = parseConfig(s.config);
    if (!cfg || typeof s.id !== "string" || !s.backtest) continue;
    out.push({ ...(s as SavedReport), config: cfg, hash: configHash(cfg), note: String(s.note ?? "").slice(0, 200) });
  }
  return out;
}
export function saveReport(r: Omit<SavedReport, "id" | "savedAt">): SavedReport | null {
  const full: SavedReport = { ...r, id: `r${Date.now().toString(36)}`, savedAt: Math.floor(Date.now() / 1000) };
  return writeJson(K_REPORTS, [full, ...loadReports()].slice(0, 60)) ? full : null;
}
export function removeReport(id: string) {
  writeJson(K_REPORTS, loadReports().filter((r) => r.id !== id));
}
