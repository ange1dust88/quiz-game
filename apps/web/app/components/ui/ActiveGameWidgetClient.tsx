"use client";

// FACEIT-style "return to game" pill — fixed bottom-right. Sharp
// bordered panel with a coloured top stripe + skewed CTA chip. Polls
// /api/active-game every ~4s so the pill drops off as soon as the
// match server flips the session to "completed" / "cancelled" — no
// stale "Return to lobby" after the game ends.
//
// Hidden on screens that already surface the same info (the match
// itself, the owning lobby, own profile's in-game banner, auth pages).

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type GameInfo = { sessionId: string; status: string } | null;

const POLL_INTERVAL_MS = 2_000;

export default function ActiveGameWidgetClient({
  initialGame,
  ownNickname,
}: {
  initialGame: GameInfo;
  ownNickname: string;
}) {
  const pathname = usePathname() ?? "";
  const [game, setGame] = useState<GameInfo>(initialGame);

  // Resync if the server-rendered prop refreshes (revalidatePath).
  useEffect(() => {
    setGame(initialGame);
  }, [initialGame]);

  // Lightweight polling — the match server updates session.status from
  // outside Next.js, so revalidatePath alone doesn't catch the flip.
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const r = await fetch("/api/active-game", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { game: GameInfo };
        if (!cancelled) setGame(data.game);
      } catch {
        // network blip — retry on the next tick
      }
    };
    const t = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!game) return null;
  if (shouldHide(pathname, game.sessionId, ownNickname)) return null;

  const isWaiting = game.status === "waiting";
  const href = isWaiting ? `/lobby/${game.sessionId}` : `/match/${game.sessionId}`;
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
