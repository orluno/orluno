import type { Metadata } from "next";
import { PageHead } from "@/components/site/PageHead";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ReportsList } from "@/components/report/ReportsList";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({ path: "/reports", title: "Saved reports | Orluno", description: "Evaluation reports saved in this browser: reopen one, or compare two side by side." });

export default function ReportsPage() {
  return (
    <>
      <PageHead kicker="Saved in this browser only" title="Your reports" tail="side by side." lede={<p style={{ margin: 0 }}>Nothing on this page is sent anywhere. Clearing site data clears it.</p>} />
      <div className="wrap" style={{ marginTop: 48 }}>
        <ReportsList />
      </div>
      <SiteFooter />
    </>
  );
}
