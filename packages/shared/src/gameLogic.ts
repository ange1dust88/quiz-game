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
//
// Players in `leavers` are slapped with an anti-abuse penalty: 1.5x the
// natural loss with a floor of -25, so rage-quitting against a much
// stronger opponent never costs less ELO than fighting it out.
export const LEAVER_PENALTY_MULTIPLIER = 1.5;
export const LEAVER_MIN_PENALTY = -25;

// Fisher–Yates in-place shuffle on a copy of the input. Used by the
// game server to randomise war-question MC option order — without this
// the correct answer would always sit at the same index (whatever the
// seed put it at), which is trivially abusable.
export function shuffled<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Generate a random permutation of [0, n). Lets the war-MC picker
// scramble option order once and then apply the SAME ordering to
// every language's options array — so position N is the same logical
// option across languages and a single `correctIndex` validates
// regardless of which language the player saw the question in.
export function shuffledPermutation(n: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function applyPermutation<T>(
  arr: readonly T[],
  perm: readonly number[],
): T[] {
  return perm.map((p) => arr[p]);
}

export function computeEloChanges(
  players: { profileId: string; elo: number }[],
  winnerProfileId: string | null,
  k: number = ELO_K_FACTOR,
  leavers: Set<string> = new Set(),
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

  for (const [id, d] of delta) {
    let rounded = Math.round(d);
    if (leavers.has(id) && id !== winner.profileId && rounded < 0) {
      rounded = Math.round(rounded * LEAVER_PENALTY_MULTIPLIER);
      if (rounded > LEAVER_MIN_PENALTY) rounded = LEAVER_MIN_PENALTY;
    }
    delta.set(id, rounded);
  }
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

// Cleans the client-supplied map hover trail before persisting: filters out
// non-strings / blanks, dedupes consecutive duplicates, and caps length so
// MatchEvent payloads stay bounded. Used by claim/attack server actions.
export const MAX_HOVER_TRAIL = 50;
export function sanitizeHoverTrail(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (out[out.length - 1] === trimmed) continue;
    out.push(trimmed);
    if (out.length >= MAX_HOVER_TRAIL) break;
  }
  return out;
}

// State invariants that must hold for a healthy session. Run as a tripwire
// after every state mutation — violations indicate a race or logic bug.
export type SessionInvariantInput = {
  pickOrder: string[];
  picksRemaining: number;
  stage: string;
  status: string;
  currentAttackId: string | null;
  countries: { ownerId: string | null; isCapital: boolean }[];
  activeAttackIds: string[];
};

export function checkSessionInvariants(s: SessionInvariantInput): string[] {
  const violations: string[] = [];

  // Each player can hold at most one capital. Two capitals → race in
  // claimCapital / forceAutoCapital that bypassed the atomic guard.
  const capitalsByOwner = new Map<string, number>();
  for (const c of s.countries) {
    if (c.isCapital && c.ownerId) {
      capitalsByOwner.set(
        c.ownerId,
        (capitalsByOwner.get(c.ownerId) ?? 0) + 1,
      );
    }
  }
  for (const [pid, n] of capitalsByOwner) {
    if (n > 1) violations.push(`player_${pid}_has_${n}_capitals`);
  }

  // At most one war attack is active per session and it must be the one
  // referenced by `currentAttackId`. Multiples mean a race in attackTerritory
  // / forceAutoAttack created an orphan.
  if (s.activeAttackIds.length > 1) {
    violations.push(`active_attacks_${s.activeAttackIds.length}`);
  }
  if (
    s.currentAttackId &&
    !s.activeAttackIds.includes(s.currentAttackId)
  ) {
    violations.push("current_attack_id_orphan");
  }
  if (!s.currentAttackId && s.activeAttackIds.length > 0) {
    violations.push("active_attack_without_session_ref");
  }

  // `picksRemaining` is just a denormalised length of `pickOrder` — they
  // must match. Drift here means a code path updated one without the other.
  if (s.pickOrder.length !== s.picksRemaining) {
    violations.push(
      `pick_order_${s.pickOrder.length}_vs_remaining_${s.picksRemaining}`,
    );
  }

  // The "ended" stage is terminal and only reachable via the end-game claim
  // which sets status=completed in the same UPDATE. Mismatch means someone
  // wrote one without the other.
  if (s.stage === "ended" && s.status !== "completed") {
    violations.push(`stage_ended_but_status_${s.status}`);
  }

  return violations;
}
