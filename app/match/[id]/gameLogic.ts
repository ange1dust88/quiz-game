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
