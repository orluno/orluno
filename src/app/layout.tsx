import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Motion } from "@/components/site/Motion";
import { PageTurn } from "@/components/site/PageTurn";
import { MOTION_BOOT } from "@/lib/motionBoot";
import { WalletModalProvider } from "@/components/wallet/WalletButton";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { BRAND } from "@/config/brand";
import { HOME_DESCRIPTION, HOME_TITLE, siteLd } from "@/lib/seo";

// Self-hosted, SIL Open Font License (src/fonts/OFL-*.txt): the same two families the UI reference uses.
const text = localFont({ src: [{ path: "../fonts/instrument-sans-latin-wdth-wght.woff2", weight: "400 700", style: "normal" }], variable: "--font-text", display: "swap", declarations: [{ prop: "font-stretch", value: "75% 100%" }] });
const code = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-500-latin.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-code",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: HOME_TITLE, template: `%s | ${BRAND.name}` },
  description: HOME_DESCRIPTION,
  applicationName: BRAND.name,
};

export const viewport: Viewport = { themeColor: "#ffffff", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${text.variable} ${code.variable}`} suppressHydrationWarning>
      <head>
        {/* Motion gate before first paint (only without reduced motion); see components/site/Motion.tsx */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
      </head>
      <body>
        <a className="ol-skip" href="#main">
          Skip to content
        </a>
        <JsonLd data={siteLd} />
        <WalletProvider>
          <WalletModalProvider>
            <SiteHeader />
            <main id="main">
              <PageTurn>{children}</PageTurn>
            </main>
            <Motion />
          </WalletModalProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
