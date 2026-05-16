// Global ELO leaderboard. Top 3 get a podium with medal-coloured cards;
// 4–50 fall into a clean ranked list; the viewer's own row is pinned at
// the bottom if they're outside the top 50, so retention loops still
// feel "you're here" even before you climb.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import Avatar from "@/app/components/ui/Avatar";

const TOP_LIMIT = 50;

type LbRow = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  elo: number;
  level: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
};

export default async function LeaderboardPage() {
  const viewer = await getProfileSafe();
  if (!viewer) redirect("/login");

  const [top, totalPlayers, viewerRow, higherCount] = await Promise.all([
    prisma.playerProfile.findMany({
      orderBy: [{ elo: "desc" }, { gamesWon: "desc" }],
      take: TOP_LIMIT,
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        elo: true,
        level: true,
        gamesPlayed: true,
        gamesWon: true,
        gamesLost: true,
      },
    }),
    prisma.playerProfile.count(),
    prisma.playerProfile.findUnique({
      where: { id: viewer.id },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        elo: true,
        level: true,
        gamesPlayed: true,
        gamesWon: true,
        gamesLost: true,
      },
    }),
    prisma.playerProfile.count({
      where: { elo: { gt: viewer.elo } },
    }),
  ]);

  // Rank computed by "count of players with strictly higher ELO + 1".
  // Ties at the boundary will share rank → that's fine for a v1 board.
  const myRank = higherCount + 1;
  const myInTop = top.some((p) => p.id === viewer.id);
  const podium = top.slice(0, 3);
  const rest = top.slice(3);

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-xs text-gray-400 hover:text-white transition-colors px-4 py-2 border border-[#4f4f4f] rounded-lg"
          >
            ← Dashboard
          </Link>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-gray-400">
              Global rank
            </p>
            <h1 className="text-3xl font-bold">Leaderboard</h1>
          </div>
        </header>

        <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">
              Players ranked
            </p>
            <p className="text-2xl font-bold">{totalPlayers.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">
              Your rank
            </p>
            <p className="text-2xl font-bold text-blue-400">
              #{myRank.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">
              Your ELO
            </p>
            <p className="text-2xl font-bold text-blue-400">
              {viewer.elo.toLocaleString()}
            </p>
          </div>
        </section>

        {podium.length > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {podium.map((p, idx) => (
              <PodiumCard
                key={p.id}
                rank={idx + 1}
                row={p}
                isYou={p.id === viewer.id}
              />
            ))}
          </section>
        )}

        {rest.length > 0 && (
          <section className="bg-[#14141a] border border-[#1f1f24] rounded-2xl p-4 flex flex-col">
            {rest.map((p, idx) => (
              <RankRow
                key={p.id}
                rank={idx + 4}
                row={p}
                isYou={p.id === viewer.id}
              />
            ))}
          </section>
        )}

        {top.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-12">
            No players ranked yet — play a match to be the first.
          </div>
        )}

        {!myInTop && viewerRow && (
          <section className="sticky bottom-4 z-10">
            <div className="bg-[#0d0d12]/95 backdrop-blur border-2 border-blue-400/60 rounded-2xl p-4 shadow-xl shadow-black/40">
              <p className="text-[10px] uppercase tracking-widest text-blue-300 mb-2">
                Your position
              </p>
              <RankRow rank={myRank} row={viewerRow} isYou compact />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// --- Podium card -------------------------------------------------------

const PODIUM_STYLES = [
  {
    border: "border-amber-300/70",
    bg: "from-amber-300/15 to-amber-500/5",
    accent: "text-amber-300",
    rank: "from-amber-200 to-amber-400",
    label: "Champion",
  },
  {
    border: "border-slate-300/60",
    bg: "from-slate-300/15 to-slate-400/5",
    accent: "text-slate-200",
    rank: "from-slate-200 to-slate-400",
    label: "Runner-up",
  },
  {
    border: "border-orange-400/60",
    bg: "from-orange-400/15 to-orange-600/5",
    accent: "text-orange-300",
    rank: "from-orange-300 to-orange-500",
    label: "Third place",
  },
];

function PodiumCard({
  rank,
  row,
  isYou,
}: {
  rank: number;
  row: LbRow;
  isYou: boolean;
}) {
  const s = PODIUM_STYLES[rank - 1] ?? PODIUM_STYLES[2];
  const winRate =
    row.gamesPlayed > 0
      ? Math.round((row.gamesWon / row.gamesPlayed) * 100)
      : 0;
  return (
    <Link
      href={`/profile/${encodeURIComponent(row.nickname)}`}
      className={`bg-gradient-to-br ${s.bg} border-2 ${s.border} rounded-2xl p-5 flex flex-col gap-3 hover:scale-[1.01] transition-transform`}
    >
      <div className="flex items-center justify-between">
        <div
          className={`bg-gradient-to-br ${s.rank} text-black w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-base`}
        >
          {rank}
        </div>
        <span
          className={`text-[10px] uppercase tracking-widest font-semibold ${s.accent}`}
        >
          {s.label}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {row.avatarUrl ? (
          <Avatar
            nickname={row.nickname}
            avatarUrl={row.avatarUrl}
            size={48}
            shape="square"
          />
        ) : (
          <div
            className={`bg-gradient-to-br ${s.rank} text-black w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold shrink-0`}
          >
            {row.nickname.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold truncate">{row.nickname}</span>
            {isYou && (
              <span className="text-[10px] text-blue-300 uppercase tracking-widest">
                you
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">Level {row.level}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
        <Stat label="ELO" value={row.elo.toLocaleString()} accent="text-white" />
        <Stat label="Wins" value={row.gamesWon} />
        <Stat label="Win %" value={`${winRate}%`} />
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <span className={`text-sm font-bold ${accent ?? "text-gray-300"}`}>
        {value}
      </span>
    </div>
  );
}

// --- Row in the long list ---------------------------------------------

function RankRow({
  rank,
  row,
  isYou,
  compact,
}: {
  rank: number;
  row: LbRow;
  isYou: boolean;
  compact?: boolean;
}) {
  const winRate =
    row.gamesPlayed > 0
      ? Math.round((row.gamesWon / row.gamesPlayed) * 100)
      : 0;
  return (
    <Link
      href={`/profile/${encodeURIComponent(row.nickname)}`}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 transition-colors ${
        isYou
          ? "border-blue-400/60 bg-blue-500/10"
          : "border-transparent hover:bg-[#1f1f24]"
      } ${compact ? "" : "not-first:border-t-0"}`}
    >
      <span className="w-8 text-center font-mono text-sm text-gray-500 shrink-0">
        #{rank}
      </span>
      <Avatar
        nickname={row.nickname}
        avatarUrl={row.avatarUrl}
        size={36}
        shape="square"
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold truncate">{row.nickname}</span>
          {isYou && (
            <span className="text-[10px] uppercase tracking-widest text-blue-300">
              you
            </span>
          )}
        </div>
        <span className="text-[11px] text-gray-500">
          Level {row.level} · {row.gamesWon}W · {row.gamesLost}L · {winRate}%
        </span>
      </div>
      <div className="text-right shrink-0">
        <div className="text-base font-bold text-blue-400 font-mono">
          {row.elo.toLocaleString()}
        </div>
        <div className="text-[9px] uppercase tracking-widest text-gray-500">
          ELO
        </div>
      </div>
    </Link>
  );
}
