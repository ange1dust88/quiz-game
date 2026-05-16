// Top-5 leaderboard panel for the dashboard sidebar. Rank → level
// hexagon → nickname + country tag → ELO + 7-day delta (placeholder).
// "Full leaderboard →" routes to /leaderboard.

import Link from "next/link";
import { prisma } from "@quiz/db";
import Hexagon from "@/app/components/ui/Hexagon";

export default async function LeaderboardPreview() {
  const top = await prisma.playerProfile.findMany({
    orderBy: [{ elo: "desc" }, { gamesWon: "desc" }],
    take: 5,
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      level: true,
      elo: true,
      country: true,
    },
  });

  return (
    <section className="rounded-2xl border border-[#1f2230] bg-[#0d1117]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#1f2230]">
        <h2 className="text-xs uppercase tracking-widest font-bold flex items-center gap-2">
          <span className="w-1 h-3 bg-amber-400 rounded-sm" />
          Leaderboard · EU
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-gray-500">
          Season 1
        </span>
      </header>

      {top.length === 0 ? (
        <p className="text-sm text-gray-500 px-4 py-6 text-center">
          No players ranked yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {top.map((p, i) => (
            <li
              key={p.id}
              className="flex items-center gap-3 px-4 py-2.5 border-t border-[#1f2230] first:border-t-0"
            >
              <span className="text-[11px] font-bold text-amber-300 font-mono w-6">
                #{i + 1}
              </span>
              <Hexagon
                value={p.level}
                size={28}
                color="#dc2626"
                textColor="#ffffff"
              />
              <div className="flex flex-col leading-tight min-w-0 flex-1">
                <Link
                  href={`/profile/${encodeURIComponent(p.nickname)}`}
                  className="text-xs font-bold uppercase tracking-widest text-white hover:text-blue-300 transition-colors truncate"
                >
                  {p.nickname}
                </Link>
                <span className="text-[10px] uppercase tracking-widest text-gray-500 truncate">
                  {p.country || "—"}
                </span>
              </div>
              <div className="flex flex-col items-end leading-tight">
                <span className="text-sm font-bold font-mono text-white">
                  {p.elo.toLocaleString()}
                </span>
                <span className="text-[10px] text-gray-600 font-mono">
                  +0
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/leaderboard"
        className="block text-center text-[10px] uppercase tracking-widest text-gray-500 hover:text-white border-t border-[#1f2230] py-2 transition-colors"
      >
        Full leaderboard →
      </Link>
    </section>
  );
}
