import Link from "next/link";
import Input from "../components/ui/Input";
import { getProfileSafe } from "../lib/auth";
import { logout } from "../login/actions";
import { createRoom, joinRoom } from "./actions";
import CreateRoomButton from "./CreateRoomButton";
import ProfileReminderBanner, {
  hasDemographicData,
} from "../components/ui/ProfileReminderBanner";

export default async function Dashboard() {
  const profile = await getProfileSafe();

  const gamesPlayed = profile?.gamesPlayed ?? 0;
  const gamesWon = profile?.gamesWon ?? 0;
  const gamesLost = profile?.gamesLost ?? 0;
  const winRate =
    gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;
  const xpForNext = (profile?.level ?? 1) * 1000;
  const xpProgress = Math.min(
    100,
    Math.round(((profile?.experience ?? 0) / xpForNext) * 100),
  );

  const initial = (profile?.nickname ?? "?").charAt(0).toUpperCase();
  const showReminder = profile ? !hasDemographicData(profile) : false;

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-6xl mx-auto px-8 py-10 flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-gray-400">
              Dashboard
            </p>
            <h1 className="text-3xl font-bold mt-1">
              Welcome back
              {profile?.nickname ? (
                <span className="text-blue-400">, {profile.nickname}</span>
              ) : null}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/analytics"
              className="border border-[#4f4f4f] bg-[#1a1a1a] hover:bg-[#292929] transition-colors px-4 py-2 rounded-lg text-sm"
            >
              Analytics
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="border border-[#4f4f4f] bg-[#1a1a1a] hover:bg-[#292929] transition-colors px-4 py-2 rounded-lg text-sm"
              >
                Logout
              </button>
            </form>
          </div>
        </header>

        {showReminder && <ProfileReminderBanner />}

        <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-3xl font-bold shrink-0">
            {initial}
          </div>

          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-2xl font-semibold">
                {profile?.nickname ?? "Player"}
              </span>
              <span className="text-xs px-2 py-1 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Level {profile?.level ?? 1}
              </span>
              {profile?.country && (
                <span className="text-xs text-gray-400">
                  {profile.country}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>XP</span>
                <span>
                  {profile?.experience ?? 0} / {xpForNext}
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

          <div className="hidden sm:flex flex-col items-end shrink-0 gap-2">
            <span className="text-xs uppercase tracking-widest text-gray-400">
              ELO
            </span>
            <span className="text-3xl font-bold text-blue-400">
              {profile?.elo ?? 1000}
            </span>
            {profile && (
              <Link
                href={`/profile/${encodeURIComponent(profile.nickname)}`}
                className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 border border-[#4f4f4f] rounded-lg"
              >
                View profile
              </Link>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Games Played" value={gamesPlayed} />
          <StatCard label="Wins" value={gamesWon} accent="text-green-400" />
          <StatCard label="Losses" value={gamesLost} accent="text-red-400" />
          <StatCard label="Win Rate" value={`${winRate}%`} />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <form
            action={createRoom}
            className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] hover:border-blue-500/60 transition-colors rounded-2xl p-6 flex flex-col gap-4 justify-between"
          >
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">Create Game</h2>
              <p className="text-sm text-[#9a9a9a]">
                Start a new match and invite friends with a room ID.
              </p>
            </div>

            <CreateRoomButton />
          </form>

          <form
            action={joinRoom}
            className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] hover:border-blue-500/60 transition-colors rounded-2xl p-6 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">Join Game</h2>
              <p className="text-sm text-[#9a9a9a]">
                Enter a room ID to join an existing match.
              </p>
            </div>

            <Input
              placeholder="Room ID"
              type="text"
              id="roomId"
              name="roomId"
            />

            <button className="bg-blue-400 hover:bg-blue-500 transition-colors text-white px-6 py-3 rounded-lg font-medium">
              Join
            </button>
          </form>
        </section>
      </div>
    </div>
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
