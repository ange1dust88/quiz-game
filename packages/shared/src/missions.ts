// Daily-mission catalogue + helpers. Three random missions from this
// list are assigned to each player per UTC day (see API endpoint).
// Definitions are pure: progress is evaluated server-side after each
// match against the snapshot/telemetry payload.

export type MissionCategory = "play" | "skill" | "combat";

export type MissionTemplate = {
  code: string;
  label: string;
  description: string;
  category: MissionCategory;
  // FontAwesome solid-icon name resolved client-side via FA_ICON_MAP.
  icon: string;
  // Goal value the player needs to reach.
  target: number;
  // Q-coin payout on completion. Frozen onto the PlayerMission row at
  // creation so a catalogue rebalance doesn't pay out retroactively.
  reward: number;
};

export const MISSION_CATALOG: MissionTemplate[] = [
  {
    code: "play_3_matches",
    label: "Play 3 matches",
    description: "Show up — finish any 3 ranked matches today.",
    category: "play",
    icon: "gamepad",
    target: 3,
    reward: 60,
  },
  {
    code: "play_5_matches",
    label: "Play 5 matches",
    description: "Marathon day — wrap up 5 matches before midnight UTC.",
    category: "play",
    icon: "gamepad",
    target: 5,
    reward: 100,
  },
  {
    code: "win_1_match",
    label: "Win a match",
    description: "Take home a single victory.",
    category: "skill",
    icon: "trophy",
    target: 1,
    reward: 80,
  },
  {
    code: "win_2_matches",
    label: "Win 2 matches",
    description: "Back-to-back W's. Bonus for the streak hunters.",
    category: "skill",
    icon: "trophy",
    target: 2,
    reward: 140,
  },
  {
    code: "top_2_finish",
    label: "Finish top-2 once",
    description: "Even if you don't win, a podium finish counts.",
    category: "skill",
    icon: "medal",
    target: 1,
    reward: 70,
  },
  {
    code: "capture_capital",
    label: "Capture an enemy capital",
    description: "Land the finishing blow on someone's HQ.",
    category: "combat",
    icon: "landmark",
    target: 1,
    reward: 110,
  },
  {
    code: "war_correct_5",
    label: "5 correct war answers",
    description: "Hit five right MC answers during war attacks.",
    category: "combat",
    icon: "bullseye",
    target: 5,
    reward: 90,
  },
];

export const MISSION_BY_CODE: Record<string, MissionTemplate> =
  Object.fromEntries(MISSION_CATALOG.map((m) => [m.code, m]));

// UTC day key (YYYY-MM-DD). Stable timezone — every player's "today"
// resets at the same moment globally.
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Deterministic shuffle for `pickDailyMissions` — pure so tests can
// pin behaviour. Standard Fisher–Yates with caller-supplied rng.
function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pick N missions for a given day. Default rng is Math.random — tests
// inject a seeded rng for determinism.
export function pickDailyMissions(
  count: number = 3,
  rng: () => number = Math.random,
): MissionTemplate[] {
  const pool = [...MISSION_CATALOG];
  shuffleInPlace(pool, rng);
  return pool.slice(0, Math.min(count, pool.length));
}

// Per-match progress event the server feeds into the mission updater.
// Deliberately flat — anything the catalogue checks reads from here,
// nothing pulls from Colyseus state directly. Keeps the update loop
// pure and unit-testable.
export type MatchOutcome = {
  isWinner: boolean;
  place: number;
  totalPlayers: number;
  // Number of enemy capitals this player captured in the match
  // (from telemetry's capital_fell events / finalState diff).
  capitalsCaptured: number;
  // Count of correct war MC answers in the match.
  warCorrect: number;
};

// Given a player's mission row and the just-finished match outcome,
// return the increment to apply to `current`. Server caps via
// `Math.min(target, current + delta)` after.
export function progressIncrement(
  missionCode: string,
  outcome: MatchOutcome,
): number {
  switch (missionCode) {
    case "play_3_matches":
    case "play_5_matches":
      return 1;
    case "win_1_match":
    case "win_2_matches":
      return outcome.isWinner ? 1 : 0;
    case "top_2_finish":
      return outcome.place <= 2 ? 1 : 0;
    case "capture_capital":
      return outcome.capitalsCaptured;
    case "war_correct_5":
      return outcome.warCorrect;
    default:
      return 0;
  }
}
