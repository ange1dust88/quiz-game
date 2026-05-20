// Profile screen. FACEIT-style hero header (full-bleed bg, inner content
// constrained to max-w-[1600px] so it lines up with the body below) +
// tab navigation that swaps the body content via ?tab= query param:
//   overview      — kitchen-sink: stats tiles + ELO chart + phase/captured + right rail (achievements + played-with)
//   stats         — just the analytical stack, no right rail
//   matches       — full match history table
//   achievements  — full-width 4-col grid of all achievements
//   friends       — full-width "played with" panel

import { notFound, redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import StatBlock from "@/app/components/ui/StatBlock";
import HeroHeader, { type ProfileTab } from "./HeroHeader";
import EloChart from "./EloChart";
import PhasePerformance from "./PhasePerformance";
import MostCaptured from "./MostCaptured";
import PlayedWith from "./PlayedWith";
import AchievementsGrid from "./AchievementsGrid";
import ProfileFriends from "./ProfileFriends";
import FriendsPreview from "./FriendsPreview";
import MatchHistory from "@/app/dashboard/MatchHistory";

const VALID_TABS: ProfileTab[] = [
  "overview",
  "stats",
  "matches",
  "achievements",
  "friends",
];

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ nickname: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { nickname } = await params;
  const { tab: tabParam } = await searchParams;
  const decodedNickname = decodeURIComponent(nickname);
  const tab: ProfileTab = VALID_TABS.includes(tabParam as ProfileTab)
    ? (tabParam as ProfileTab)
    : "overview";

  const profile = await prisma.playerProfile.findUnique({
    where: { nickname: decodedNickname },
  });
  if (!profile) notFound();

  const viewer = await getProfileSafe();
  if (!viewer) redirect("/login");
  const isOwnProfile = viewer.id === profile.id;

  const [
    snapshots,
    eloHistory,
    achievementRows,
    higherCount,
    activeGame,
    recentResults,
    peakHistory,
    friendship,
    incomingRequests,
    outgoingRequests,
    profileFriendships,
  ] = await Promise.all([
    prisma.matchSnapshot.findMany({
      where: { session: { players: { some: { profileId: profile.id } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        sessionId: true,
        winnerId: true,
        duration: true,
        finalState: true,
        telemetry: true,
        createdAt: true,
      },
    }),
    prisma.eloHistoryEntry.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "asc" },
      select: {
        eloAfter: true,
        delta: true,
        isWinner: true,
        createdAt: true,
      },
    }),
    prisma.achievement.findMany({
      where: { profileId: profile.id },
      select: { code: true, unlockedAt: true },
    }),
    prisma.playerProfile.count({ where: { elo: { gt: profile.elo } } }),
    prisma.playerInGame.findFirst({
      where: {
        profileId: profile.id,
        gameSession: { status: { in: ["waiting", "active"] } },
      },
      orderBy: { joinedAt: "desc" },
      select: { id: true },
    }),
    prisma.eloHistoryEntry.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { isWinner: true },
    }),
    prisma.eloHistoryEntry.aggregate({
      where: { profileId: profile.id },
      _max: { eloAfter: true },
    }),
    isOwnProfile
      ? Promise.resolve(null)
      : prisma.friendship.findFirst({
          where: {
            OR: [
              { requesterId: viewer.id, addresseeId: profile.id },
              { requesterId: profile.id, addresseeId: viewer.id },
            ],
          },
          select: {
            id: true,
            requesterId: true,
            addresseeId: true,
            status: true,
          },
        }),
    // Only fetch the viewer's pending in/out queues when they're looking
    // at their OWN friends tab — that's the only place we render them.
    isOwnProfile
      ? prisma.friendship.findMany({
          where: { addresseeId: viewer.id, status: "pending" },
          orderBy: { createdAt: "desc" },
          include: {
            requester: {
              select: {
                id: true,
                nickname: true,
                avatarUrl: true,
                level: true,
                elo: true,
                country: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    isOwnProfile
      ? prisma.friendship.findMany({
          where: { requesterId: viewer.id, status: "pending" },
          orderBy: { createdAt: "desc" },
          include: {
            addressee: {
              select: {
                id: true,
                nickname: true,
                avatarUrl: true,
                level: true,
                elo: true,
                country: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    // All accepted friendships of the profile owner — used by the
    // overview right rail (compact preview) and the friends tab.
    prisma.friendship.findMany({
      where: {
        status: "accepted",
        OR: [
          { requesterId: profile.id },
          { addresseeId: profile.id },
        ],
      },
      orderBy: { acceptedAt: "desc" },
      include: {
        requester: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            level: true,
            elo: true,
            country: true,
          },
        },
        addressee: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            level: true,
            elo: true,
            country: true,
          },
        },
      },
    }),
  ]);

  // Resolve "the other side" of each friendship relative to the profile
  // owner — that's who we show in the list. We keep the friendship id
  // alongside so the own-profile view can fire removeFriendship().
  const profileFriends = profileFriendships.map((f) => ({
    friendshipId: f.id,
    profile:
      f.requesterId === profile.id ? f.addressee : f.requester,
  }));

  const myRank = higherCount + 1;
  const inGame = Boolean(activeGame);

  let streakKind: "W" | "L" | null = null;
  let streakLen = 0;
  if (recentResults.length > 0) {
    streakKind = recentResults[0].isWinner ? "W" : "L";
    for (const r of recentResults) {
      const cur: "W" | "L" = r.isWinner ? "W" : "L";
      if (cur !== streakKind) break;
      streakLen += 1;
    }
  }

  const totalDelta = eloHistory.reduce((acc, e) => acc + e.delta, 0);
  const startingElo = profile.elo - totalDelta;
  const peakElo = peakHistory._max.eloAfter ?? profile.elo;

  // Hero-header action button changes based on the relationship; we
  // resolve it server-side from the single friendship row (if any).
  let friendState: "none" | "outgoing" | "incoming" | "friends" = "none";
  let friendshipId: string | null = null;
  if (friendship) {
    friendshipId = friendship.id;
    if (friendship.status === "accepted") {
      friendState = "friends";
    } else if (friendship.requesterId === viewer.id) {
      friendState = "outgoing";
    } else {
      friendState = "incoming";
    }
  }

  // Per-category MC accuracy + average answer time, derived from
  // telemetry across all of this profile's snapshots. The category
  // counter only tracks WAR multiple-choice (binary correct/wrong);
  // numeric expand answers don't have a binary truth so they're
  // excluded from "best category" but DO contribute to avg time.
  const categoryStats = new Map<
    string,
    { correct: number; total: number }
  >();
  let answerTimeSum = 0;
  let answerTimeCount = 0;

  type FsT = {
    players?: {
      id: string;
      profileId: string;
      turnOrder: number;
      nickname: string;
    }[];
    countries?: {
      ownerId: string | null;
      isCapital: boolean;
      points: number;
      svgId?: string;
    }[];
  };
  type TelT = {
    warAnswers?: {
      playerId: string;
      isCorrect: boolean;
      category?: string;
      submittedAtMs?: number;
    }[];
    numericAnswers?: {
      playerId: string;
      category?: string;
      timeMs?: number;
    }[];
  };

  for (const s of snapshots) {
    const fs = s.finalState as FsT | null;
    if (!fs?.players) continue;
    const me = fs.players.find((p) => p.profileId === profile.id);
    if (!me) continue;

    const tel = s.telemetry as TelT | null;
    for (const a of tel?.warAnswers ?? []) {
      if (a.playerId !== me.id) continue;
      const cat = a.category ?? "general";
      const entry = categoryStats.get(cat) ?? { correct: 0, total: 0 };
      entry.total += 1;
      if (a.isCorrect) entry.correct += 1;
      categoryStats.set(cat, entry);
      if (typeof a.submittedAtMs === "number" && a.submittedAtMs > 0) {
        answerTimeSum += a.submittedAtMs;
        answerTimeCount += 1;
      }
    }
    for (const n of tel?.numericAnswers ?? []) {
      if (n.playerId !== me.id) continue;
      if (typeof n.timeMs === "number" && n.timeMs > 0) {
        answerTimeSum += n.timeMs;
        answerTimeCount += 1;
      }
    }
  }
  const winRate =
    profile.gamesPlayed > 0
      ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100)
      : 0;

  // Best category: highest accuracy with at least 3 attempts so a
  // 1-for-1 lucky guess in some niche category doesn't claim the
  // crown. Sub-3 sample? Just fall back to "—".
  const CATEGORY_LABELS: Record<string, string> = {
    geography: "Geography",
    history: "History",
    math: "Math",
    science: "Science",
    sports: "Sports",
    pop_culture: "Pop culture",
    language: "Language",
    general: "General",
  };
  const MIN_CATEGORY_SAMPLE = 3;
  let bestCategory: { label: string; pct: number } | null = null;
  for (const [cat, v] of categoryStats) {
    if (v.total < MIN_CATEGORY_SAMPLE) continue;
    const pct = Math.round((v.correct / v.total) * 100);
    if (!bestCategory || pct > bestCategory.pct) {
      bestCategory = { label: CATEGORY_LABELS[cat] ?? cat, pct };
    }
  }

  const avgAnswerSec =
    answerTimeCount > 0 ? answerTimeSum / answerTimeCount / 1000 : null;

  const statTiles = (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatBlock
        label="Matches"
        value={profile.gamesPlayed.toLocaleString()}
        sub="lifetime"
      />
      <StatBlock
        label="Win rate"
        value={`${winRate}%`}
        sub={`${profile.gamesWon.toLocaleString()} of ${profile.gamesPlayed.toLocaleString()}`}
        accent="var(--color-win)"
      />
      <StatBlock
        label="Best category"
        value={bestCategory ? `${bestCategory.pct}%` : "—"}
        sub={bestCategory ? bestCategory.label : "Not enough answers yet"}
        accent="var(--color-accent)"
      />
      <StatBlock
        label="Avg answer"
        value={avgAnswerSec !== null ? `${avgAnswerSec.toFixed(1)}s` : "—"}
        sub={
          answerTimeCount > 0
            ? `${answerTimeCount.toLocaleString()} answers`
            : "No data yet"
        }
        accent="var(--color-blue2)"
      />
      <StatBlock
        label="Peak ELO"
        value={peakElo.toLocaleString()}
        sub="all time"
        accent="var(--color-gold)"
      />
    </section>
  );

  let body: React.ReactNode;
  if (tab === "overview") {
    body = (
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          {statTiles}
          <EloChart history={eloHistory} startingElo={startingElo} />
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
            <PhasePerformance
              profileId={profile.id}
              snapshots={snapshots}
            />
            <MostCaptured
              profileId={profile.id}
              snapshots={snapshots}
            />
          </div>
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <AchievementsGrid unlocks={achievementRows} />
          {profileFriends.length > 0 ? (
            <FriendsPreview
              friends={profileFriends.map((f) => f.profile)}
              nickname={profile.nickname}
            />
          ) : (
            <PlayedWith profileId={profile.id} snapshots={snapshots} />
          )}
        </div>
      </div>
    );
  } else if (tab === "stats") {
    body = (
      <div className="flex flex-col gap-4 min-w-0">
        {statTiles}
        <EloChart history={eloHistory} startingElo={startingElo} />
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <PhasePerformance profileId={profile.id} snapshots={snapshots} />
          <MostCaptured profileId={profile.id} snapshots={snapshots} />
        </div>
      </div>
    );
  } else if (tab === "matches") {
    body = <MatchHistory profileId={profile.id} />;
  } else if (tab === "achievements") {
    body = (
      <AchievementsGrid unlocks={achievementRows} layout="wide" />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ProfileFriends
          nickname={profile.nickname}
          friends={profileFriends}
          isOwnProfile={isOwnProfile}
          incomingRequests={incomingRequests}
          outgoingRequests={outgoingRequests}
        />
        <PlayedWith profileId={profile.id} snapshots={snapshots} />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] text-white bg-canvas">
      <HeroHeader
        nickname={profile.nickname}
        avatarUrl={profile.avatarUrl}
        level={profile.level}
        elo={profile.elo}
        rank={myRank}
        streakKind={streakKind}
        streakLen={streakLen}
        country={profile.country}
        joinedAt={profile.createdAt}
        inGame={inGame}
        isOwnProfile={isOwnProfile}
        activeTab={tab}
        friendState={friendState}
        friendshipId={friendshipId}
      />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        {body}
      </div>
    </div>
  );
}
