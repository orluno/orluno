import type { Point, Trade } from "@/lib/engine/simulate";
import { usd, utc } from "@/lib/format";

/*
 * Equity of the strategy (solid) against buy-and-hold (dashed), both from the same start cash, one point per decision bar.
 * Buys are filled squares, sells hollow squares. Plain SVG, no library; the numbers are in the table next to it.
 */
export function EquityChart({ curve, trades = [], height = 220, label, testid }: { curve: Point[]; trades?: Trade[]; height?: number; label: string; testid?: string }) {
  const W = 640;
  const H = height;
  const P = { l: 4, r: 4, t: 12, b: 22 };
  if (curve.length < 2) {
    return (
      <div className="box dash" style={{ height, display: "grid", placeItems: "center" }} data-testid={testid}>
        <span className="small">No closed bars in this window yet.</span>
      </div>
    );
  }
  const ys = curve.flatMap((c) => [c.equity, c.hold]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const x = (i: number) => P.l + (i / (curve.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / span) * (H - P.t - P.b);
  const line = (key: "equity" | "hold") => curve.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c[key]).toFixed(1)}`).join("");
  const idx = new Map(curve.map((c, i) => [c.t, i]));
  const start = curve[0].equity;
  return (
    <figure style={{ margin: 0 }} data-testid={testid}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={label} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }} data-draw="">
        <line x1={P.l} x2={W - P.r} y1={y(start)} y2={y(start)} stroke="#d6d6d0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={line("hold")} fill="none" stroke="#111110" strokeWidth="1.2" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d={line("equity")} fill="none" stroke="#111110" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {trades.map((t, k) => {
          const i = idx.get(t.t);
          if (i === undefined) return null;
          const cx = x(i);
          const cy = y(curve[i].equity);
          return t.side === "buy" ? <rect key={k} x={cx - 3} y={cy - 3} width="6" height="6" fill="#111110" /> : <rect key={k} x={cx - 3} y={cy - 3} width="6" height="6" fill="#fff" stroke="#111110" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <figcaption className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted)", marginTop: 4, gap: 8, flexWrap: "wrap" }}>
        <span>{utc(curve[0].t)}</span>
        <span>
          ━ strategy {usd(curve.at(-1)!.equity)} · ┄ hold {usd(curve.at(-1)!.hold)} · ■ buy □ sell
        </span>
        <span>{utc(curve.at(-1)!.t)}</span>
      </figcaption>
    </figure>
  );
}
