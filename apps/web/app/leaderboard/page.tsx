// FACEIT-style global leaderboard. Season strip + huge LEADERBOARD
// heading + visual region/mode filter chips → 3-up podium for top 3
// (silver-gold-bronze stair) → Full Rankings panel with a 9-column
// table of the top 50 plus an inserted "you" row if the viewer is
// outside the cut.

import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import PanelCard from "@/app/components/ui/PanelCard";
import Slash from "@/app/components/ui/Slash";
import PodiumCard from "./PodiumCard";
import LeaderboardRow from "./LeaderboardRow";

const TOP_LIMIT = 50;

type LbPlayer = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  level: number;
  elo: number;
  country: string | null;
  gamesPlayed: number;
  gamesWon: number;
  streakKind: "W" | "L" | null;
  streakLen: number;
  trend7d: number;
};

export default async function LeaderboardPage() {
  const viewer = await getProfileSafe();
  if (!viewer) redirect("/login");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [topRaw, totalPlayers, higherCount, viewerRaw] = await Promise.all([
    prisma.playerProfile.findMany({
      orderBy: [{ elo: "desc" }, { gamesWon: "desc" }],
      take: TOP_LIMIT,
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        level: true,
        elo: true,
        country: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    }),
    prisma.playerProfile.count(),
    prisma.playerProfile.count({ where: { elo: { gt: viewer.elo } } }),
    prisma.playerProfile.findUnique({
      where: { id: viewer.id },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        level: true,
        elo: true,
        country: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    }),
  ]);

  const myRank = higherCount + 1;
  const myInTop = topRaw.some((p) => p.id === viewer.id);

  // Pull recent ELO entries for everyone we plan to render so we can
  // compute streak + 7d delta in memory rather than N more round-trips.
  const idsForHistory = new Set(topRaw.map((p) => p.id));
  if (!myInTop && viewerRaw) idsForHistory.add(viewerRaw.id);
  const histRows =
    idsForHistory.size === 0
      ? []
      : await prisma.eloHistoryEntry.findMany({
          where: {
            profileId: { in: Array.from(idsForHistory) },
            createdAt: { gte: sevenDaysAgo },
          },
          orderBy: { createdAt: "desc" },
          select: {
            profileId: true,
            isWinner: true,
            delta: true,
            createdAt: true,
          },
        });
  const histByProfile = new Map<
    string,
    { isWinner: boolean; delta: number; createdAt: Date }[]
  >();
  for (const r of histRows) {
    const arr = histByProfile.get(r.profileId) ?? [];
    arr.push(r);
    histByProfile.set(r.profileId, arr);
  }

  function decorate(p: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
    level: number;
    elo: number;
    country: string | null;
    gamesPlayed: number;
    gamesWon: number;
  }): LbPlayer {
    const hist = histByProfile.get(p.id) ?? [];
    let streakKind: "W" | "L" | null = null;
    let streakLen = 0;
    if (hist.length > 0) {
      streakKind = hist[0].isWinner ? "W" : "L";
      for (const h of hist) {
        const cur: "W" | "L" = h.isWinner ? "W" : "L";
        if (cur !== streakKind) break;
        streakLen += 1;
      }
    }
    const trend7d = hist.reduce((acc, h) => acc + h.delta, 0);
    return { ...p, streakKind, streakLen, trend7d };
  }

  const top = topRaw.map(decorate);
  const podium = top.slice(0, 3);
  const rest = top.slice(3);
  const viewerRow =
    !myInTop && viewerRaw ? decorate(viewerRaw) : null;

  // Stair-step layout: rank-2 left, rank-1 centre (tallest), rank-3 right.
  const podiumOrder: ({ pos: 1 | 2 | 3; size: "lg" | "md" | "sm" })[] = [
    { pos: 2, size: "md" },
    { pos: 1, size: "lg" },
    { pos: 3, size: "sm" },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] text-white bg-canvas">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <Slash label="Season 1" />
          <h1
            className="font-head text-white leading-none"
            style={{ fontSize: 44 }}
          >
            LEADERBOARD
          </h1>
          <p className="font-mono text-[11px] text-mute">
            {totalPlayers.toLocaleString()} players · ranked by ELO
          </p>
        </header>

        {podium.length > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            {podiumOrder.map(({ pos, size }) => {
              const p = podium[pos - 1];
              if (!p) return <div key={pos} />;
              return (
                <PodiumCard
                  key={p.id}
                  rank={pos}
                  size={size}
                  isMe={p.id === viewer.id}
                  player={p}
                />
              );
            })}
          </section>
        )}

        <PanelCard
          title="Full rankings"
          accent="#1ed3ff"
          padded={false}
        >
          {top.length === 0 ? (
            <p className="font-body text-sm text-dim px-4 py-12 text-center">
              No players yet — play a match to be the first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
              <div
                className="grid items-center gap-2 px-4 py-2 border-b border-stroke bg-panel"
                style={{
                  gridTemplateColumns:
                    "70px 38px 1fr 90px 110px 90px 90px 80px",
                }}
              >
                <span className="font-head text-[10px] text-dim">Rank</span>
                <span className="font-head text-[10px] text-dim">Lvl</span>
                <span className="font-head text-[10px] text-dim">Player</span>
                <span className="font-head text-[10px] text-dim">ELO</span>
                <span className="font-head text-[10px] text-dim">Win rate</span>
                <span className="font-head text-[10px] text-dim">Matches</span>
                <span className="font-head text-[10px] text-dim">Streak</span>
                <span className="font-head text-[10px] text-dim">7d Δ</span>
              </div>

              {podium.map((p, i) => (
                <LeaderboardRow
                  key={p.id}
                  rank={i + 1}
                  isMe={p.id === viewer.id}
                  player={p}
                />
              ))}
              {rest.map((p, i) => (
                <LeaderboardRow
                  key={p.id}
                  rank={i + 4}
                  isMe={p.id === viewer.id}
                  player={p}
                />
              ))}

              {viewerRow && (
                <>
                  <div className="px-4 py-2 border-t border-stroke text-center font-mono text-[11px] text-dim bg-panel">
                    · · · {Math.max(0, myRank - TOP_LIMIT - 1).toLocaleString()} players · · ·
                  </div>
                  <LeaderboardRow
                    rank={myRank}
                    isMe
                    player={viewerRow}
                  />
                </>
              )}
              </div>
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}
