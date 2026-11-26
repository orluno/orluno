import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/site/PageHead";
import { DeployPanel } from "@/components/report/DeployPanel";

// Owner tool, local only: on any public host this route is a 404.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Deploy", robots: { index: false, follow: false } };

export default async function DeployPage() {
  const host = (await headers()).get("host") ?? "";
  if (!LOCAL_HOST.test(host)) notFound();
  return (
    <>
      <PageHead kicker="Owner tool · localhost only" title="Deploy the registry" />
      <div className="wrap" style={{ marginTop: 40, marginBottom: 120 }}>
        <DeployPanel />
      </div>
    </>
  );
}
