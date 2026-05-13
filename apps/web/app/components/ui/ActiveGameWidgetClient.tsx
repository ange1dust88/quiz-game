"use client";

// Pathname-aware shell for the floating "return to game" pill. Hidden on
// screens that already surface the same info (the match itself, the
// owning lobby, my own profile's in-game banner, the auth pages).

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  sessionId: string;
  status: string;
  ownNickname: string;
};

export default function ActiveGameWidgetClient({
  sessionId,
  status,
  ownNickname,
}: Props) {
  const pathname = usePathname() ?? "";
  if (shouldHide(pathname, sessionId, ownNickname)) return null;

  const isWaiting = status === "waiting";
  const href = isWaiting
    ? `/lobby/${sessionId}`
    : `/match/${sessionId}`;
  const title = isWaiting ? "You're in a lobby" : "Match in progress";
  const cta = isWaiting ? "Return to lobby" : "Rejoin match";

  return (
    <Link
      href={href}
      className="fixed left-4 bottom-4 z-40 flex items-center gap-3 bg-[#0d0d12]/95 backdrop-blur border border-emerald-400/40 hover:border-emerald-400 transition-colors rounded-xl px-4 py-3 shadow-xl shadow-black/40 max-w-[calc(100vw-2rem)]"
    >
      <span className="relative flex w-2.5 h-2.5 shrink-0">
        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
        <span className="relative w-2.5 h-2.5 rounded-full bg-emerald-400" />
      </span>
      <span className="flex flex-col leading-tight min-w-0">
        <span className="text-[10px] uppercase tracking-widest text-emerald-300 font-semibold">
          {title}
        </span>
        <span className="text-sm text-white font-semibold truncate">
          {cta} →
        </span>
      </span>
    </Link>
  );
}

function shouldHide(
  pathname: string,
  sessionId: string,
  ownNickname: string,
): boolean {
  // Auth + landing pages — pre-login UX, no point.
  if (pathname === "/" || pathname === "/login" || pathname === "/register") {
    return true;
  }
  // Already in the match.
  if (pathname.startsWith(`/match/${sessionId}`)) return true;
  // Already in the lobby for this session.
  if (pathname.startsWith(`/lobby/${sessionId}`)) return true;
  // My own profile already shows the same info as an in-flow banner —
  // avoid stacking it on the same screen.
  if (pathname === `/profile/${encodeURIComponent(ownNickname)}`) return true;
  return false;
}
