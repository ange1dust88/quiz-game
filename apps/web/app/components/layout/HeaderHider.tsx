"use client";

// Wrapper that hides its children on routes where the persistent app
// header would be redundant or harmful:
//   - /login, /register             → pre-auth, no profile to show
//   - /match/*                      → match has its own header
// Anything else gets the header.

import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export default function HeaderHider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const hide =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/match/");
  if (hide) return null;
  return <>{children}</>;
}
