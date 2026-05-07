import { describe, expect, it } from "vitest";
import {
  EDUCATION_OPTIONS,
  GENDER_OPTIONS,
  isValidOption,
  labelOf,
  MBTI_OPTIONS,
  OCCUPATION_OPTIONS,
  PERSONALITY_TRAITS,
} from "@/app/lib/profileOptions";

describe("profile option catalogues", () => {
  it("each option list has at least one entry", () => {
    expect(GENDER_OPTIONS.length).toBeGreaterThan(0);
    expect(EDUCATION_OPTIONS.length).toBeGreaterThan(0);
    expect(OCCUPATION_OPTIONS.length).toBeGreaterThan(0);
    expect(MBTI_OPTIONS.length).toBeGreaterThan(0);
    expect(PERSONALITY_TRAITS.length).toBeGreaterThan(0);
  });

  it("MBTI list contains all 16 canonical types", () => {
    const codes = MBTI_OPTIONS.filter((o) => o.value !== "").map(
      (o) => o.value,
    );
    const expected = [
      "INTJ", "INTP", "ENTJ", "ENTP",
      "INFJ", "INFP", "ENFJ", "ENFP",
      "ISTJ", "ISFJ", "ESTJ", "ESFJ",
      "ISTP", "ISFP", "ESTP", "ESFP",
    ];
    expect(new Set(codes)).toEqual(new Set(expected));
  });

  it("option values are unique within each list", () => {
    for (const list of [
      GENDER_OPTIONS,
      EDUCATION_OPTIONS,
      OCCUPATION_OPTIONS,
      MBTI_OPTIONS,
      PERSONALITY_TRAITS,
    ]) {
      const values = list.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("trait values use snake_case (no spaces) for clean DB storage", () => {
    for (const t of PERSONALITY_TRAITS) {
      expect(t.value).not.toMatch(/\s/);
    }
  });
});

describe("isValidOption", () => {
  it("returns true for a known value", () => {
    expect(isValidOption("master", EDUCATION_OPTIONS)).toBe(true);
    expect(isValidOption("INTJ", MBTI_OPTIONS)).toBe(true);
    expect(isValidOption("analytical", PERSONALITY_TRAITS)).toBe(true);
  });

  it("returns false for an unknown value", () => {
    expect(isValidOption("supreme_leader", EDUCATION_OPTIONS)).toBe(false);
    expect(isValidOption("XXXX", MBTI_OPTIONS)).toBe(false);
  });

  it("treats blank string per its presence in the option list", () => {
    // GENDER_OPTIONS / EDUCATION_OPTIONS include "" as the "—" sentinel.
    expect(isValidOption("", GENDER_OPTIONS)).toBe(true);
    // PERSONALITY_TRAITS does not — there's no "blank trait".
    expect(isValidOption("", PERSONALITY_TRAITS)).toBe(false);
  });
});

describe("labelOf", () => {
  it("returns the human label for a known value", () => {
    expect(labelOf("master", EDUCATION_OPTIONS)).toBe("Master's degree");
    expect(labelOf("analytical", PERSONALITY_TRAITS)).toBe("Analytical");
  });

  it("returns empty string for null", () => {
    expect(labelOf(null, EDUCATION_OPTIONS)).toBe("");
  });

  it("falls back to the raw value if no matching option exists", () => {
    expect(labelOf("unknown_thing", EDUCATION_OPTIONS)).toBe("unknown_thing");
  });
});
