"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND } from "@/config/brand";
import { NAV, NAV_RIGHT } from "@/config/nav";
import { Mark } from "@/components/site/Mark";
import { NavWallet } from "@/components/wallet/WalletButton";

/* Boxed mono links on the left, the wallet chip, and the mark + wordmark over the right rail (the reference's header). */
export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Close the drawer after a navigation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [path]);
  const cur = (href: string) => (path === href || path.startsWith(`${href}/`) ? "page" : undefined);
  return (
    <header className="ol-header">
      <div className="wrap row">
        <nav className="ol-nav" aria-label="Main">
          <button type="button" className="chip ol-menu-toggle" aria-expanded={open} aria-controls="ol-drawer" onClick={() => setOpen((v) => !v)} data-testid="menu-toggle">
            <span className="k">||</span>
            <span>menu</span>
          </button>
          <Link href="/" className="chip inv links" aria-label={`${BRAND.name} home`}>
            <span className="k">www</span>
            <span className="v">{BRAND.domain}</span>
          </Link>
          <span className="links contents">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="chip links" aria-current={cur(n.href)}>
                <span className="k">/</span>
                <span>{n.label}</span>
              </Link>
            ))}
          </span>
          <span className="right">
            {NAV_RIGHT.map((n) => (
              <Link key={n.href} href={n.href} className="chip hide-m" aria-current={cur(n.href)}>
                <span className="k">/</span>
                <span>{n.label}</span>
              </Link>
            ))}
            <NavWallet />
          </span>
        </nav>
        <Link href="/" className="ol-logo" aria-label={`${BRAND.name} home`}>
          <Mark size={56} />
          <span className="word">{BRAND.name.toUpperCase()}</span>
        </Link>
      </div>
      <div id="ol-drawer" className={`ol-drawer ${open ? "open" : ""}`}>
        <nav aria-label="Menu">
          <Link href="/" className="chip inv">
            <span className="k">www</span>
            <span className="v">{BRAND.domain}</span>
          </Link>
          {[...NAV, ...NAV_RIGHT].map((n) => (
            <Link key={n.href} href={n.href} className="chip" aria-current={cur(n.href)}>
              <span className="k">/</span>
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <div className="ol-rail" aria-hidden="true" />
    </header>
  );
}
