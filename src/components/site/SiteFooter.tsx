import Link from "next/link";
import { BRAND, CHAIN, hasGithub } from "@/config/brand";
import { CaBox } from "@/components/site/CaCopy";
import { Raster } from "@/components/site/Reveal";

/* Black footer under a dot band, chips, the CA, and the giant dot-matrix wordmark (the reference's closing block). */
export function SiteFooter({ cta }: { cta?: React.ReactNode }) {
  return (
    <footer className="ol-foot">
      <div className="band" aria-hidden="true" />
      <div className="wrap" style={{ paddingTop: 72 }}>
        {cta}
        <div className="grid-main" style={{ marginTop: cta ? 120 : 0, rowGap: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
            <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <Link href="/method" className="chip"><span className="k">/</span><span>method</span></Link>
              <Link href="/method#limits" className="chip"><span className="k">/</span><span>terms</span></Link>
              <Link href="/token" className="chip"><span className="k">/</span><span>{BRAND.symbol.toLowerCase()}</span></Link>
              <a href={BRAND.x} target="_blank" rel="noreferrer" className="chip"><span className="k">x</span><span>{BRAND.xHandle}</span></a>
              {hasGithub ? (
                <a href={BRAND.github} target="_blank" rel="noreferrer" className="chip"><span className="k">git</span><span>source</span></a>
              ) : null}
            </nav>
            <CaBox testid="ca-footer" compact />
          </div>
          <p className="mono" style={{ fontSize: 13, color: "#a3a39c", margin: 0, alignSelf: "center" }}>
            © 2026 {BRAND.name} · {CHAIN.name} · {CHAIN.id}
          </p>
        </div>
        <p className="small" style={{ color: "#a3a39c", maxWidth: 760, marginTop: 40 }}>
          Paper money only. Orluno places no orders, holds no funds and never signs for you. A backtest result is not a future result, and
          nothing here is advice. Stock tokens are tokens on {CHAIN.name}, not the shares themselves. Not affiliated with Robinhood.
        </p>
        <div style={{ padding: "64px 0 56px", overflow: "hidden" }}>
          <Raster as="p" className="giant halftone light">
            {BRAND.name}
          </Raster>
        </div>
      </div>
    </footer>
  );
}
