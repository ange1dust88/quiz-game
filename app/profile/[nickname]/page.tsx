import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getProfileSafe } from "@/app/lib/auth";
import {
  EDUCATION_OPTIONS,
  GENDER_OPTIONS,
  MBTI_OPTIONS,
  OCCUPATION_OPTIONS,
  PERSONALITY_TRAITS,
  labelOf,
} from "@/app/lib/profileOptions";

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

  const viewer = await getProfileSafe();
  const isOwnProfile = viewer?.id === profile.id;

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
          You haven't filled out any personal info yet.{" "}
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
