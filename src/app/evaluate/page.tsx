import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHead } from "@/components/site/PageHead";
import { SiteFooter } from "@/components/site/SiteFooter";
import { EvaluateApp } from "@/components/report/EvaluateApp";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  path: "/evaluate",
  title: "Build an evaluation report | Orluno",
  description: "Pick a strategy block, an asset on Robinhood Chain, a position size and your risk limits; Orluno runs the same rules as a backtest and as paper trading and shows both side by side.",
});

export default function EvaluatePage() {
  return (
    <>
      <PageHead
        kicker="Report builder · paper money only"
        title="Run your rules"
        tail="twice."
        lede={<p style={{ margin: 0 }}>Backtest on past hourly bars, paper trading from the moment you start it. Same config hash on both sides. A backtest result is not a future result.</p>}
      />
      <Suspense fallback={<p className="wrap small">Loading the builder…</p>}>
        <EvaluateApp />
      </Suspense>
      <SiteFooter />
    </>
  );
}
