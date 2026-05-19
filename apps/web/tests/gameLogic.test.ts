import { describe, expect, it } from "vitest";
import {
  applyExperience,
  attackerWonOutcome,
  checkSessionInvariants,
  computeEloChanges,
  computePickOrder,
  computeTieResult,
  computeWarRound,
  computeXpEarned,
  MAX_HOVER_TRAIL,
  rankAnswers,
  sanitizeHoverTrail,
  shuffled,
  territoriesForPlace,
  warEndReason,
  winnerByLands,
} from "@quiz/shared/gameLogic";

describe("rankAnswers", () => {
  it("ranks by closeness to the correct answer", () => {
    const out = rankAnswers(
      [
        { playerId: "a", answer: 100, answeredAtMs: 0 },
        { playerId: "b", answer: 42, answeredAtMs: 0 },
        { playerId: "c", answer: 60, answeredAtMs: 0 },
      ],
      50,
    );
    expect(out.map((r) => r.playerId)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties by who answered first (lower answeredAtMs wins)", () => {
    const out = rankAnswers(
      [
        { playerId: "slow", answer: 60, answeredAtMs: 5000 },
        { playerId: "fast", answer: 40, answeredAtMs: 1200 },
      ],
      50,
    );
    // Both off by 10 — fastest wins.
    expect(out.map((r) => r.playerId)).toEqual(["fast", "slow"]);
  });

  it("only uses time as a tiebreaker, never to override closeness", () => {
    const out = rankAnswers(
      [
        { playerId: "fastWrong", answer: 0, answeredAtMs: 100 },
        { playerId: "slowRight", answer: 50, answeredAtMs: 9000 },
      ],
      50,
    );
    expect(out[0].playerId).toBe("slowRight");
  });

  it("does not mutate the input array", () => {
    const input = [
      { playerId: "a", answer: 100, answeredAtMs: 0 },
      { playerId: "b", answer: 42, answeredAtMs: 0 },
    ];
    rankAnswers(input, 50);
    expect(input.map((r) => r.playerId)).toEqual(["a", "b"]);
  });

  it("handles an empty list", () => {
    expect(rankAnswers([], 50)).toEqual([]);
  });
});

describe("territoriesForPlace", () => {
  it("2-player game: only first place picks 1 territory", () => {
    expect(territoriesForPlace(1, 2)).toBe(1);
    expect(territoriesForPlace(2, 2)).toBe(0);
  });

  it("3+ player game: 1st picks 2, 2nd picks 1, others 0", () => {
    expect(territoriesForPlace(1, 3)).toBe(2);
    expect(territoriesForPlace(2, 3)).toBe(1);
    expect(territoriesForPlace(3, 3)).toBe(0);
    expect(territoriesForPlace(4, 4)).toBe(0);
  });
});

describe("computePickOrder", () => {
  it("2 players → 1 pick for the closest answer", () => {
    expect(computePickOrder(["a", "b"], 2)).toEqual(["a"]);
  });

  it("3 players → 1st gets two consecutive picks, 2nd gets one", () => {
    expect(computePickOrder(["a", "b", "c"], 3)).toEqual(["a", "a", "b"]);
  });

  it("4 players → same as 3 players (1st x2, 2nd x1)", () => {
    expect(computePickOrder(["a", "b", "c", "d"], 4)).toEqual([
      "a",
      "a",
      "b",
    ]);
  });

  it("missing 2nd-place answer in 3+ game → only winner picks", () => {
    expect(computePickOrder(["a"], 3)).toEqual(["a", "a"]);
  });

  it("no answers → empty queue", () => {
    expect(computePickOrder([], 3)).toEqual([]);
    expect(computePickOrder([], 2)).toEqual([]);
  });
});

describe("computeWarRound", () => {
  it("returns 1 for a fresh war (no turns yet)", () => {
    expect(computeWarRound(0, 4, 5)).toBe(1);
  });

  it("rounds advance every totalPlayers turns", () => {
    expect(computeWarRound(3, 4, 5)).toBe(1);
    expect(computeWarRound(4, 4, 5)).toBe(2);
    expect(computeWarRound(7, 4, 5)).toBe(2);
    expect(computeWarRound(8, 4, 5)).toBe(3);
  });

  it("caps the displayed round at maxRounds", () => {
    expect(computeWarRound(20, 4, 5)).toBe(5); // round 6 clamped to 5
    expect(computeWarRound(100, 4, 5)).toBe(5);
  });

  it("dev mode (2 rounds) clamps quickly", () => {
    expect(computeWarRound(0, 2, 2)).toBe(1);
    expect(computeWarRound(2, 2, 2)).toBe(2);
    expect(computeWarRound(4, 2, 2)).toBe(2);
  });

  it("zero players degrades gracefully", () => {
    expect(computeWarRound(5, 0, 5)).toBe(1);
  });
});

describe("warEndReason", () => {
  it("returns null while at least 2 players hold land and rounds remain", () => {
    expect(warEndReason(3, 4, 5, 3)).toBe(null);
  });

  it("flags sole_survivor when only one player has territories", () => {
    expect(warEndReason(7, 4, 5, 1)).toBe("sole_survivor");
  });

  it("flags rounds_exhausted when warTurns hits the round-limit", () => {
    expect(warEndReason(20, 4, 5, 2)).toBe("rounds_exhausted");
    expect(warEndReason(21, 4, 5, 2)).toBe("rounds_exhausted");
  });

  it("sole_survivor wins over rounds_exhausted (precedence)", () => {
    expect(warEndReason(20, 4, 5, 1)).toBe("sole_survivor");
  });
});

describe("winnerByLands", () => {
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns the player with the most lands", () => {
    const counts = new Map([
      ["a", 5],
      ["b", 12],
      ["c", 7],
    ]);
    expect(winnerByLands(players, counts)).toEqual({ id: "b" });
  });

  it("breaks ties by player insertion order", () => {
    const counts = new Map([
      ["a", 8],
      ["b", 8],
      ["c", 8],
    ]);
    expect(winnerByLands(players, counts)).toEqual({ id: "a" });
  });

  it("treats missing entries as zero", () => {
    const counts = new Map<string, number>();
    expect(winnerByLands(players, counts)).toEqual({ id: "a" });
  });

  it("returns null for an empty roster", () => {
    expect(winnerByLands([], new Map())).toBe(null);
  });
});

describe("computeTieResult", () => {
  it("attacker closer to correct → attacker wins", () => {
    expect(computeTieResult(50, 48, 60, 4000, 1000)).toBe("attacker_won");
  });

  it("defender closer to correct → defender holds", () => {
    expect(computeTieResult(50, 30, 52, 1000, 4000)).toBe("defender_held");
  });

  it("equal diff → faster wins (attacker faster)", () => {
    expect(computeTieResult(50, 60, 40, 2000, 7000)).toBe("attacker_won");
  });

  it("equal diff → faster wins (defender faster)", () => {
    expect(computeTieResult(50, 40, 60, 7000, 2000)).toBe("defender_held");
  });

  it("equal diff and equal time → defender holds (defender bias)", () => {
    expect(computeTieResult(50, 60, 40, 3000, 3000)).toBe("defender_held");
  });

  it("nobody answered → no_change", () => {
    expect(computeTieResult(50, null, null, null, null)).toBe("no_change");
  });

  it("only attacker answered → attacker wins", () => {
    expect(computeTieResult(50, 100, null, 5000, null)).toBe("attacker_won");
  });

  it("only defender answered → defender holds", () => {
    expect(computeTieResult(50, null, 100, null, 5000)).toBe("defender_held");
  });

  it("missing time on equal diff → other side's time wins", () => {
    // Attacker has time, defender's missing → defender treated as slower → attacker wins
    expect(computeTieResult(50, 60, 40, 2000, null)).toBe("attacker_won");
  });
});

describe("attackerWonOutcome", () => {
  it("damages a capital with HP > 1 and continues siege", () => {
    expect(attackerWonOutcome({ isCapital: true, armies: 3 })).toEqual({
      type: "siege_continues",
      remainingHp: 2,
    });
    expect(attackerWonOutcome({ isCapital: true, armies: 2 })).toEqual({
      type: "siege_continues",
      remainingHp: 1,
    });
  });

  it("falls a capital at HP 1 (cascade trigger)", () => {
    expect(attackerWonOutcome({ isCapital: true, armies: 1 })).toEqual({
      type: "capital_falls",
    });
  });

  it("transfers a regular territory immediately", () => {
    expect(attackerWonOutcome({ isCapital: false, armies: 1 })).toEqual({
      type: "territory_taken",
    });
  });
});

describe("computeXpEarned", () => {
  it("awards base XP for participation", () => {
    expect(computeXpEarned(false, 0)).toBe(100);
  });

  it("adds the win bonus on top of base", () => {
    expect(computeXpEarned(true, 0)).toBe(400);
  });

  it("scales by 1 XP per 10 points held at end of game", () => {
    expect(computeXpEarned(false, 3000)).toBe(100 + 300);
    expect(computeXpEarned(true, 3000)).toBe(400 + 300);
  });

  it("floors fractional point contributions", () => {
    expect(computeXpEarned(false, 9)).toBe(100);
    expect(computeXpEarned(false, 19)).toBe(101);
  });
});

describe("applyExperience", () => {
  it("accumulates without level-up below the threshold", () => {
    expect(applyExperience(1, 200, 300)).toEqual({
      level: 1,
      experience: 500,
    });
  });

  it("levels up when XP reaches the level * 1000 threshold", () => {
    expect(applyExperience(1, 800, 300)).toEqual({
      level: 2,
      experience: 100,
    });
  });

  it("levels up multiple times for big XP gains", () => {
    // 1 → 2 needs 1000, 2 → 3 needs 2000. Starting at 0 with 3500 XP gained:
    // 3500 - 1000 = 2500 (level 2), 2500 - 2000 = 500 (level 3).
    expect(applyExperience(1, 0, 3500)).toEqual({
      level: 3,
      experience: 500,
    });
  });

  it("respects the current level when computing the threshold", () => {
    // At level 3, the next threshold is 3 * 1000 = 3000.
    expect(applyExperience(3, 2500, 600)).toEqual({
      level: 4,
      experience: 100,
    });
  });
});

describe("computeEloChanges", () => {
  it("symmetric 1v1 with equal ratings: ±K/2", () => {
    const delta = computeEloChanges(
      [
        { profileId: "a", elo: 1000 },
        { profileId: "b", elo: 1000 },
      ],
      "a",
    );
    expect(delta.get("a")).toBe(16);
    expect(delta.get("b")).toBe(-16);
  });

  it("higher-rated winner gains less than they would against a peer", () => {
    const delta = computeEloChanges(
      [
        { profileId: "fav", elo: 1500 },
        { profileId: "underdog", elo: 1000 },
      ],
      "fav",
    );
    expect(delta.get("fav")!).toBeLessThan(16);
    expect(delta.get("fav")!).toBeGreaterThan(0);
    // Pre-rounding the deltas are exactly opposite; rounding keeps them so
    // for this rating gap.
    expect(delta.get("underdog")).toBe(-delta.get("fav")!);
  });

  it("no winner means no rating change", () => {
    const delta = computeEloChanges(
      [
        { profileId: "a", elo: 1000 },
        { profileId: "b", elo: 1000 },
      ],
      null,
    );
    expect(delta.get("a")).toBe(0);
    expect(delta.get("b")).toBe(0);
  });

  it("multiplayer: winner accumulates against every loser", () => {
    const delta = computeEloChanges(
      [
        { profileId: "a", elo: 1000 },
        { profileId: "b", elo: 1000 },
        { profileId: "c", elo: 1000 },
      ],
      "a",
    );
    expect(delta.get("a")).toBe(32);
    expect(delta.get("b")).toBe(-16);
    expect(delta.get("c")).toBe(-16);
  });

  it("returns zero deltas when winner is not in the players list", () => {
    const delta = computeEloChanges(
      [
        { profileId: "a", elo: 1000 },
        { profileId: "b", elo: 1000 },
      ],
      "ghost",
    );
    expect(delta.get("a")).toBe(0);
    expect(delta.get("b")).toBe(0);
  });

  it("returns zero deltas for a single-player session", () => {
    const delta = computeEloChanges([{ profileId: "a", elo: 1000 }], "a");
    expect(delta.get("a")).toBe(0);
  });

  it("leaver against a peer pays the -25 minimum, not the -16 natural", () => {
    const delta = computeEloChanges(
      [
        { profileId: "winner", elo: 1000 },
        { profileId: "leaver", elo: 1000 },
      ],
      "winner",
      undefined,
      new Set(["leaver"]),
    );
    // Natural loss would be -16; floor of -25 kicks in.
    expect(delta.get("leaver")).toBe(-25);
    // Winner gets the natural amount (not amplified) — they're not the
    // one being punished.
    expect(delta.get("winner")).toBe(16);
  });

  it("leaver against a much stronger opponent pays 1.5x the natural loss", () => {
    // Natural loss for a 1500-rated player to a 1000-rated player is small
    // (~-3) — multiplying by 1.5 stays well above the -25 floor only if the
    // gap is huge; otherwise the floor applies. Pick a gap where 1.5x bites.
    const delta = computeEloChanges(
      [
        { profileId: "weak", elo: 800 },
        { profileId: "strong_leaver", elo: 2000 },
      ],
      "weak",
      undefined,
      new Set(["strong_leaver"]),
    );
    // Strong player losing to a much weaker one normally loses ~-30; with
    // 1.5x leaver penalty that's ~-45. The minimum floor doesn't apply
    // here because the natural loss is already steeper than -25.
    expect(delta.get("strong_leaver")!).toBeLessThanOrEqual(-40);
  });

  it("ignores leaver-set entries that didn't lose", () => {
    // If somehow the winner is also marked as a leaver, they still gain.
    const delta = computeEloChanges(
      [
        { profileId: "a", elo: 1000 },
        { profileId: "b", elo: 1000 },
      ],
      "a",
      undefined,
      new Set(["a"]),
    );
    expect(delta.get("a")).toBe(16);
    expect(delta.get("b")).toBe(-16);
  });
});

describe("sanitizeHoverTrail", () => {
  it("returns empty array for non-array input", () => {
    expect(sanitizeHoverTrail(null)).toEqual([]);
    expect(sanitizeHoverTrail(undefined)).toEqual([]);
    expect(sanitizeHoverTrail("FR")).toEqual([]);
    expect(sanitizeHoverTrail(42)).toEqual([]);
    expect(sanitizeHoverTrail({})).toEqual([]);
  });

  it("filters out non-string entries", () => {
    expect(sanitizeHoverTrail(["FR", 42, null, "DE", undefined])).toEqual([
      "FR",
      "DE",
    ]);
  });

  it("trims whitespace and drops empty/blank strings", () => {
    expect(sanitizeHoverTrail([" FR ", "", "  ", "DE\n"])).toEqual([
      "FR",
      "DE",
    ]);
  });

  it("dedupes only consecutive duplicates (back-and-forth hovers preserved)", () => {
    expect(
      sanitizeHoverTrail(["FR", "FR", "FR", "DE", "FR", "DE", "DE"]),
    ).toEqual(["FR", "DE", "FR", "DE"]);
  });

  it("caps the trail at MAX_HOVER_TRAIL entries", () => {
    // Build a trail of unique ids longer than the cap.
    const long = Array.from({ length: MAX_HOVER_TRAIL + 25 }, (_, i) => `C${i}`);
    expect(sanitizeHoverTrail(long).length).toBe(MAX_HOVER_TRAIL);
    expect(sanitizeHoverTrail(long)[0]).toBe("C0");
    expect(sanitizeHoverTrail(long)[MAX_HOVER_TRAIL - 1]).toBe(
      `C${MAX_HOVER_TRAIL - 1}`,
    );
  });

  it("preserves order", () => {
    expect(sanitizeHoverTrail(["C", "A", "B", "C"])).toEqual([
      "C",
      "A",
      "B",
      "C",
    ]);
  });
});

describe("checkSessionInvariants", () => {
  const baseline = {
    pickOrder: [],
    picksRemaining: 0,
    stage: "capitals",
    status: "active",
    currentAttackId: null,
    countries: [] as { ownerId: string | null; isCapital: boolean }[],
    activeAttackIds: [] as string[],
  };

  it("clean state has no violations", () => {
    expect(checkSessionInvariants(baseline)).toEqual([]);
  });

  it("flags two capitals owned by the same player", () => {
    const v = checkSessionInvariants({
      ...baseline,
      countries: [
        { ownerId: "p1", isCapital: true },
        { ownerId: "p1", isCapital: true },
        { ownerId: "p2", isCapital: true },
      ],
    });
    expect(v.some((m) => m.includes("p1") && m.includes("2_capitals"))).toBe(
      true,
    );
  });

  it("does not flag two players with one capital each", () => {
    const v = checkSessionInvariants({
      ...baseline,
      countries: [
        { ownerId: "p1", isCapital: true },
        { ownerId: "p2", isCapital: true },
      ],
    });
    expect(v).toEqual([]);
  });

  it("flags multiple active war attacks", () => {
    const v = checkSessionInvariants({
      ...baseline,
      currentAttackId: "a1",
      activeAttackIds: ["a1", "a2"],
    });
    expect(v).toContain("active_attacks_2");
  });

  it("flags currentAttackId pointing at a non-active attack (orphan)", () => {
    const v = checkSessionInvariants({
      ...baseline,
      currentAttackId: "ghost",
      activeAttackIds: ["a1"],
    });
    expect(v).toContain("current_attack_id_orphan");
  });

  it("flags an active attack with no session reference", () => {
    const v = checkSessionInvariants({
      ...baseline,
      currentAttackId: null,
      activeAttackIds: ["a1"],
    });
    expect(v).toContain("active_attack_without_session_ref");
  });

  it("flags pickOrder length mismatch with picksRemaining", () => {
    const v = checkSessionInvariants({
      ...baseline,
      pickOrder: ["p1", "p2"],
      picksRemaining: 3,
    });
    expect(v.some((m) => m.startsWith("pick_order_2_vs_remaining_3"))).toBe(
      true,
    );
  });

  it("flags stage=ended without status=completed", () => {
    const v = checkSessionInvariants({
      ...baseline,
      stage: "ended",
      status: "active",
    });
    expect(v.some((m) => m.startsWith("stage_ended_but_status_"))).toBe(true);
  });

  it("does not flag stage=ended when status=completed", () => {
    expect(
      checkSessionInvariants({
        ...baseline,
        stage: "ended",
        status: "completed",
      }),
    ).toEqual([]);
  });

  it("aggregates multiple violations into one list", () => {
    const v = checkSessionInvariants({
      ...baseline,
      pickOrder: ["a"],
      picksRemaining: 3,
      activeAttackIds: ["a1", "a2"],
    });
    expect(v.length).toBeGreaterThanOrEqual(2);
  });
});

describe("shuffled", () => {
  it("preserves length and elements", () => {
    const input = ["a", "b", "c", "d"];
    const out = shuffled(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort()).toEqual([...input].sort());
  });

  it("doesn't mutate the input", () => {
    const input = ["a", "b", "c", "d"];
    const snapshot = [...input];
    shuffled(input);
    expect(input).toEqual(snapshot);
  });

  it("actually randomises — across many runs every position holds the answer roughly evenly", () => {
    // Statistical sanity check: shuffle [answer, x, x, x] 4000 times and
    // make sure "answer" lands at index 0 close to 1/4 of the time.
    // 2σ tolerance leaves plenty of room for honest randomness without
    // turning into a flaky test.
    const ITERATIONS = 4000;
    const ANSWER = "answer";
    const input = [ANSWER, "a", "b", "c"];
    const positionCounts = [0, 0, 0, 0];
    for (let i = 0; i < ITERATIONS; i++) {
      const out = shuffled(input);
      positionCounts[out.indexOf(ANSWER)] += 1;
    }
    const expected = ITERATIONS / 4;
    // σ ≈ √(n · p · (1-p)) = √(4000 · 0.25 · 0.75) ≈ 27.4 → tolerate 4σ.
    const tol = 110;
    for (const c of positionCounts) {
      expect(Math.abs(c - expected)).toBeLessThan(tol);
    }
  });
});
