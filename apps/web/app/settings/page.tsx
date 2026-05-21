// FACEIT-style settings screen. Hero strip (Slash badge + heading) +
// research disclaimer + avatar moderation card + a single sharp-bordered
// edit-profile form broken into PanelCard sections.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import {
  EDUCATION_OPTIONS,
  GENDER_OPTIONS,
  MBTI_OPTIONS,
  OCCUPATION_OPTIONS,
  PERSONALITY_TRAITS,
} from "@/app/lib/profileOptions";
import PanelCard from "@/app/components/ui/PanelCard";
import Slash from "@/app/components/ui/Slash";
import { updateSettings } from "./actions";
import AvatarUploadSection from "./AvatarUploadSection";

export default async function SettingsPage() {
  const profile = await getProfileSafe();
  if (!profile) redirect("/login");

  const checkedTraits = new Set(profile.personalityTraits ?? []);

  // Latest submission (any status). Drives the "Pending review" /
  // "Rejected: <reason>" banner under the upload field.
  const latestSubmission = await prisma.avatarSubmission.findFirst({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      publicUrl: true,
      rejectionReason: true,
      createdAt: true,
      reviewedAt: true,
    },
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] text-white bg-canvas">
      <section className="relative overflow-hidden border-b border-stroke bg-gradient-to-br from-surface-hi via-panel to-canvas">
        <div
          className="absolute right-[-80px] top-0 bottom-0 w-[200px] bg-accent/10"
          style={{ transform: "skewX(-12deg)" }}
          aria-hidden
        />
        <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-2">
            <Slash label="Settings" />
            <h1 className="font-head text-4xl text-white leading-none">
              EDIT PROFILE
            </h1>
          </div>
          <Link
            href={`/profile/${encodeURIComponent(profile.nickname)}`}
            className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-4 py-2"
          >
            ← Back to profile
          </Link>
        </div>
      </section>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
        <div
          className="border px-4 py-3 flex flex-col gap-1"
          style={{
            background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
            borderColor: "color-mix(in srgb, var(--color-accent) 35%, transparent)",
          }}
        >
          <span className="font-head text-[10px] text-accent">Why we ask</span>
          <p className="font-body text-xs text-mute leading-relaxed">
            These fields help train an analytical model for the diploma
            research accompanying this project.{" "}
            <span className="text-white font-semibold">
              All fields are optional
            </span>{" "}
            and visible only to you.
          </p>
        </div>

        <AvatarUploadSection
          nickname={profile.nickname}
          currentAvatarUrl={profile.avatarUrl}
          latestSubmission={latestSubmission}
        />

        <form action={updateSettings} className="flex flex-col gap-4">
          <PanelCard title="Language" accent="#ff6cf3">
            <Field label="Question language">
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="cursor-pointer select-none"
                  >
                    <input
                      type="radio"
                      name="language"
                      value={opt.value}
                      defaultChecked={profile.language === opt.value}
                      className="peer sr-only"
                    />
                    <span className="inline-flex items-center gap-2 font-head text-[11px] px-3 py-1.5 border border-stroke bg-canvas text-mute peer-checked:bg-accent peer-checked:border-accent peer-checked:text-accent-fg hover:border-mute transition-colors">
                      <span aria-hidden>{opt.flag}</span>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
              <span className="font-mono text-[10px] text-dim mt-1.5">
                Questions in match render in this language. Other players
                in the lobby see their own language.
              </span>
            </Field>
          </PanelCard>

          <PanelCard title="About you" accent="#1ed3ff">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Birth year">
                <input
                  type="number"
                  name="birthYear"
                  min={1900}
                  max={new Date().getFullYear()}
                  placeholder="e.g. 1998"
                  defaultValue={profile.birthYear ?? ""}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Gender">
                <Select
                  name="gender"
                  value={profile.gender}
                  options={GENDER_OPTIONS}
                />
              </Field>
            </div>
          </PanelCard>

          <PanelCard title="Location" accent="#7c8aff">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Country">
                <input
                  type="text"
                  name="country"
                  placeholder="e.g. Poland"
                  maxLength={60}
                  defaultValue={profile.country ?? ""}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="City">
                <input
                  type="text"
                  name="city"
                  placeholder="e.g. Warsaw"
                  maxLength={80}
                  defaultValue={profile.city ?? ""}
                  className={INPUT_CLS}
                />
              </Field>
            </div>
          </PanelCard>

          <PanelCard title="Education & work" accent="#3fcf6c">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Education level">
                <Select
                  name="education"
                  value={profile.education}
                  options={EDUCATION_OPTIONS}
                />
              </Field>
              <Field label="Occupation / field">
                <Select
                  name="occupation"
                  value={profile.occupation}
                  options={OCCUPATION_OPTIONS}
                />
              </Field>
            </div>
          </PanelCard>

          <PanelCard title="Self-assessment" accent="#ff6cf3">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="MBTI personality type">
                  <Select
                    name="mbti"
                    value={profile.mbti}
                    options={MBTI_OPTIONS}
                  />
                </Field>
                <Field label="IQ score (if known)">
                  <input
                    type="number"
                    name="iqScore"
                    min={50}
                    max={200}
                    placeholder="e.g. 120"
                    defaultValue={profile.iqScore ?? ""}
                    className={INPUT_CLS}
                  />
                </Field>
              </div>

              <Field label="Personality traits — pick any that fit">
                <div className="flex flex-wrap gap-1.5">
                  {PERSONALITY_TRAITS.map((t) => (
                    <label key={t.value} className="cursor-pointer select-none">
                      <input
                        type="checkbox"
                        name="trait"
                        value={t.value}
                        defaultChecked={checkedTraits.has(t.value)}
                        className="peer sr-only"
                      />
                      <span className="inline-block font-head text-[11px] px-3 py-1.5 border border-stroke bg-canvas text-mute peer-checked:bg-accent peer-checked:border-accent peer-checked:text-accent-fg hover:border-mute transition-colors">
                        {t.label}
                      </span>
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          </PanelCard>

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href={`/profile/${encodeURIComponent(profile.nickname)}`}
              className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-5 py-2"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="font-head text-sm font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-6 py-2"
              style={{ transform: "skewX(-10deg)" }}
            >
              <span
                className="inline-block"
                style={{ transform: "skewX(10deg)" }}
              >
                Save
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const INPUT_CLS =
  "bg-canvas border border-stroke focus:border-accent focus:outline-none px-3 py-2 font-mono text-sm text-white placeholder:text-dim w-full";

// Mirrors packages/shared lobbySettings — kept inline so this server
// component doesn't need a shared file just for 4 chips.
const LANGUAGE_OPTIONS: { value: string; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "ru", label: "Русский", flag: "🇷🇺" },
  { value: "uk", label: "Українська", flag: "🇺🇦" },
  { value: "pl", label: "Polski", flag: "🇵🇱" },
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-head text-[10px] text-dim">{label}</span>
      {children}
    </label>
  );
}

function Select({
  name,
  value,
  options,
}: {
  name: string;
  value: string | null;
  options: { value: string; label: string }[];
}) {
  return (
    <select name={name} defaultValue={value ?? ""} className={INPUT_CLS}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
