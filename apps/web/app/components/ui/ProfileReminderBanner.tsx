// Small "complete your demographic profile" nudge. Lives in the right
// sidebar of the dashboard so it doesn't disrupt the hero / stats flow
// in the main column. Gold accent because it's optional + research-y.

import Link from "next/link";
import PanelCard from "./PanelCard";

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

// Any one filled flips the profile to "started" so we stop pestering.
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

export default function ProfileReminderBanner() {
  return (
    <PanelCard title="Complete profile" accent="#ffc24a">
      <div className="flex flex-col gap-2.5">
        <p className="font-body text-[12px] text-mute leading-relaxed">
          A few optional details (age, education, MBTI, traits…) make your
          game data way more useful for the diploma research. Visible only
          to you, under a minute.
        </p>
        <Link
          href="/settings"
          className="font-head text-[11px] font-extrabold text-accent-fg bg-gold hover:opacity-90 transition-opacity px-4 py-1.5 w-fit"
        >
          Complete profile →
        </Link>
      </div>
    </PanelCard>
  );
}
