// Persistent top header, redesigned to the FACEIT-style mockup.
// Layout (left → right):
//   [hex-logo · EUROPEQUIZ / COMPETITIVE · SEASON 1] [tabs] [search] [coin · N] [user chip]
//
// Tabs include placeholder routes (/play, /tournaments, /friends) so
// nothing 404s while the corresponding features land. Search + currency
// + level number are non-wired today; the markup is in place so the
// switch is a one-line plumbing job later.

import Link from "next/link";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import HeaderNav from "./HeaderNav";
import HeaderHider from "./HeaderHider";
import UserMenu from "./UserMenu";
import CoinPurse from "./CoinPurse";
import PlayerSearch from "./PlayerSearch";

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AppHeader() {
  const profile = await getProfileSafe();
  let isAdmin = false;
  if (profile) {
    const user = await prisma.user.findUnique({
      where: { id: profile.userId },
      select: { email: true },
    });
    if (user) {
      isAdmin = parseAdminEmails().includes(user.email.toLowerCase());
    }
  }

  // Admin link lives in the user dropdown (UserMenu) — keep the top
  // nav focused on player-facing routes.
  const tabs = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/friends", label: "Friends" },
  ];

  return (
    <HeaderHider>
      <header className="sticky top-0 z-30 border-b border-stroke bg-[#171f2a]/95 backdrop-blur">
        <div className="max-w-[1600px] mx-auto flex items-stretch h-16">
          <Link
            href={profile ? "/dashboard" : "/"}
            className="flex items-center gap-3 px-4 sm:px-6 border-r border-stroke shrink-0"
          >
            <HexLogo />
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-widest text-white">
                EUROPEQUIZ
              </span>
              <span className="text-[9px] uppercase tracking-widest text-dim">
                Competitive · Season 1
              </span>
            </div>
          </Link>

          <div className="flex items-stretch flex-1 min-w-0 overflow-x-auto">
            {profile && <HeaderNav tabs={tabs} />}
          </div>

          {profile && (
            <div className="hidden md:flex items-center px-3 border-l border-stroke">
              <PlayerSearch />
            </div>
          )}

          {profile && (
            <div className="hidden md:flex items-center px-2 border-l border-stroke">
              <CoinPurse coins={profile.coins} />
            </div>
          )}

          <div className="flex items-center px-2 sm:px-3 border-l border-stroke shrink-0">
            {profile ? (
              <UserMenu
                nickname={profile.nickname}
                avatarUrl={profile.avatarUrl}
                level={profile.level}
                elo={profile.elo}
                isAdmin={isAdmin}
              />
            ) : (
              <Link
                href="/login"
                className="text-xs bg-accent hover:bg-accent-dim transition-colors text-white px-3 py-1.5 font-semibold"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
    </HeaderHider>
  );
}

function HexLogo() {
  return (
    <svg width="32" height="36" viewBox="0 0 32 36" aria-hidden="true">
      <polygon
        points="16,1 31,9 31,27 16,35 1,27 1,9"
        fill="#121822"
        stroke="#1ed3ff"
        strokeWidth="1.5"
      />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="#1ed3ff"
        fontSize="11"
        fontWeight="800"
        fontFamily="var(--font-geist-sans), system-ui"
      >
        EQ
      </text>
    </svg>
  );
}

