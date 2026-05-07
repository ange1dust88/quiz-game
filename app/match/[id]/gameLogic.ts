// Pure game-logic helpers. No Prisma, no IO — easy to unit test.

// Rank numeric-question answers: closest to `correct` wins, ties broken by
// who answered first (lower `answeredAtMs`).
export function rankAnswers<
  T extends { answer: number; answeredAtMs: number },
>(answers: T[], correct: number): T[] {
  return [...answers].sort((a, b) => {
    const diffA = Math.abs(a.answer - correct);
    const diffB = Math.abs(b.answer - correct);
    if (diffA !== diffB) return diffA - diffB;
    return a.answeredAtMs - b.answeredAtMs;
  });
}

export function territoriesForPlace(
  place: number,
  totalPlayers: number,
): number {
  if (totalPlayers === 2) return place === 1 ? 1 : 0;
  return place === 1 ? 2 : place === 2 ? 1 : 0;
}

// Builds the queue of upcoming pickers based on quiz answer ranking.
// 2 players: the closest answer picks 1 territory.
// 3+ players: 1st place picks 2, 2nd place picks 1.
export function computePickOrder(
  sortedPlayerIds: string[],
  totalPlayers: number,
): string[] {
  const out: string[] = [];
  if (totalPlayers === 2) {
    if (sortedPlayerIds[0]) out.push(sortedPlayerIds[0]);
  } else if (totalPlayers >= 3) {
    if (sortedPlayerIds[0]) {
      out.push(sortedPlayerIds[0]);
      out.push(sortedPlayerIds[0]);
    }
    if (sortedPlayerIds[1]) out.push(sortedPlayerIds[1]);
  }
  return out;
}

// Which round are we in (1-indexed) given the total turns taken in war.
// Capped at maxRounds for display purposes.
export function computeWarRound(
  warTurns: number,
  totalPlayers: number,
  maxRounds: number,
): number {
  if (totalPlayers <= 0) return 1;
  return Math.min(maxRounds, Math.floor(warTurns / totalPlayers) + 1);
}

export type WarEndReason = "sole_survivor" | "rounds_exhausted" | null;

export function warEndReason(
  warTurns: number,
  totalPlayers: number,
  maxRounds: number,
  playersWithLandCount: number,
): WarEndReason {
  if (playersWithLandCount === 1) return "sole_survivor";
  if (warTurns >= maxRounds * totalPlayers) return "rounds_exhausted";
  return null;
}

// Player with the most territories (ties broken by insertion order).
export function winnerByLands<T extends { id: string }>(
  players: T[],
  counts: Map<string, number>,
): T | null {
  if (players.length === 0) return null;
  return [...players].sort(
    (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0),
  )[0];
}

// Resolves the tie-breaker numeric round between attacker and defender.
// Closer to `correct` wins; if both diffs are equal, faster (lower time) wins;
// if still equal, defender holds (defender bias matches the MC tie rule).
export type TieResult = "attacker_won" | "defender_held" | "no_change";

export function computeTieResult(
  correct: number,
  attackerAnswer: number | null,
  defenderAnswer: number | null,
  attackerTimeMs: number | null,
  defenderTimeMs: number | null,
): TieResult {
  const aDiff =
    attackerAnswer === null
      ? Number.POSITIVE_INFINITY
      : Math.abs(attackerAnswer - correct);
  const dDiff =
    defenderAnswer === null
      ? Number.POSITIVE_INFINITY
      : Math.abs(defenderAnswer - correct);

  if (
    aDiff === Number.POSITIVE_INFINITY &&
    dDiff === Number.POSITIVE_INFINITY
  ) {
    return "no_change";
  }
  if (aDiff < dDiff) return "attacker_won";
  if (dDiff < aDiff) return "defender_held";

  // Equal diffs — tiebreak by time, defender wins true ties.
  const aT = attackerTimeMs ?? Number.POSITIVE_INFINITY;
  const dT = defenderTimeMs ?? Number.POSITIVE_INFINITY;
  return aT < dT ? "attacker_won" : "defender_held";
}

// Outcome of a successful attack on a territory.
export type AttackOutcome =
  | { type: "siege_continues"; remainingHp: number }
  | { type: "capital_falls" }
  | { type: "territory_taken" };

export function attackerWonOutcome(country: {
  isCapital: boolean;
  armies: number;
}): AttackOutcome {
  if (country.isCapital && country.armies > 1) {
    return { type: "siege_continues", remainingHp: country.armies - 1 };
  }
  if (country.isCapital) return { type: "capital_falls" };
  return { type: "territory_taken" };
}

// Player stats helpers — pure, used by the post-game stats update.

export const ELO_K_FACTOR = 32;

// Pairwise ELO update for a multiplayer match with one winner.
// Each loser pays the winner; losers don't exchange rating with each other.
// Returns a map of profileId → rating delta, rounded to nearest integer.
export function computeEloChanges(
  players: { profileId: string; elo: number }[],
  winnerProfileId: string | null,
  k: number = ELO_K_FACTOR,
): Map<string, number> {
  const delta = new Map<string, number>();
  for (const p of players) delta.set(p.profileId, 0);
  if (!winnerProfileId || players.length < 2) return delta;

  const winner = players.find((p) => p.profileId === winnerProfileId);
  if (!winner) return delta;

  for (const p of players) {
    if (p.profileId === winner.profileId) continue;
    const expectedWinner =
      1 / (1 + Math.pow(10, (p.elo - winner.elo) / 400));
    const expectedLoser =
      1 / (1 + Math.pow(10, (winner.elo - p.elo) / 400));
    delta.set(
      winner.profileId,
      (delta.get(winner.profileId) ?? 0) + k * (1 - expectedWinner),
    );
    delta.set(
      p.profileId,
      (delta.get(p.profileId) ?? 0) + k * (0 - expectedLoser),
    );
  }

  for (const [id, d] of delta) delta.set(id, Math.round(d));
  return delta;
}

// XP awarded for a single match. Base for participation, win bonus, and
// performance scaling on points held at end of game.
export function computeXpEarned(
  isWinner: boolean,
  pointsHeld: number,
): number {
  const BASE = 100;
  const WIN_BONUS = 300;
  return BASE + (isWinner ? WIN_BONUS : 0) + Math.floor(pointsHeld / 10);
}

// Apply earned XP, leveling up as long as the threshold is met.
// Threshold for level N → N+1 is N * 1000 XP (matches dashboard progress bar).
export function applyExperience(
  currentLevel: number,
  currentExp: number,
  xpEarned: number,
): { level: number; experience: number } {
  let level = currentLevel;
  let experience = currentExp + xpEarned;
  while (experience >= level * 1000) {
    experience -= level * 1000;
    level += 1;
  }
  return { level, experience };
}
