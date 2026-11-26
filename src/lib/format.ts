/* Number and time formatting shared by the report and the pages. Times are UTC: bar closes are UTC hours. */
export const usd = (v: number, digits = 2) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const pct = (v: number, digits = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)} %`;
export const pctPlain = (v: number, digits = 2) => `${v.toFixed(digits)} %`;
export const bps = (v: number) => `${(v / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} %`;
export const int = (v: number) => v.toLocaleString("en-US");
export const price = (v: number) => (v >= 1000 ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

export function utc(t: number, withYear = false) {
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${d.getUTCDate()} ${mon}${withYear ? ` ${d.getUTCFullYear()}` : ""} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function ago(t: number, now = Math.floor(Date.now() / 1000)) {
  const s = Math.max(0, now - t);
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172_800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
}

export const age = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : s < 172_800 ? `${(s / 3600).toFixed(s < 36_000 ? 1 : 0)} h` : `${Math.round(s / 86_400)} d`);
