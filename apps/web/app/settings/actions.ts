"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile } from "@/app/lib/auth";
import { prisma } from "@quiz/db";
import {
  EDUCATION_OPTIONS,
  GENDER_OPTIONS,
  MBTI_OPTIONS,
  OCCUPATION_OPTIONS,
  PERSONALITY_TRAITS,
  isValidOption,
} from "@/app/lib/profileOptions";
import { evaluateAchievements } from "@quiz/shared/achievements";

const MAX_TRAITS = 16;
const MIN_BIRTH_YEAR = 1900;
const MIN_IQ = 50;
const MAX_IQ = 200;

function trimmed(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

// Whitelist a string against a set of valid option values. Returns null
// if the input is blank or doesn't match — null becomes "unset" in the DB.
function whitelisted(
  value: string,
  options: { value: string }[],
): string | null {
  if (!value) return null;
  return isValidOption(value, options as never) ? value : null;
}

export async function updateSettings(formData: FormData) {
  const profile = await getProfile();

  const birthYearRaw = trimmed(formData, "birthYear");
  const currentYear = new Date().getFullYear();
  const birthYearParsed = /^\d{4}$/.test(birthYearRaw)
    ? parseInt(birthYearRaw, 10)
    : null;
  const birthYear =
    birthYearParsed !== null &&
    birthYearParsed >= MIN_BIRTH_YEAR &&
    birthYearParsed <= currentYear
      ? birthYearParsed
      : null;

  const iqRaw = trimmed(formData, "iqScore");
  const iqParsed = /^\d{1,3}$/.test(iqRaw) ? parseInt(iqRaw, 10) : null;
  const iqScore =
    iqParsed !== null && iqParsed >= MIN_IQ && iqParsed <= MAX_IQ
      ? iqParsed
      : null;

  // Multi-checkbox: each ticked trait sends `trait=<value>` — getAll() collects all.
  const traitInput = formData.getAll("trait").filter(
    (v): v is string => typeof v === "string",
  );
  const validTraitValues = new Set(PERSONALITY_TRAITS.map((t) => t.value));
  const personalityTraits = Array.from(
    new Set(traitInput.filter((t) => validTraitValues.has(t))),
  ).slice(0, MAX_TRAITS);

  await prisma.playerProfile.update({
    where: { id: profile.id },
    data: {
      birthYear,
      iqScore,
      gender: whitelisted(trimmed(formData, "gender"), GENDER_OPTIONS),
      country: trimmed(formData, "country") || null,
      city: trimmed(formData, "city") || null,
      education: whitelisted(
        trimmed(formData, "education"),
        EDUCATION_OPTIONS,
      ),
      occupation: whitelisted(
        trimmed(formData, "occupation"),
        OCCUPATION_OPTIONS,
      ),
      mbti: whitelisted(trimmed(formData, "mbti"), MBTI_OPTIONS),
      personalityTraits,
    },
  });

  // After the demographic update, re-evaluate the achievement catalogue
  // — `profile_complete` flips once all five required fields are set.
  // Cheap; the unique constraint makes it idempotent.
  try {
    const fresh = await prisma.playerProfile.findUnique({
      where: { id: profile.id },
      select: {
        gamesPlayed: true,
        gamesWon: true,
        elo: true,
        birthYear: true,
        gender: true,
        education: true,
        occupation: true,
        mbti: true,
      },
    });
    if (fresh) {
      const recent = await prisma.eloHistoryEntry.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { isWinner: true },
      });
      const have = new Set(
        (
          await prisma.achievement.findMany({
            where: { profileId: profile.id },
            select: { code: true },
          })
        ).map((r) => r.code),
      );
      const earned = evaluateAchievements({
        gamesPlayed: fresh.gamesPlayed,
        gamesWon: fresh.gamesWon,
        elo: fresh.elo,
        recentWins: recent.map((r) => r.isWinner),
        demographicComplete: Boolean(
          fresh.birthYear &&
            fresh.gender &&
            fresh.education &&
            fresh.occupation &&
            fresh.mbti,
        ),
      });
      const fresh_codes = earned.filter((c) => !have.has(c));
      if (fresh_codes.length > 0) {
        await prisma.achievement.createMany({
          data: fresh_codes.map((code) => ({ profileId: profile.id, code })),
          skipDuplicates: true,
        });
      }
    }
  } catch {
    // Non-fatal — settings save succeeds even if achievement eval fails.
  }

  revalidatePath(`/profile/${encodeURIComponent(profile.nickname)}`);
  revalidatePath("/dashboard");
  redirect(`/profile/${encodeURIComponent(profile.nickname)}`);
}
