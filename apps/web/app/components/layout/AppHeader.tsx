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
import Avatar from "@/app/components/ui/Avatar";
import HeaderNav from "./HeaderNav";
import HeaderHider from "./HeaderHider";
import { logout } from "@/app/login/actions";

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

  const tabs = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/play", label: "Play" },
    { href: "/tournaments", label: "Tournaments" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/friends", label: "Friends" },
    ...(isAdmin ? [{ href: "/admin/avatars", label: "Admin" }] : []),
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

          <div className="hidden md:flex items-center px-3 border-l border-stroke">
            <div className="flex items-center gap-2 bg-panel border border-stroke px-3 py-1.5 w-[220px]">
              <SearchIcon />
              <input
                type="text"
                placeholder="Search players…"
                disabled
                className="bg-transparent text-xs text-mute placeholder:text-dim outline-none flex-1 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 px-4 border-l border-stroke">
            <CoinIcon />
            <span className="text-sm font-bold font-mono text-gold">
              0
            </span>
          </div>

          <div className="flex items-center gap-3 px-3 sm:px-4 border-l border-stroke shrink-0">
            {profile ? (
              <>
                <Link
                  href={`/profile/${encodeURIComponent(profile.nickname)}`}
                  className="flex items-center gap-2 hover:bg-surface-hi px-2 py-1 transition-colors"
                  title="View profile"
                >
                  <div className="relative">
                    <Avatar
                      nickname={profile.nickname}
                      avatarUrl={profile.avatarUrl}
                      size={36}
                      shape="square"
                      color="#1ed3ff"
                    />
                    <span className="absolute -bottom-1 -right-1 text-[9px] font-bold bg-gold text-black px-1 leading-tight">
                      {profile.level}
                    </span>
                  </div>
                  <div className="hidden sm:flex flex-col leading-tight items-start">
                    <span className="text-xs font-bold tracking-widest text-white">
                      {profile.nickname.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-dim font-mono">
                      {profile.elo} ELO
                    </span>
                  </div>
                </Link>
                <form action={logout}>
                  <button
                    type="submit"
                    className="text-[10px] uppercase tracking-widest text-dim hover:text-white transition-colors px-2 py-1 border border-stroke hover:border-mute rounded-md"
                    title="Sign out"
                  >
                    Out
                  </button>
                </form>
              </>
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

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="11"
        cy="11"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-dim"
      />
      <line
        x1="20"
        y1="20"
        x2="16.5"
        y2="16.5"
        stroke="currentColor"
        strokeWidth="2"
        className="text-dim"
      />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="#ffc24a"
        strokeWidth="2"
      />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fill="#ffc24a"
        fontSize="11"
        fontWeight="800"
      >
        Q
      </text>
    </svg>
  );
}
