"use client";

import { useState } from "react";
import { TEMPLATES } from "@/lib/engine/templates";
import { MARKETS } from "@/config/markets";
import { ArrowRight } from "@/components/site/Icons";

/*
 * The hero's two fields in the reference's address-field look. A plain GET form to /evaluate, so it works before (and without)
 * JavaScript; the underline grows with the length of the chosen value.
 */
export function HeroForm({ dark = false, id = "hero" }: { dark?: boolean; id?: string }) {
  const [t, setT] = useState<string>(TEMPLATES[0].id);
  const [a, setA] = useState<string>("ETH");
  const tName = TEMPLATES.find((x) => x.id === t)?.name ?? "";
  const aName = MARKETS.find((m) => m.id === a)?.id ?? "";
  return (
    <form action="/evaluate" method="get" className="grid-main" style={{ rowGap: 16 }} data-testid={`${id}-form`}>
      <div style={{ display: "grid", gap: 12 }}>
        <label className="field">
          <span className="lab" style={dark ? { background: "#fff", color: "#111110" } : undefined}>
            strategy://
          </span>
          <span className="in" style={{ "--fill": `${Math.min(100, 14 + tName.length * 11)}px`, ...(dark ? { borderColor: "#55554f" } : {}) } as React.CSSProperties}>
            <select name="t" value={t} onChange={(e) => setT(e.target.value)} aria-label="Strategy template" style={dark ? { color: "#fff" } : undefined}>
              {TEMPLATES.map((x) => (
                <option key={x.id} value={x.id} style={{ color: "#111110" }}>
                  {x.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="field">
          <span className="lab" style={dark ? { background: "#fff", color: "#111110" } : undefined}>
            asset://
          </span>
          <span className="in" style={{ "--fill": `${Math.min(100, 14 + aName.length * 12)}px`, ...(dark ? { borderColor: "#55554f" } : {}) } as React.CSSProperties}>
            <select name="a" value={a} onChange={(e) => setA(e.target.value)} aria-label="Asset" style={dark ? { color: "#fff" } : undefined}>
              {MARKETS.map((m) => (
                <option key={m.id} value={m.id} style={{ color: "#111110" }}>
                  {m.id} · {m.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <p className="small" style={{ margin: 0, color: dark ? "#a3a39c" : undefined }}>
          No wallet required. Paper money only.
        </p>
      </div>
      <div>
        <button type="submit" className={`cut wide ${dark ? "light" : ""}`} data-testid={`${id}-run`}>
          <span className="face">
            Run the report <ArrowRight size={15} />
          </span>
        </button>
      </div>
    </form>
  );
}
