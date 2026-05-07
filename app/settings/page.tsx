import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfileSafe } from "@/app/lib/auth";
import {
  EDUCATION_OPTIONS,
  GENDER_OPTIONS,
  MBTI_OPTIONS,
  OCCUPATION_OPTIONS,
  PERSONALITY_TRAITS,
} from "@/app/lib/profileOptions";
import { updateSettings } from "./actions";

export default async function SettingsPage() {
  const profile = await getProfileSafe();
  if (!profile) redirect("/login");

  const checkedTraits = new Set(profile.personalityTraits ?? []);

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-3xl mx-auto px-8 py-10 flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <Link
            href={`/profile/${encodeURIComponent(profile.nickname)}`}
            className="text-xs text-gray-400 hover:text-white transition-colors px-4 py-2 border border-[#4f4f4f] rounded-lg"
          >
            ← Back to profile
          </Link>
          <span className="text-xs text-gray-500 uppercase tracking-widest">
            Settings
          </span>
        </header>

        <section className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-100 flex gap-3">
          <span className="text-lg shrink-0">ℹ️</span>
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Why we ask</span>
            <span className="text-blue-200/80 text-xs leading-relaxed">
              These fields help us train an analytical model that better
              understands player behavior — used in the diploma research
              accompanying this project. <strong>All fields are optional</strong>{" "}
              and visible only to you. Thanks for sharing if you choose to!
            </span>
          </div>
        </section>

        <form
          action={updateSettings}
          className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-6"
        >
          <h1 className="text-xl font-semibold">Edit your profile</h1>

          <FormSection title="About you">
            <Field label="Birth year">
              <input
                type="number"
                name="birthYear"
                min={1900}
                max={new Date().getFullYear()}
                placeholder="e.g. 1998"
                defaultValue={profile.birthYear ?? ""}
                className="bg-[#0d0d12] border border-[#4f4f4f] focus:border-blue-400 focus:outline-none rounded-md px-3 py-2 text-sm w-full"
              />
            </Field>

            <Field label="Gender">
              <Select
                name="gender"
                value={profile.gender}
                options={GENDER_OPTIONS}
              />
            </Field>
          </FormSection>

          <FormSection title="Location">
            <Field label="Country">
              <input
                type="text"
                name="country"
                placeholder="e.g. Poland"
                maxLength={60}
                defaultValue={profile.country ?? ""}
                className="bg-[#0d0d12] border border-[#4f4f4f] focus:border-blue-400 focus:outline-none rounded-md px-3 py-2 text-sm w-full"
              />
            </Field>

            <Field label="City">
              <input
                type="text"
                name="city"
                placeholder="e.g. Warsaw"
                maxLength={80}
                defaultValue={profile.city ?? ""}
                className="bg-[#0d0d12] border border-[#4f4f4f] focus:border-blue-400 focus:outline-none rounded-md px-3 py-2 text-sm w-full"
              />
            </Field>
          </FormSection>

          <FormSection title="Education & work">
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
          </FormSection>

          <FormSection title="Self-assessment" columns={1}>
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
                  className="bg-[#0d0d12] border border-[#4f4f4f] focus:border-blue-400 focus:outline-none rounded-md px-3 py-2 text-sm w-full"
                />
              </Field>
            </div>

            <Field label="Personality traits — pick any that fit">
              <div className="flex flex-wrap gap-2">
                {PERSONALITY_TRAITS.map((t) => (
                  <label key={t.value} className="cursor-pointer select-none">
                    <input
                      type="checkbox"
                      name="trait"
                      value={t.value}
                      defaultChecked={checkedTraits.has(t.value)}
                      className="peer sr-only"
                    />
                    <span className="inline-block text-xs px-3 py-1.5 rounded-full border border-[#4f4f4f] bg-[#0d0d12] text-gray-300 peer-checked:bg-blue-500/20 peer-checked:border-blue-400 peer-checked:text-blue-100 hover:border-[#6f6f6f] transition-colors">
                      {t.label}
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          </FormSection>

          <div className="flex justify-end gap-3 pt-2 border-t border-[#2a2a32]">
            <Link
              href={`/profile/${encodeURIComponent(profile.nickname)}`}
              className="border border-[#4f4f4f] bg-[#1a1a1a] hover:bg-[#292929] transition-colors px-4 py-2 rounded-lg text-sm"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="bg-blue-400 hover:bg-blue-500 transition-colors text-white px-6 py-2 rounded-lg font-medium text-sm"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormSection({
  title,
  columns = 2,
  children,
}: {
  title: string;
  columns?: 1 | 2;
  children: React.ReactNode;
}) {
  const grid =
    columns === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs uppercase tracking-widest text-gray-500">
        {title}
      </legend>
      <div className={`grid ${grid} gap-4`}>{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-gray-400">{label}</span>
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
    <select
      name={name}
      defaultValue={value ?? ""}
      className="bg-[#0d0d12] border border-[#4f4f4f] focus:border-blue-400 focus:outline-none rounded-md px-3 py-2 text-sm w-full"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
