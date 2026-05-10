// Canonical option lists for profile demographic + psychometric fields.
// Used by both the /settings form (rendering selects) and the
// updateSettings action (validating server-side input). Keeping a single
// source of truth prevents the form and validator from drifting.

export type Option = { value: string; label: string };

export const GENDER_OPTIONS: Option[] = [
  { value: "", label: "Prefer not to say" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "other", label: "Other" },
];

export const EDUCATION_OPTIONS: Option[] = [
  { value: "", label: "—" },
  { value: "high_school", label: "High school" },
  { value: "vocational", label: "Vocational / technical" },
  { value: "bachelor", label: "Bachelor's degree" },
  { value: "master", label: "Master's degree" },
  { value: "phd", label: "PhD / Doctorate" },
  { value: "other", label: "Other" },
];

export const OCCUPATION_OPTIONS: Option[] = [
  { value: "", label: "—" },
  { value: "tech", label: "Technology / IT" },
  { value: "engineering", label: "Engineering" },
  { value: "healthcare", label: "Healthcare / Medicine" },
  { value: "education", label: "Education / Academia" },
  { value: "business", label: "Business / Finance" },
  { value: "arts", label: "Creative / Arts" },
  { value: "science", label: "Science / Research" },
  { value: "service", label: "Service / Retail" },
  { value: "trade", label: "Trade / Manual" },
  { value: "government", label: "Government / Public sector" },
  { value: "student", label: "Student" },
  { value: "unemployed", label: "Unemployed / Between jobs" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
];

export const MBTI_OPTIONS: Option[] = [
  { value: "", label: "Don't know / Prefer not to say" },
  { value: "INTJ", label: "INTJ — Architect" },
  { value: "INTP", label: "INTP — Logician" },
  { value: "ENTJ", label: "ENTJ — Commander" },
  { value: "ENTP", label: "ENTP — Debater" },
  { value: "INFJ", label: "INFJ — Advocate" },
  { value: "INFP", label: "INFP — Mediator" },
  { value: "ENFJ", label: "ENFJ — Protagonist" },
  { value: "ENFP", label: "ENFP — Campaigner" },
  { value: "ISTJ", label: "ISTJ — Logistician" },
  { value: "ISFJ", label: "ISFJ — Defender" },
  { value: "ESTJ", label: "ESTJ — Executive" },
  { value: "ESFJ", label: "ESFJ — Consul" },
  { value: "ISTP", label: "ISTP — Virtuoso" },
  { value: "ISFP", label: "ISFP — Adventurer" },
  { value: "ESTP", label: "ESTP — Entrepreneur" },
  { value: "ESFP", label: "ESFP — Entertainer" },
];

// Big-Five inspired + practical traits. Multi-select.
export const PERSONALITY_TRAITS: Option[] = [
  { value: "analytical", label: "Analytical" },
  { value: "creative", label: "Creative" },
  { value: "organized", label: "Organized" },
  { value: "spontaneous", label: "Spontaneous" },
  { value: "sociable", label: "Sociable" },
  { value: "reserved", label: "Reserved" },
  { value: "calm", label: "Calm" },
  { value: "energetic", label: "Energetic" },
  { value: "ambitious", label: "Ambitious" },
  { value: "easygoing", label: "Easy-going" },
  { value: "empathetic", label: "Empathetic" },
  { value: "pragmatic", label: "Pragmatic" },
  { value: "curious", label: "Curious" },
  { value: "cautious", label: "Cautious" },
  { value: "risk_taking", label: "Risk-taking" },
  { value: "detail_oriented", label: "Detail-oriented" },
];

export function isValidOption(value: string, options: Option[]): boolean {
  return options.some((o) => o.value === value);
}

export function labelOf(value: string | null, options: Option[]): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}
