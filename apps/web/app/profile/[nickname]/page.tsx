import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import {
  EDUCATION_OPTIONS,
  GENDER_OPTIONS,
  MBTI_OPTIONS,
  OCCUPATION_OPTIONS,
  PERSONALITY_TRAITS,
  labelOf,
} from "@/app/lib/profileOptions";
import ProfileReminderBanner, {
  hasDemographicData,
} from "@/app/components/ui/ProfileReminderBanner";
import ActivityHeatmap from "./ActivityHeatmap";
import EloChart from "./EloChart";
import AchievementsGrid from "./AchievementsGrid";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const decodedNickname = decodeURIComponent(nickname);

  const profile = await prisma.playerProfile.findUnique({
    where: { nickname: decodedNickname },
  });

  if (!profile) notFound();

  const snapshots = await prisma.matchSnapshot.findMany({
    where: { session: { players: { some: { profileId: profile.id } } } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      sessionId: true,
      winnerId: true,
      duration: true,
      finalState: true,
      createdAt: true,
    },
  });
  const recentMatches = snapshots
    .map((s) => buildRecentMatchRow(s, profile.id))
    .filter((row): row is RecentMatchRow => row !== null);

  // Activity heatmap data — every MatchSnapshot the profile participated
  // in during the last 365 days. We only need createdAt; the dedicated
  // query is cheap and keeps the heatmap independent of the "last 10"
  // recents list above.
  const heatmapStart = new Date();
  heatmapStart.setHours(0, 0, 0, 0);
  heatmapStart.setDate(heatmapStart.getDate() - 365);
  const activityRows = await prisma.matchSnapshot.findMany({
    where: {
      session: { players: { some: { profileId: profile.id } } },
      createdAt: { gte: heatmapStart },
    },
    select: { createdAt: true },
  });

  // ELO trend — every match result we have on file for this profile,
  // ordered oldest → newest so the chart draws left-to-right.
  const eloHistory = await prisma.eloHistoryEntry.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "asc" },
    select: {
      eloAfter: true,
      delta: true,
      isWinner: true,
      createdAt: true,
    },
  });

  const achievementRows = await prisma.achievement.findMany({
    where: { profileId: profile.id },
    select: { code: true, unlockedAt: true },
  });
  // Starting ELO = current ELO undone by the cumulative deltas. Lets
  // the chart show "you started at 1000, now you're at X" even though
  // we never explicitly stored a starting-point row.
  const totalDelta = eloHistory.reduce((acc, e) => acc + e.delta, 0);
  const startingElo = profile.elo - totalDelta;

  // Live game pointer — used to surface an "in lobby / in match" banner
  // with a jump-back-to-lobby link. We pick the most recent join so a
  // player who's accidentally still listed in an old session doesn't see
  // a phantom banner.
  const activeGame = await prisma.playerInGame.findFirst({
    where: {
      profileId: profile.id,
      gameSession: { status: { in: ["waiting", "active"] } },
    },
    orderBy: { joinedAt: "desc" },
    select: {
      gameSessionId: true,
      gameSession: { select: { status: true } },
    },
  });

  const viewer = await getProfileSafe();
  const isOwnProfile = viewer?.id === profile.id;
  const showReminder = isOwnProfile && !hasDemographicData(profile);

  const gamesPlayed = profile.gamesPlayed;
  const gamesWon = profile.gamesWon;
  const gamesLost = profile.gamesLost;
  const winRate =
    gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;
  const xpForNext = profile.level * 1000;
  const xpProgress = Math.min(
    100,
    Math.round((profile.experience / xpForNext) * 100),
  );
  const initial = profile.nickname.charAt(0).toUpperCase();
  const memberSince = profile.createdAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-4xl mx-auto px-8 py-10 flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link
            href={viewer ? "/dashboard" : "/"}
            className="text-xs text-gray-400 hover:text-white transition-colors px-4 py-2 border border-[#4f4f4f] rounded-lg"
          >
            ← Back
          </Link>
          {isOwnProfile && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 uppercase tracking-widest">
                Your profile
              </span>
              <Link
                href="/settings"
                className="text-xs bg-blue-400 hover:bg-blue-500 transition-colors text-white px-4 py-2 rounded-lg"
              >
                Edit settings
              </Link>
            </div>
          )}
        </header>

        {showReminder && <ProfileReminderBanner />}

        {activeGame && (
          <ActiveGameBanner
            sessionId={activeGame.gameSessionId}
            status={activeGame.gameSession.status}
            isOwnProfile={isOwnProfile}
            nickname={profile.nickname}
          />
        )}

        <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-3xl font-bold shrink-0">
            {initial}
          </div>

          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-2xl font-semibold">{profile.nickname}</span>
              <span className="text-xs px-2 py-1 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Level {profile.level}
              </span>
            </div>

            <div className="text-xs text-gray-500">
              Member since {memberSince}
            </div>

            <div className="flex flex-col gap-1 mt-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>XP</span>
                <span>
                  {profile.experience} / {xpForNext}
                </span>
              </div>
              <div className="h-2 bg-[#292929] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-purple-500"
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end shrink-0">
            <span className="text-xs uppercase tracking-widest text-gray-400">
              ELO
            </span>
            <span className="text-3xl font-bold text-blue-400">
              {profile.elo}
            </span>
          </div>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Games Played" value={gamesPlayed} />
          <StatCard label="Wins" value={gamesWon} accent="text-green-400" />
          <StatCard label="Losses" value={gamesLost} accent="text-red-400" />
          <StatCard label="Win Rate" value={`${winRate}%`} />
        </section>

        <AchievementsGrid
          unlocks={achievementRows}
          isOwnProfile={isOwnProfile}
        />

        <EloChart history={eloHistory} startingElo={startingElo} />

        <ActivityHeatmap dates={activityRows.map((r) => r.createdAt)} />

        <RecentMatchesSection
          rows={recentMatches}
          nickname={profile.nickname}
        />

        {isOwnProfile && (
          <PersonalInfoSection
            profile={{
              birthYear: profile.birthYear,
              gender: profile.gender,
              country: profile.country,
              city: profile.city,
              education: profile.education,
              occupation: profile.occupation,
              mbti: profile.mbti,
              iqScore: profile.iqScore,
              personalityTraits: profile.personalityTraits,
            }}
          />
        )}
      </div>
    </div>
  );
}

function PersonalInfoSection({
  profile,
}: {
  profile: {
    birthYear: number | null;
    gender: string | null;
    country: string | null;
    city: string | null;
    education: string | null;
    occupation: string | null;
    mbti: string | null;
    iqScore: number | null;
    personalityTraits: string[];
  };
}) {
  const items: { label: string; value: string }[] = [];
  if (profile.birthYear)
    items.push({ label: "Birth year", value: String(profile.birthYear) });
  if (profile.gender)
    items.push({ label: "Gender", value: labelOf(profile.gender, GENDER_OPTIONS) });
  if (profile.country)
    items.push({ label: "Country", value: profile.country });
  if (profile.city) items.push({ label: "City", value: profile.city });
  if (profile.education)
    items.push({
      label: "Education",
      value: labelOf(profile.education, EDUCATION_OPTIONS),
    });
  if (profile.occupation)
    items.push({
      label: "Occupation",
      value: labelOf(profile.occupation, OCCUPATION_OPTIONS),
    });
  if (profile.mbti)
    items.push({ label: "MBTI", value: labelOf(profile.mbti, MBTI_OPTIONS) });
  if (profile.iqScore)
    items.push({ label: "IQ", value: String(profile.iqScore) });

  const hasAny =
    items.length > 0 ||
    (profile.personalityTraits && profile.personalityTraits.length > 0);

  return (
    <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-gray-400">
          Personal info
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-gray-600">
          Visible only to you
        </span>
      </div>

      {!hasAny ? (
        <p className="text-sm text-gray-500">
          You haven&apos;t filled out any personal info yet.{" "}
          <Link
            href="/settings"
            className="text-blue-400 hover:underline"
          >
            Add some now
          </Link>{" "}
          — it helps the diploma research and stays private.
        </p>
      ) : (
        <>
          {items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((it) => (
                <div
                  key={it.label}
                  className="bg-[#0d0d12]/60 border border-[#2a2a32] rounded-lg p-3 flex flex-col gap-0.5"
                >
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">
                    {it.label}
                  </span>
                  <span className="text-sm text-white">{it.value}</span>
                </div>
              ))}
            </div>
          )}

          {profile.personalityTraits &&
            profile.personalityTraits.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-widest text-gray-500">
                  Personality traits
                </span>
                <div className="flex flex-wrap gap-2">
                  {profile.personalityTraits.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-purple-500/15 text-purple-200 border border-purple-500/30 rounded-full px-2.5 py-1"
                    >
                      {labelOf(tag, PERSONALITY_TRAITS) || tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

        </>
      )}
    </section>
  );
}

// Live-game banner — pulses green when this profile is still in a lobby
// or mid-match. Clicking it lands the viewer on the lobby page (which
// auto-redirects to /match for active games where the viewer is a
// participant).
function ActiveGameBanner({
  sessionId,
  status,
  isOwnProfile,
  nickname,
}: {
  sessionId: string;
  status: string;
  isOwnProfile: boolean;
  nickname: string;
}) {
  const isWaiting = status === "waiting";
  const title = isOwnProfile
    ? isWaiting
      ? "You're in a lobby"
      : "You're in a match"
    : isWaiting
      ? `${nickname} is in a lobby`
      : `${nickname} is in a match`;
  const subtitle = isWaiting
    ? "Waiting for players to start."
    : "Match in progress.";
  const ctaLabel = isOwnProfile
    ? isWaiting
      ? "Return to lobby"
      : "Rejoin match"
    : "View lobby";
  return (
    <section className="bg-emerald-500/10 border border-emerald-400/40 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0"
          style={{ animation: "pulse 1.6s ease-in-out infinite" }}
        />
        <div className="leading-tight min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          <div className="text-xs text-gray-400 truncate">{subtitle}</div>
        </div>
      </div>
      <Link
        href={`/lobby/${sessionId}`}
        className="text-xs bg-emerald-400 hover:bg-emerald-500 text-black font-semibold px-4 py-2 rounded-lg shrink-0"
      >
        {ctaLabel}
      </Link>
    </section>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <span className={`text-2xl font-bold ${accent ?? "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

// --- Recent matches ----------------------------------------------------
//
// Hydrated from MatchSnapshot.finalState (a JSON blob produced by the
// Colyseus room at game_over). We pull the last 10 completed matches the
// profile took part in, then derive per-row stats client-free (server
// component, all done on the way down).

type SnapshotPlayer = {
  id: string;
  profileId: string;
  nickname: string;
  turnOrder: number;
};

type SnapshotCountry = {
  ownerId: string | null;
  points: number;
};

type RecentMatchRow = {
  sessionId: string;
  createdAt: Date;
  durationMs: number;
  totalPlayers: number;
  rank: number;
  isWin: boolean;
  myPoints: number;
  myLands: number;
  opponents: string[];
};

function buildRecentMatchRow(
  snapshot: {
    sessionId: string;
    winnerId: string | null;
    duration: number;
    finalState: unknown;
    createdAt: Date;
  },
  profileId: string,
): RecentMatchRow | null {
  const fs = snapshot.finalState as
    | { players?: SnapshotPlayer[]; countries?: SnapshotCountry[] }
    | null;
  if (!fs?.players || !fs.countries) return null;
  const me = fs.players.find((p) => p.profileId === profileId);
  if (!me) return null;

  const points = new Map<string, number>();
  const lands = new Map<string, number>();
  for (const c of fs.countries) {
    if (!c.ownerId) continue;
    points.set(c.ownerId, (points.get(c.ownerId) ?? 0) + c.points);
    lands.set(c.ownerId, (lands.get(c.ownerId) ?? 0) + 1);
  }
  const ranked = [...fs.players].sort(
    (a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0),
  );
  const rank = ranked.findIndex((p) => p.id === me.id) + 1;

  return {
    sessionId: snapshot.sessionId,
    createdAt: snapshot.createdAt,
    durationMs: snapshot.duration,
    totalPlayers: fs.players.length,
    rank: rank > 0 ? rank : fs.players.length,
    isWin: snapshot.winnerId === me.id,
    myPoints: points.get(me.id) ?? 0,
    myLands: lands.get(me.id) ?? 0,
    opponents: fs.players
      .filter((p) => p.id !== me.id)
      .map((p) => p.nickname),
  };
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelativeDate(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return "Today";
  if (diffMs < 2 * day) return "Yesterday";
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function RecentMatchesSection({
  rows,
  nickname,
}: {
  rows: RecentMatchRow[];
  nickname: string;
}) {
  return (
    <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-gray-400">
          Recent matches
        </h2>
        {rows.length > 0 && (
          <span className="text-[10px] uppercase tracking-widest text-gray-600">
            Last {rows.length}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          {nickname} hasn&apos;t finished any matches yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <RecentMatchRowItem key={row.sessionId} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentMatchRowItem({ row }: { row: RecentMatchRow }) {
  const resultColor = row.isWin
    ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
    : row.rank === 2
      ? "text-amber-300 bg-amber-300/10 border-amber-300/30"
      : "text-red-300 bg-red-300/10 border-red-300/30";
  const resultLabel = row.isWin
    ? "Win"
    : `#${row.rank}/${row.totalPlayers}`;
  const opponentsLabel =
    row.opponents.length === 0
      ? "Solo"
      : row.opponents.length <= 2
        ? row.opponents.join(", ")
        : `${row.opponents.slice(0, 2).join(", ")} +${row.opponents.length - 2}`;

  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0d0d12]/60 border border-[#2a2a32]">
      <span
        className={`text-[10px] font-semibold uppercase tracking-widest border rounded-md px-2 py-1 w-16 text-center ${resultColor}`}
      >
        {resultLabel}
      </span>
      <div className="flex-1 min-w-0 flex flex-col">
        <span className="text-sm text-white truncate">
          vs {opponentsLabel}
        </span>
        <span className="text-[11px] text-gray-500">
          {formatRelativeDate(row.createdAt)} · {formatDuration(row.durationMs)}
        </span>
      </div>
      <div className="hidden sm:flex flex-col items-end text-xs text-gray-400 shrink-0">
        <span className="text-white font-mono">
          {row.myPoints.toLocaleString()}
        </span>
        <span className="text-[10px] text-gray-500">
          {row.myLands} land{row.myLands === 1 ? "" : "s"}
        </span>
      </div>
    </li>
  );
}
