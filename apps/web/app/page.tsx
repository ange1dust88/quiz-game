// FACEIT-style landing. Full-bleed gradient hero with skewed CTA, three
// phase tiles below, footer with project metadata. Header rendered
// locally (AppHeader is hidden on "/" via HeaderHider) so unauth users
// still get a clean nav to login/register.

import Link from "next/link";
import { getProfileSafe } from "./lib/auth";
import Slash from "./components/ui/Slash";

export default async function Home() {
  const profile = await getProfileSafe();

  return (
    <div className="min-h-screen bg-canvas text-white flex flex-col">
      <header className="border-b border-stroke bg-panel">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <HexLogo />
            <span className="font-head text-sm text-white">EUROPEQUIZ</span>
          </Link>
          <nav className="flex items-center gap-2">
            {profile ? (
              <Link
                href="/dashboard"
                className="font-head text-xs font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-5 py-2"
                style={{ transform: "skewX(-10deg)" }}
              >
                <span
                  className="inline-block"
                  style={{ transform: "skewX(10deg)" }}
                >
                  Dashboard
                </span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-4 py-2"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="font-head text-xs font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-5 py-2"
                  style={{ transform: "skewX(-10deg)" }}
                >
                  <span
                    className="inline-block"
                    style={{ transform: "skewX(10deg)" }}
                  >
                    Sign up
                  </span>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <section className="relative overflow-hidden flex-1 flex items-center bg-gradient-to-br from-surface-hi via-panel to-canvas">
          <div
            className="absolute right-[-200px] top-0 bottom-0 w-[500px] bg-accent/8"
            style={{ transform: "skewX(-12deg)" }}
            aria-hidden
          />
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              background:
                "radial-gradient(circle at 80% 50%, rgba(30,211,255,0.18), transparent 55%)",
            }}
            aria-hidden
          />
          <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 py-20 w-full grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-center">
            <div className="flex flex-col gap-5">
              <Slash label="Multiplayer · Quiz · Strategy" />
              <h1
                className="font-head text-white leading-[0.9]"
                style={{ fontSize: "clamp(48px, 8vw, 88px)" }}
              >
                CONQUER
                <br />
                <span className="text-accent">EUROPE</span>
                <br />
                WITH KNOWLEDGE
              </h1>
              <p className="font-body text-base text-mute max-w-xl leading-relaxed">
                A Risk-style multiplayer quiz game where territories are won
                by answering faster and smarter than your rivals.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <Link
                  href={profile ? "/dashboard" : "/register"}
                  className="font-head text-lg font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-8 py-3.5"
                  style={{ transform: "skewX(-10deg)" }}
                >
                  <span
                    className="inline-block"
                    style={{ transform: "skewX(10deg)" }}
                  >
                    ► {profile ? "Play now" : "Get started"}
                  </span>
                </Link>
                {!profile && (
                  <Link
                    href="/login"
                    className="font-head text-xs text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-5 py-3"
                  >
                    I have an account
                  </Link>
                )}
              </div>
            </div>

            <div className="hidden lg:flex justify-center">
              <BigHexLogo />
            </div>
          </div>
        </section>

        <section className="border-t border-stroke bg-panel">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PhaseTile
              num="01"
              title="Capitals"
              description="Pick your starting capital on the map of Europe."
              accent="var(--color-accent)"
            />
            <PhaseTile
              num="02"
              title="Expand"
              description="Answer numeric questions to claim free territories."
              accent="var(--color-blue2)"
            />
            <PhaseTile
              num="03"
              title="War"
              description="Attack neighbours and battle for the continent."
              accent="var(--color-lose)"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-stroke bg-canvas">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 text-center font-mono text-[11px] text-dim">
          Diploma project · Next.js 16 · Prisma · Colyseus · Supabase
        </div>
      </footer>
    </div>
  );
}

function PhaseTile({
  num,
  title,
  description,
  accent,
}: {
  num: string;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div
      className="bg-surface border p-5 flex flex-col gap-2"
      style={{ borderColor: "var(--color-stroke)", borderTop: `3px solid ${accent}` }}
    >
      <span
        className="font-head text-[11px]"
        style={{ color: accent }}
      >
        Phase {num}
      </span>
      <h3 className="font-head text-2xl text-white">{title.toUpperCase()}</h3>
      <p className="font-body text-sm text-mute leading-relaxed">
        {description}
      </p>
    </div>
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

function BigHexLogo() {
  return (
    <svg width="280" height="316" viewBox="0 0 32 36" aria-hidden="true">
      <polygon
        points="16,1 31,9 31,27 16,35 1,27 1,9"
        fill="none"
        stroke="#1ed3ff"
        strokeWidth="0.5"
        opacity="0.7"
      />
      <polygon
        points="16,3 29,10 29,26 16,33 3,26 3,10"
        fill="none"
        stroke="#1ed3ff"
        strokeWidth="0.3"
        opacity="0.4"
      />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="#1ed3ff"
        fontSize="9"
        fontWeight="800"
        fontFamily="var(--font-geist-sans), system-ui"
      >
        EQ
      </text>
    </svg>
  );
}
