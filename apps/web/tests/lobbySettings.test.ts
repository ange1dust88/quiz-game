// Covers the helpers consumed by the lobby UI and the Colyseus
// MatchRoom multi-language path. These functions are pure, so vitest
// against the shared module is enough — no DB / Colyseus stub needed.

import { describe, expect, it } from "vitest";
import {
  CAPITALS_TIMER_PRESETS,
  CATEGORY_LABEL,
  DEFAULT_LANGUAGE,
  EXPAND_TIMER_PRESETS,
  PLAYER_LANGUAGES,
  QUESTION_CATEGORIES,
  RANKED_DEFAULTS,
  WAR_TIMER_PRESETS,
  isPlayerLanguage,
  isQuestionCategory,
  isValidTimer,
  pickOptions,
  pickTranslation,
} from "@quiz/shared/lobbySettings";

describe("isQuestionCategory", () => {
  it("accepts every catalog value", () => {
    for (const c of QUESTION_CATEGORIES) {
      expect(isQuestionCategory(c)).toBe(true);
    }
  });
  it("rejects unknown values", () => {
    expect(isQuestionCategory("politics")).toBe(false);
    expect(isQuestionCategory("")).toBe(false);
    expect(isQuestionCategory("GEOGRAPHY")).toBe(false); // case-sensitive
  });
});

describe("isPlayerLanguage", () => {
  it("accepts every supported language", () => {
    for (const lang of PLAYER_LANGUAGES) {
      expect(isPlayerLanguage(lang)).toBe(true);
    }
  });
  it("rejects values outside the four-language set", () => {
    expect(isPlayerLanguage("de")).toBe(false);
    expect(isPlayerLanguage("EN")).toBe(false);
    expect(isPlayerLanguage("")).toBe(false);
  });
  it("uses 'en' as the documented default", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
  });
});

describe("isValidTimer", () => {
  it("accepts presets verbatim", () => {
    for (const p of CAPITALS_TIMER_PRESETS) {
      expect(isValidTimer(CAPITALS_TIMER_PRESETS, p)).toBe(true);
    }
    for (const p of EXPAND_TIMER_PRESETS) {
      expect(isValidTimer(EXPAND_TIMER_PRESETS, p)).toBe(true);
    }
    for (const p of WAR_TIMER_PRESETS) {
      expect(isValidTimer(WAR_TIMER_PRESETS, p)).toBe(true);
    }
  });
  it("rejects off-preset values + non-integers", () => {
    expect(isValidTimer(CAPITALS_TIMER_PRESETS, 25)).toBe(false);
    expect(isValidTimer(CAPITALS_TIMER_PRESETS, 0)).toBe(false);
    expect(isValidTimer(CAPITALS_TIMER_PRESETS, -10)).toBe(false);
    expect(isValidTimer(CAPITALS_TIMER_PRESETS, 20.5)).toBe(false);
    expect(isValidTimer(CAPITALS_TIMER_PRESETS, Number.NaN)).toBe(false);
  });
});

describe("RANKED_DEFAULTS", () => {
  it("only uses values from each preset set", () => {
    expect(CAPITALS_TIMER_PRESETS).toContain(RANKED_DEFAULTS.capitalsTimerSec);
    expect(EXPAND_TIMER_PRESETS).toContain(RANKED_DEFAULTS.expandTimerSec);
    expect(WAR_TIMER_PRESETS).toContain(RANKED_DEFAULTS.warTimerSec);
  });
});

describe("CATEGORY_LABEL", () => {
  it("has a label for every catalog category", () => {
    for (const c of QUESTION_CATEGORIES) {
      expect(CATEGORY_LABEL[c]).toBeTruthy();
    }
  });
});

describe("pickTranslation", () => {
  const sample = JSON.stringify({
    en: "Capital of France?",
    ru: "Столица Франции?",
    uk: "Столиця Франції?",
    pl: "Stolica Francji?",
  });

  it("returns the requested language", () => {
    expect(pickTranslation(sample, "ru")).toBe("Столица Франции?");
    expect(pickTranslation(sample, "pl")).toBe("Stolica Francji?");
  });
  it("falls back to English when the requested language is missing", () => {
    const enOnly = JSON.stringify({ en: "Hello" });
    expect(pickTranslation(enOnly, "ru")).toBe("Hello");
  });
  it("falls back to the supplied default for empty JSON", () => {
    expect(pickTranslation("", "ru", "fallback")).toBe("fallback");
    expect(pickTranslation("", "ru")).toBe("");
  });
  it("falls back to the supplied default for malformed JSON", () => {
    expect(pickTranslation("{not json", "en", "fallback")).toBe("fallback");
  });
  it("falls back to the supplied default when both target + en are missing", () => {
    const ruOnly = JSON.stringify({ ru: "Привет" });
    expect(pickTranslation(ruOnly, "pl", "fallback")).toBe("fallback");
  });
});

describe("pickOptions", () => {
  const sample = JSON.stringify({
    en: ["Paris", "London", "Berlin", "Madrid"],
    ru: ["Париж", "Лондон", "Берлин", "Мадрид"],
  });

  it("returns the requested language array", () => {
    expect(pickOptions(sample, "ru")).toEqual([
      "Париж",
      "Лондон",
      "Берлин",
      "Мадрид",
    ]);
  });
  it("falls back to English when the requested language is missing", () => {
    expect(pickOptions(sample, "uk")).toEqual([
      "Paris",
      "London",
      "Berlin",
      "Madrid",
    ]);
  });
  it("returns the supplied default for empty / malformed JSON", () => {
    expect(pickOptions("", "ru", ["fallback"])).toEqual(["fallback"]);
    expect(pickOptions("{not json", "en", ["fallback"])).toEqual(["fallback"]);
    expect(pickOptions("", "ru")).toEqual([]);
  });
});
