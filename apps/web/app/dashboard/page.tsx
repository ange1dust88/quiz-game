// FACEIT-style dashboard. Left column: hero CONQUER THE MAP + rank
// widget on top, stat tiles row, full match history. Right column:
// live matches feed, leaderboard preview, daily missions.
//
// Features without a real backend yet (online count, currency, live
// match list, daily missions, K/D stat) render with mock data — the
// markup is in place so wiring them up later is mechanical.

import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import { hasDemographicData } from "@/app/components/ui/ProfileReminderBanner";
import ProfileReminderBanner from "@/app/components/ui/ProfileReminderBanner";
import HeroPlay from "./HeroPlay";
import StatTiles from "./StatTiles";
import MatchHistory from "./MatchHistory";
import LiveMatches from "./LiveMatches";
import LeaderboardPreview from "./LeaderboardPreview";
import DailyMissions from "./DailyMissions";

export default async function Dashboard() {
  const profile = await getProfileSafe();
  if (!profile) redirect("/login");

  const showReminder = !hasDemographicData(profile);

  // Rank — count of profiles with strictly higher ELO + 1.
  const higherCount = await prisma.playerProfile.count({
    where: { elo: { gt: profile.elo } },
  });
  const myRank = higherCount + 1;

  // "Online · N players" — best-effort: distinct profiles currently
  // tied to a session that's either waiting (lobby) or live (match).
  // It's not "they have a browser tab open right now" (we'd need a
  // presence heartbeat for that), but it's the most honest proxy we
  // can give without that infra.
  const playersInPlay = await prisma.playerInGame.findMany({
    where: { gameSession: { status: { in: ["waiting", "active"] } } },
    select: { profileId: true },
    distinct: ["profileId"],
  });
  const onlineCount = playersInPlay.length;

  // Streak — walk back through recent results, count consecutive of the
  // same outcome. Sign of the latest match decides the type.
  const recent = await prisma.eloHistoryEntry.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { isWinner: true },
  });
  let streakKind: "W" | "L" | null = null;
  let streakLen = 0;
  if (recent.length > 0) {
    streakKind = recent[0].isWinner ? "W" : "L";
    for (const r of recent) {
      const cur: "W" | "L" = r.isWinner ? "W" : "L";
      if (cur !== streakKind) break;
      streakLen += 1;
    }
  }

  // K/D — total war attacks won / lost, aggregated from telemetry.
  // Cheap-ish for a single profile: pull telemetry from snapshots they
  // were in, count attacker correct/incorrect. Mocked to 0 if no data.
  const snapshotsForKd = await prisma.matchSnapshot.findMany({
    where: { session: { players: { some: { profileId: profile.id } } } },
    select: { telemetry: true, finalState: true },
    take: 100,
  });
  let warWins = 0;
  let warLosses = 0;
  for (const s of snapshotsForKd) {
    const fs = s.finalState as
      | { players?: { id: string; profileId: string }[] }
      | null;
    if (!fs?.players) continue;
    const me = fs.players.find((p) => p.profileId === profile.id);
    if (!me) continue;
    const tel = s.telemetry as
      | { warAnswers?: { playerId: string; isCorrect: boolean }[] }
      | null;
    if (!tel?.warAnswers) continue;
    for (const a of tel.warAnswers) {
      if (a.playerId !== me.id) continue;
      if (a.isCorrect) warWins += 1;
      else warLosses += 1;
    }
  }
  const kd = warLosses > 0 ? warWins / warLosses : warWins;

  // Aggregate stats for the tile row.
  const totalSnapshots = await prisma.matchSnapshot.count({
    where: { session: { players: { some: { profileId: profile.id } } } },
  });
  let myCapitals = 0;
  let myTerritories = 0;
  for (const s of snapshotsForKd) {
    const fs = s.finalState as
      | {
          players?: { id: string; profileId: string }[];
          countries?: { ownerId: string | null; isCapital: boolean }[];
        }
      | null;
    if (!fs?.players || !fs.countries) continue;
    const me = fs.players.find((p) => p.profileId === profile.id);
    if (!me) continue;
    for (const c of fs.countries) {
      if (c.ownerId !== me.id) continue;
      myTerritories += 1;
      if (c.isCapital) myCapitals += 1;
    }
  }
  const winRate =
    profile.gamesPlayed > 0
      ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100)
      : 0;
  const warTotal = warWins + warLosses;
  const warWinPct = warTotal > 0 ? Math.round((warWins / warTotal) * 100) : 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] text-white bg-canvas">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <HeroPlay
            onlineCount={onlineCount}
            level={profile.level}
            elo={profile.elo}
            experience={profile.experience}
            xpForNext={profile.level * 1000}
            rank={myRank}
            streakKind={streakKind}
            streakLen={streakLen}
            kd={kd}
          />

          <StatTiles
            matches={totalSnapshots}
            winRate={winRate}
            capitals={myCapitals}
            territories={myTerritories}
            warWinPct={warWinPct}
            warTotal={warTotal}
            warWins={warWins}
          />

          <MatchHistory profileId={profile.id} />
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          {showReminder && <ProfileReminderBanner />}
          <LiveMatches />
          <LeaderboardPreview />
          <DailyMissions />
        </div>
      </div>
    </div>
  );
}
