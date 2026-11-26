import type { Metadata } from "next";
import { PageHead } from "@/components/site/PageHead";
import { SiteFooter } from "@/components/site/SiteFooter";
import { LimitsApp } from "@/components/report/LimitsApp";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({ path: "/limits", title: "Risk limits on chain | Orluno", description: "The limit check every simulated fill passes, and the configs recorded in OrlunoLimitRegistry on Robinhood Chain: limits in force, queued loosening, anchored paper decisions." });

export default function LimitsPage() {
  return (
    <>
      <PageHead kicker="OrlunoLimitRegistry · Robinhood Chain" title="Set your limits" tail="in writing." lede={<p style={{ margin: 0 }}>Stricter limits apply in the same block. Looser ones wait 24 hours, and you can cancel them while they wait.</p>} />
      <LimitsApp />
      <SiteFooter />
    </>
  );
}
