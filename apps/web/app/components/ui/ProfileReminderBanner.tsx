import Link from "next/link";

// Inputs the banner cares about — any one filled flips the profile to "started".
type ProfileSnapshot = {
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

export function hasDemographicData(profile: ProfileSnapshot): boolean {
  return Boolean(
    profile.birthYear ||
      profile.gender ||
      profile.country ||
      profile.city ||
      profile.education ||
      profile.occupation ||
      profile.mbti ||
      profile.iqScore ||
      (profile.personalityTraits && profile.personalityTraits.length > 0),
  );
}

export default function ProfileReminderBanner({
  variant = "default",
}: {
  variant?: "default" | "compact";
}) {
  const isCompact = variant === "compact";
  return (
    <section
      className={`bg-amber-500/10 border border-amber-500/30 rounded-xl ${
        isCompact ? "p-3" : "p-4"
      } flex items-start gap-3`}
    >
      <span className="text-2xl shrink-0">🧪</span>
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-amber-100 text-sm">
            Help our research — finish your profile
          </span>
          <span className="text-xs text-amber-200/80 leading-relaxed">
            A few optional details (age, education, MBTI, traits…) make your
            game data way more useful for the diploma analysis. Visible only
            to you, takes under a minute.
          </span>
        </div>
        <div>
          <Link
            href="/settings"
            className="inline-block bg-amber-400 hover:bg-amber-500 transition-colors text-black font-medium text-xs px-4 py-1.5 rounded-md"
          >
            Complete profile →
          </Link>
        </div>
      </div>
    </section>
  );
}
