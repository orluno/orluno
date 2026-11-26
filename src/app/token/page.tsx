import type { Metadata } from "next";
import { BRAND, CHAIN, TOKEN, buyUrl } from "@/config/brand";
import { PageHead } from "@/components/site/PageHead";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CaBox } from "@/components/site/CaCopy";
import { Reveal } from "@/components/site/Reveal";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({ path: "/token", title: `${BRAND.symbol}: the community token of ${BRAND.name}`, description: `${BRAND.symbol} is the community token of ${BRAND.name} on ${CHAIN.name}. The report works without it; token features are concepts, not built yet.` });

const FEATURES = [
  ["More active paper sessions", "Run more strategies on paper at once."],
  ["Longer backtests", "Windows beyond 120 days as the feed history grows."],
  ["Advanced exports", "Report bundles with every decision hash and its anchor proof."],
];

export default function TokenPage() {
  return (
    <>
      <PageHead kicker={`${CHAIN.name} · gas ETH`} title={BRAND.symbol} tail="community token." lede={<p style={{ margin: 0 }}>The report, paper sessions and the limit registry all work without it.</p>} />
      <div className="wrap" style={{ marginTop: 48 }}>
        <div className="grid-main" style={{ rowGap: 32 }}>
          <div style={{ display: "grid", gap: 32 }}>
            <Reveal>
              <span className="flab">Contract address</span>
              <CaBox testid="ca-token" />
              <p className="small" style={{ marginTop: 10 }}>
                {TOKEN.isLive ? `The only address of ${BRAND.symbol}. Anything else using the name is not it.` : `Not launched yet. The address appears here at launch (launchpad TBA). Until then, any token using the name is not ${BRAND.symbol}.`}
              </p>
              {TOKEN.isLive ? (
                <a className="cut" href={buyUrl()} target="_blank" rel="noreferrer" style={{ marginTop: 12 }}>
                  <span className="face">Open on the launchpad</span>
                </a>
              ) : (
                <span className="cut" aria-disabled="true" style={{ marginTop: 12 }}>
                  <span className="face">At launch</span>
                </span>
              )}
            </Reveal>
            <Reveal>
              <h2 className="hd-3">
                Token features <span className="badge dash" style={{ verticalAlign: "middle" }}>Concept</span>
              </h2>
              <p className="body">These are concepts, not built yet. None of them is needed to use {BRAND.name}, and none is a promise of value.</p>
              <table className="table">
                <tbody>
                  {FEATURES.map(([k, v]) => (
                    <tr key={k}>
                      <td><b>{k}</b></td>
                      <td>{v}</td>
                      <td className="m">Concept</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
            <Reveal>
              <p className="note">
                {BRAND.symbol} is the community token of {BRAND.name}. Holding it gives no share of anything, no income and no say over anyone&apos;s funds. Nothing here is advice. We never DM first and never ask for a seed phrase.
              </p>
            </Reveal>
          </div>
          <div className="rail-col" aria-hidden="true">
            <span className="ht-line halftone" style={{ fontSize: 150 }}>$</span>
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
