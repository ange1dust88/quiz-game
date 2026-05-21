// Lobby settings shared between Next.js and Colyseus. Question
// categories mirror the QuestionCategory Prisma enum exactly so the
// values round-trip safely through the DB; the timer presets give the
// host a sane bounded set of choices instead of free numeric input
// (avoids "0s" exploits or thousand-second griefs).

export const QUESTION_CATEGORIES = [
  "geography",
  "history",
  "math",
  "science",
  "sports",
  "pop_culture",
  "language",
  "general",
] as const;

export type QuestionCategoryKey = (typeof QUESTION_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<QuestionCategoryKey, string> = {
  geography: "Geography",
  history: "History",
  math: "Math",
  science: "Science",
  sports: "Sports",
  pop_culture: "Pop culture",
  language: "Language",
  general: "General",
};

export const CAPITALS_TIMER_PRESETS = [15, 20, 30, 45, 60] as const;
export const EXPAND_TIMER_PRESETS = [8, 10, 15, 20, 30] as const;
export const WAR_TIMER_PRESETS = [10, 15, 20, 30] as const;

// Ranked defaults — match the constants used in MatchRoom when no
// per-session override is provided.
export const RANKED_DEFAULTS = {
  capitalsTimerSec: 20,
  expandTimerSec: 10,
  warTimerSec: 15,
} as const;

export function isQuestionCategory(v: string): v is QuestionCategoryKey {
  return (QUESTION_CATEGORIES as readonly string[]).includes(v);
}

export function isValidTimer(
  presets: readonly number[],
  value: number,
): boolean {
  return Number.isInteger(value) && presets.includes(value);
}
