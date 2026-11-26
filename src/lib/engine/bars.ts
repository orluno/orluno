/*
 * Hourly bars from Chainlink rounds.
 * A Chainlink feed on Robinhood Chain publishes a new answer when the price moves past its deviation threshold (0.5 %) or once a
 * heartbeat (24 h) passes. Between two answers the last one stands, so the close of a bar is the last answer published at or
 * before the bar's end, and it can differ from the market by up to about the threshold. Orluno never fills a gap with a
 * made-up price.
 *   - ETH (24/7 feed): a bar at every UTC hour.
 *   - Stock tokens (US market-hours feeds, 24 hours on weekdays): a bar at every UTC hour from Monday 02:00 to Saturday 01:00
 *     UTC (bar times are hour ends; the session runs Monday 01:00 to Saturday 01:00 UTC in winter), and none while the last answer is older than 26 hours (holidays, feed pauses).
 */
export type Round = [number, string, number]; // [round number, answer (8 decimals), updatedAt]
export type Bar = { t: number; answer: string; close: number; round: number; age: number };

export const HOUR = 3_600;
const MAX_AGE = 26 * HOUR;

/** Stock feeds: weekday session in UTC (Mon 01:00 .. Sat 01:00). */
export function inStockSession(t: number): boolean {
  const d = new Date(t * 1000);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const h = d.getUTCHours();
  if (day === 0) return false;
  // A bar at hour H closes the hour H-1..H: Saturday 01:00 closes the session's last hour, Monday 02:00 its first.
  if (day === 6) return h <= 1;
  if (day === 1) return h >= 2;
  return true;
}

export function toBars(rounds: Round[], kind: "crypto" | "stock", until: number): Bar[] {
  const rs = rounds.filter((r) => r[2] > 0 && BigInt(r[1]) > 0n).sort((a, b) => a[2] - b[2] || a[0] - b[0]);
  if (!rs.length) return [];
  const bars: Bar[] = [];
  let i = 0;
  const end = Math.floor(until / HOUR) * HOUR;
  for (let t = Math.ceil(rs[0][2] / HOUR) * HOUR; t <= end; t += HOUR) {
    while (i + 1 < rs.length && rs[i + 1][2] <= t) i++;
    const r = rs[i];
    if (r[2] > t) continue;
    const age = t - r[2];
    if (age > MAX_AGE) continue;
    if (kind === "stock" && !inStockSession(t)) continue;
    bars.push({ t, answer: r[1], close: Number(BigInt(r[1])) / 1e8, round: r[0], age });
  }
  return bars;
}
