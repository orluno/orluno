import "server-only";
import { history } from "@/lib/server/rounds";
import { defaultConfig } from "@/lib/engine/config";
import { buildReport, HOUSE_START } from "@/lib/engine/report";
import type { Bar } from "@/lib/engine/bars";
import { marketById } from "@/config/markets";

/*
 * The house report shown on the home page: Trend cross on ETH with the default settings, a 30-day backtest before the house paper
 * start (25 Nov 2026 18:00 UTC) and the paper decisions since. Computed on the server from the same feed rounds the builder uses.
 */
export async function houseReport() {
  const h = await history("ETH");
  if (!h) return null;
  const bars: Bar[] = h.bars.map(([t, answer, round]) => ({ t, answer, round, close: Number(BigInt(answer)) / 1e8, age: 0 }));
  const cfg = defaultConfig("trend", "ETH");
  const report = buildReport(cfg, bars, { backtestDays: 30, paperStart: HOUSE_START, now: Math.floor(Date.now() / 1000) });
  return { report, market: marketById("ETH")!, latest: h.latest, live: h.live, snapshot: h.snapshot };
}
