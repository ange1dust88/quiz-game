"use client";

// FACEIT-style "return to game" pill — fixed bottom-right. Sharp
// bordered panel with a coloured top stripe + skewed CTA chip. Hidden
// on screens that already surface the same info (the match itself, the
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
  const href = isWaiting ? `/lobby/${sessionId}` : `/match/${sessionId}`;
  const title = isWaiting ? "In a lobby" : "Match in progress";
  const cta = isWaiting ? "Return to lobby" : "Rejoin match";
  const accent = isWaiting ? "var(--color-accent)" : "var(--color-gold)";

  return (
    <Link
      href={href}
      className="fixed right-4 bottom-4 z-40 bg-surface border border-stroke hover:border-mute transition-colors flex items-center gap-3 px-4 py-2.5 shadow-xl shadow-black/40 max-w-[calc(100vw-2rem)]"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <span className="relative flex w-2.5 h-2.5 shrink-0">
        <span
          className="absolute inset-0 animate-ping opacity-60"
          style={{ background: accent }}
          aria-hidden
        />
        <span
          className="relative w-2.5 h-2.5"
          style={{ background: accent }}
          aria-hidden
        />
      </span>
      <span className="flex flex-col leading-tight min-w-0">
        <span className="font-head text-[10px]" style={{ color: accent }}>
          {title}
        </span>
        <span className="font-head text-xs text-white truncate">
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
  if (pathname.startsWith(`/match/${sessionId}`)) return true;
  if (pathname.startsWith(`/lobby/${sessionId}`)) return true;
  // My own profile already shows the same info as an in-flow banner —
  // avoid stacking it on the same screen.
  if (pathname === `/profile/${encodeURIComponent(ownNickname)}`) return true;
  return false;
}
