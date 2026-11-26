"use client";

import { usePathname } from "next/navigation";

/* Replays the stepped "page turn" reveal on every route change (CSS in globals.css, only with html.motion). */
export function PageTurn({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div key={path} className="turn-page">
      {children}
    </div>
  );
}
