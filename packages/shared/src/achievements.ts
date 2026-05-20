// Achievement catalogue + pure evaluator. The catalogue is shared by the
// game server (writes new unlock rows + grants coins after each match)
// and the web app (renders the grid on profile pages). Definitions are
// intentionally metric-only — no need to know the in-match move
// sequence — so the `check` function takes plain numbers.

export type AchievementInput = {
  gamesPlayed: number;
  gamesWon: number;
  elo: number;
  // Most recent results first (last 10 is plenty for streaks).
  recentWins: boolean[];
  // True once the user has filled out the demographic survey on /settings.
  demographicComplete: boolean;
};

export type AchievementRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export type AchievementDef = {
  code: string;
  name: string;
  description: string;
  // FontAwesome solid-icon name (e.g. "gamepad", "trophy"). The client
  // resolves it to the actual icon module via the FA_ICON_MAP in the
  // grid component.
  icon: string;
  category: "play" | "skill" | "rating" | "profile";
  // Drives the colour of the chip on the AchievementCard. Roughly
  // calibrated to how rare the unlock is in practice:
  //   common     — first-step / easy
  //   uncommon   — moderate (e.g. 5 wins, demographic profile)
  //   rare       — sustained (50 matches, streak 5)
  //   epic       — top-tier rating
  //   legendary  — grandmaster threshold
  rarity: AchievementRarity;
  check: (i: AchievementInput) => boolean;
};

// Q-coin payouts per rarity tier. Locked here so server-side unlock
// path and client-side display stay in sync.
export const ACHIEVEMENT_COIN_REWARD: Record<AchievementRarity, number> = {
  common: 50,
  uncommon: 100,
  rare: 250,
  epic: 500,
  legendary: 1000,
};

export function coinRewardFor(rarity: AchievementRarity): number {
  return ACHIEVEMENT_COIN_REWARD[rarity];
}

function longestWinStreak(recent: boolean[]): number {
  let n = 0;
  for (const w of recent) {
    if (w) n += 1;
    else break;
  }
  return n;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    code: "first_match",
    name: "First steps",
    description: "Play your first match.",
    icon: "gamepad",
    category: "play",
    rarity: "common",
    check: (i) => i.gamesPlayed >= 1,
  },
  {
    code: "first_win",
    name: "Tasting victory",
    description: "Win a match.",
    icon: "medal",
    category: "play",
    rarity: "common",
    check: (i) => i.gamesWon >= 1,
  },
  {
    code: "matches_10",
    name: "Regular",
    description: "Play 10 matches.",
    icon: "calendar-days",
    category: "play",
    rarity: "common",
    check: (i) => i.gamesPlayed >= 10,
  },
  {
    code: "matches_50",
    name: "Veteran",
    description: "Play 50 matches.",
    icon: "shield-halved",
    category: "play",
    rarity: "uncommon",
    check: (i) => i.gamesPlayed >= 50,
  },
  {
    code: "matches_100",
    name: "Centurion",
    description: "Play 100 matches.",
    icon: "landmark",
    category: "play",
    rarity: "rare",
    check: (i) => i.gamesPlayed >= 100,
  },
  {
    code: "wins_5",
    name: "Hat trick",
    description: "Win 5 matches.",
    icon: "bullseye",
    category: "skill",
    rarity: "uncommon",
    check: (i) => i.gamesWon >= 5,
  },
  {
    code: "wins_25",
    name: "Champion",
    description: "Win 25 matches.",
    icon: "crown",
    category: "skill",
    rarity: "rare",
    check: (i) => i.gamesWon >= 25,
  },
  {
    code: "streak_3",
    name: "On fire",
    description: "Win 3 matches in a row.",
    icon: "fire",
    category: "skill",
    rarity: "uncommon",
    check: (i) => longestWinStreak(i.recentWins) >= 3,
  },
  {
    code: "streak_5",
    name: "Unstoppable",
    description: "Win 5 matches in a row.",
    icon: "bolt",
    category: "skill",
    rarity: "epic",
    check: (i) => longestWinStreak(i.recentWins) >= 5,
  },
  {
    code: "elo_1100",
    name: "Rising star",
    description: "Reach 1100 ELO.",
    icon: "star",
    category: "rating",
    rarity: "rare",
    check: (i) => i.elo >= 1100,
  },
  {
    code: "elo_1300",
    name: "Master",
    description: "Reach 1300 ELO.",
    icon: "gem",
    category: "rating",
    rarity: "epic",
    check: (i) => i.elo >= 1300,
  },
  {
    code: "elo_1500",
    name: "Grandmaster",
    description: "Reach 1500 ELO.",
    icon: "trophy",
    category: "rating",
    rarity: "legendary",
    check: (i) => i.elo >= 1500,
  },
  {
    code: "profile_complete",
    name: "All set",
    description: "Fill out your demographic profile.",
    icon: "user-pen",
    category: "profile",
    rarity: "uncommon",
    check: (i) => i.demographicComplete,
  },
];

export const ACHIEVEMENT_BY_CODE: Record<string, AchievementDef> =
  Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]));

// Pure check — returns codes that should be unlocked given these inputs.
// The caller diffs against what's already in the DB to figure out which
// rows to insert.
export function evaluateAchievements(input: AchievementInput): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(input)).map((a) => a.code);
}
