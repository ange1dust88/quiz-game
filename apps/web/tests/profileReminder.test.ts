import { describe, expect, it } from "vitest";
import { hasDemographicData } from "@/app/components/ui/ProfileReminderBanner";

const empty = {
  birthYear: null,
  gender: null,
  country: null,
  city: null,
  education: null,
  occupation: null,
  mbti: null,
  iqScore: null,
  personalityTraits: [] as string[],
};

describe("hasDemographicData", () => {
  it("returns false when every field is empty / null", () => {
    expect(hasDemographicData(empty)).toBe(false);
  });

  it("returns true when birthYear is set", () => {
    expect(hasDemographicData({ ...empty, birthYear: 1998 })).toBe(true);
  });

  it("returns true when gender is set", () => {
    expect(hasDemographicData({ ...empty, gender: "female" })).toBe(true);
  });

  it("returns true when country / city alone is filled", () => {
    expect(hasDemographicData({ ...empty, country: "Poland" })).toBe(true);
    expect(hasDemographicData({ ...empty, city: "Warsaw" })).toBe(true);
  });

  it("returns true when MBTI is picked", () => {
    expect(hasDemographicData({ ...empty, mbti: "INTJ" })).toBe(true);
  });

  it("returns true when iqScore is provided", () => {
    expect(hasDemographicData({ ...empty, iqScore: 120 })).toBe(true);
  });

  it("returns true when at least one personality trait is selected", () => {
    expect(
      hasDemographicData({
        ...empty,
        personalityTraits: ["analytical"],
      }),
    ).toBe(true);
  });

  it("returns false when personalityTraits is an empty array", () => {
    expect(
      hasDemographicData({ ...empty, personalityTraits: [] }),
    ).toBe(false);
  });

  it("treats numeric 0 birth year as falsy (counts as not set)", () => {
    // Defensive: a 0 likely means parse failure, not "year zero AD".
    expect(hasDemographicData({ ...empty, birthYear: 0 })).toBe(false);
  });
});
