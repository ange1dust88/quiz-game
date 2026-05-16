import Link from "next/link";
import { getProfileSafe } from "./lib/auth";

export default async function Home() {
  const profile = await getProfileSafe();

  return (
    <div className="min-h-screen text-white flex flex-col relative overflow-hidden">
      <header className="flex items-center justify-between px-8 py-6 border-b border-[#4f4f4f]/40 backdrop-blur-sm">
        <span className="text-lg font-semibold tracking-wide">
          Europe<span className="text-blue-400">Quiz</span>
        </span>

        <nav className="flex items-center gap-3 text-sm">
          {profile ? (
            <Link
              href="/dashboard"
              className="bg-blue-400 hover:bg-blue-500 transition-colors px-4 py-2 rounded-lg"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="border border-[#4f4f4f] bg-[#1a1a1a] hover:bg-[#292929] transition-colors px-4 py-2 rounded-lg"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="bg-blue-400 hover:bg-blue-500 transition-colors px-4 py-2 rounded-lg"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center px-8 py-16">
        <div className="max-w-3xl flex flex-col items-center text-center gap-6">
          <span className="text-xs uppercase tracking-[0.3em] text-blue-300">
            Multiplayer · Quiz · Strategy
          </span>

          <h1 className="text-5xl sm:text-6xl font-bold leading-tight">
            Conquer Europe with{" "}
            <span className="bg-gradient-to-r from-blue-400 to-blue-400 bg-clip-text text-transparent">
              knowledge
            </span>
          </h1>

          <p className="text-lg text-gray-300 max-w-xl">
            A Risk-style multiplayer game where territories are won by
            answering questions faster and smarter than your rivals.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <Link
              href={profile ? "/dashboard" : "/register"}
              className="bg-blue-400 hover:bg-blue-500 transition-colors px-6 py-3 rounded-lg font-medium"
            >
              {profile ? "Play now" : "Get started"}
            </Link>
            <Link
              href="/login"
              className="border border-[#4f4f4f] bg-[#1a1a1a]/60 hover:bg-[#292929] transition-colors px-6 py-3 rounded-lg"
            >
              I already have an account
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 w-full">
            <FeatureCard
              title="Capitals"
              description="Pick your starting capital on the map of Europe."
            />
            <FeatureCard
              title="Expand"
              description="Answer numeric questions to claim free territories."
            />
            <FeatureCard
              title="War"
              description="Attack neighbors and battle for the continent."
            />
          </div>
        </div>
      </main>

      <footer className="px-8 py-4 text-xs text-gray-500 text-center border-t border-[#4f4f4f]/40">
        Diploma project · Next.js 16 · Prisma · Supabase Realtime
      </footer>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-xl p-5 text-left hover:border-blue-500/60 transition-colors">
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  );
}
