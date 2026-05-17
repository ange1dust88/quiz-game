"use client";

// Header tabs. Active tab gets a blue underline + bright label, others
// stay grey. Each tab is full-height so the underline hugs the header
// border like the FACEIT mockup.

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };

export default function HeaderNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex items-stretch h-full">
      {tabs.map((t) => {
        const active =
          t.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative flex items-center px-4 sm:px-5 text-xs sm:text-sm font-bold uppercase tracking-widest transition-colors ${
              active
                ? "text-white"
                : "text-dim hover:text-mute"
            }`}
          >
            {t.label}
            {active && (
              <span className="absolute bottom-0 left-3 right-3 h-[3px] bg-accent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
