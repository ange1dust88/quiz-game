// Top-5 leaderboard panel for the sidebar. Rank · level-hex · nickname
// + country tag · ELO · 7-day delta. The delta is mocked until we
// snapshot per-week ELO; everything else is real DB data.

import Link from "next/link";
import { prisma } from "@quiz/db";
import PanelCard from "@/app/components/ui/PanelCard";
import Hexagon from "@/app/components/ui/Hexagon";
import FlagTag from "@/app/components/ui/FlagTag";

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
    <PanelCard
      title="Leaderboard"
      accent="#ffc24a"
      padded={false}
    >
      {top.length === 0 ? (
        <p className="font-body text-sm text-dim px-4 py-6 text-center">
          No players yet.
        </p>
      ) : (
        <div>
          {top.map((p, i) => (
            <div
              key={p.id}
              className="grid grid-cols-[26px_28px_1fr_auto] gap-2.5 items-center px-3 py-2 border-t border-stroke first:border-t-0"
            >
              <span
                className="font-head text-[12px] font-bold"
                style={{
                  color: i < 3 ? "var(--color-gold)" : "var(--color-mute)",
                }}
              >
                #{i + 1}
              </span>
              <Hexagon
                value={p.level}
                size={26}
                color="#1ed3ff"
                textColor="#ffffff"
              />
              <div className="flex flex-col leading-tight min-w-0">
                <Link
                  href={`/profile/${encodeURIComponent(p.nickname)}`}
                  className="font-head text-[11px] text-white hover:text-accent transition-colors truncate"
                >
                  {p.nickname.toUpperCase()}
                </Link>
                <div className="mt-0.5">
                  <FlagTag code={p.country} />
                </div>
              </div>
              <div className="flex flex-col items-end leading-tight">
                <span className="font-mono text-[13px] font-bold text-white">
                  {p.elo.toLocaleString()}
                </span>
                <span className="font-mono text-[10px] text-dim">—</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/leaderboard"
        className="block text-center font-head text-[10px] text-mute hover:text-white border-t border-stroke py-2.5 transition-colors"
      >
        Full leaderboard →
      </Link>
    </PanelCard>
  );
}
