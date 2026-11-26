import { BRAND } from "@/config/brand";

export const NAV = [
  { href: "/evaluate", label: "evaluate" },
  { href: "/reports", label: "reports" },
  { href: "/limits", label: "limits" },
  { href: "/method", label: "method" },
] as const;

export const NAV_RIGHT = [{ href: "/token", label: BRAND.symbol.toLowerCase() }] as const;

/** Every public route, for the sitemap. */
export const ROUTES = ["/", "/evaluate", "/reports", "/limits", "/method", "/token"] as const;
