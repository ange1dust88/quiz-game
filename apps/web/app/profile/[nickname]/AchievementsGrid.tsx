// Grid of every achievement in the catalogue. Unlocked ones show the
// icon + name + unlock date in colour. Locked ones are greyed out with
// the description still visible so visitors know what's possible.

import {
  ACHIEVEMENTS,
  type AchievementDef,
} from "@quiz/shared/achievements";

type Unlock = { code: string; unlockedAt: Date };

type Props = {
  unlocks: Unlock[];
  isOwnProfile: boolean;
};

const CATEGORY_BORDER: Record<AchievementDef["category"], string> = {
  play: "border-blue-400/50 bg-blue-500/10",
  skill: "border-emerald-400/50 bg-emerald-500/10",
  rating: "border-amber-400/50 bg-amber-500/10",
  profile: "border-purple-400/50 bg-purple-500/10",
};

export default function AchievementsGrid({ unlocks, isOwnProfile }: Props) {
  const byCode = new Map(unlocks.map((u) => [u.code, u.unlockedAt]));
  const earnedCount = unlocks.length;

  return (
    <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-gray-400">
          Achievements
        </h2>
        <span className="text-xs text-gray-500">
          {earnedCount} / {ACHIEVEMENTS.length} unlocked
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {ACHIEVEMENTS.map((a) => {
          const unlockedAt = byCode.get(a.code);
          const unlocked = Boolean(unlockedAt);
          return (
            <div
              key={a.code}
              className={`relative flex items-start gap-3 p-3 rounded-xl border-2 transition-colors ${
                unlocked
                  ? CATEGORY_BORDER[a.category]
                  : "border-[#2a2a32] bg-[#0d0d12]/40"
              }`}
              title={
                unlocked && unlockedAt
                  ? `Unlocked ${unlockedAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}`
                  : isOwnProfile
                    ? "Locked — keep playing to unlock"
                    : "Locked"
              }
            >
              <span
                className={`text-2xl shrink-0 w-8 h-8 inline-flex items-center justify-center ${
                  unlocked ? "" : "grayscale opacity-40"
                }`}
                aria-hidden="true"
              >
                {a.icon}
              </span>
              <div className="flex flex-col min-w-0 gap-0.5">
                <span
                  className={`text-sm font-semibold leading-tight ${
                    unlocked ? "text-white" : "text-gray-400"
                  }`}
                >
                  {a.name}
                </span>
                <span
                  className={`text-[11px] leading-snug ${
                    unlocked ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {a.description}
                </span>
                {unlocked && unlockedAt && (
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 mt-0.5">
                    {unlockedAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
