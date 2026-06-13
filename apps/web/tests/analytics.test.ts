// Tests for the research analytics core. Each method is pure, so we can
// assert exact numbers on small fixtures — this doubles as the
// reproducibility evidence for the diploma methodology chapter.

import { describe, expect, it } from "vitest";
import {
  extractFeatures,
  groupMeans,
  kMeans,
  mbtiAxes,
  mean,
  pearson,
  stddev,
  zNormalize,
  type SnapshotLike,
} from "@/app/lib/analytics";

describe("mean / stddev", () => {
  it("computes mean", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBe(0);
  });
  it("computes population stddev", () => {
    expect(stddev([2, 2, 2])).toBe(0);
    expect(stddev([1, 3])).toBe(1); // mean 2, var = (1+1)/2 = 1
    expect(stddev([5])).toBe(0);
  });
});

describe("pearson", () => {
  it("returns +1 for a perfectly increasing relationship", () => {
    const { r, n } = pearson([
      [1, 2],
      [2, 4],
      [3, 6],
      [4, 8],
    ]);
    expect(r).toBeCloseTo(1, 10);
    expect(n).toBe(4);
  });
  it("returns -1 for a perfectly decreasing relationship", () => {
    const { r } = pearson([
      [1, 8],
      [2, 6],
      [3, 4],
      [4, 2],
    ]);
    expect(r).toBeCloseTo(-1, 10);
  });
  it("returns exactly 0 for a symmetric uncorrelated relationship", () => {
    // x rises 1..4, y is symmetric (1,2,2,1) so the cross-products
    // cancel: cov = 0 → r = 0.
    const { r } = pearson([
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 1],
    ]);
    expect(r).toBeCloseTo(0, 10);
  });
  it("returns 0 when one series is flat (no variance)", () => {
    const { r } = pearson([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(r).toBe(0);
  });
  it("drops pairs with a null and reports the surviving n", () => {
    const { r, n } = pearson([
      [1, 2],
      [null, 4],
      [3, 6],
      [4, null],
    ]);
    expect(n).toBe(2);
    expect(r).toBeCloseTo(1, 10);
  });
});

describe("mbtiAxes", () => {
  it("splits a valid code into four axes", () => {
    expect(mbtiAxes("INTJ")).toEqual({ EI: "I", SN: "N", TF: "T", JP: "J" });
    expect(mbtiAxes("esfp")).toEqual({ EI: "E", SN: "S", TF: "F", JP: "P" });
  });
  it("rejects malformed codes", () => {
    expect(mbtiAxes(null)).toBeNull();
    expect(mbtiAxes("")).toBeNull();
    expect(mbtiAxes("INT")).toBeNull();
    expect(mbtiAxes("XXXX")).toBeNull();
  });
});

describe("zNormalize", () => {
  it("centres each column to mean 0 and unit std", () => {
    const { normalized, means, stds } = zNormalize([
      [1, 100],
      [3, 300],
    ]);
    expect(means).toEqual([2, 200]);
    expect(stds).toEqual([1, 100]);
    expect(normalized).toEqual([
      [-1, -1],
      [1, 1],
    ]);
  });
  it("uses std=1 for a constant column (no divide-by-zero)", () => {
    const { normalized, stds } = zNormalize([
      [5],
      [5],
      [5],
    ]);
    expect(stds).toEqual([1]);
    expect(normalized).toEqual([[0], [0], [0]]);
  });
});

describe("kMeans", () => {
  it("separates two well-separated blobs deterministically", () => {
    const rows = [
      [0, 0],
      [0.1, 0.1],
      [-0.1, 0.05],
      [10, 10],
      [10.1, 9.9],
      [9.9, 10.2],
    ];
    const { assignments, sizes } = kMeans(rows, 2, 42);
    // The two blobs must each be internally consistent.
    expect(assignments[0]).toBe(assignments[1]);
    expect(assignments[1]).toBe(assignments[2]);
    expect(assignments[3]).toBe(assignments[4]);
    expect(assignments[4]).toBe(assignments[5]);
    // ...and distinct from each other.
    expect(assignments[0]).not.toBe(assignments[3]);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(6);
    expect([...sizes].sort()).toEqual([3, 3]);
  });
  it("is reproducible for a fixed seed", () => {
    const rows = [
      [1, 1],
      [2, 1],
      [8, 9],
      [9, 8],
      [4, 5],
    ];
    const a = kMeans(rows, 2, 7);
    const b = kMeans(rows, 2, 7);
    expect(a.assignments).toEqual(b.assignments);
    expect(a.centroids).toEqual(b.centroids);
  });
  it("clamps k to the row count and never returns empty clusters", () => {
    const rows = [
      [0],
      [1],
    ];
    const { sizes } = kMeans(rows, 5, 1);
    expect(sizes).toHaveLength(2);
    expect(sizes.every((s) => s > 0)).toBe(true);
  });
  it("handles an empty dataset", () => {
    const { assignments, centroids, sizes } = kMeans([], 3);
    expect(assignments).toEqual([]);
    expect(centroids).toEqual([]);
    expect(sizes).toEqual([]);
  });
});

describe("groupMeans", () => {
  it("buckets by key and averages, sorted desc by mean", () => {
    const items = [
      { g: "a", v: 10 },
      { g: "a", v: 20 },
      { g: "b", v: 5 },
      { g: "b", v: 5 },
    ];
    const out = groupMeans(
      items,
      (t) => t.g,
      (t) => t.v,
    );
    expect(out).toEqual([
      { key: "a", mean: 15, n: 2 },
      { key: "b", mean: 5, n: 2 },
    ]);
  });
  it("drops null keys and null/non-finite values", () => {
    const items = [
      { g: "a", v: 10 },
      { g: null, v: 99 },
      { g: "a", v: null },
    ];
    const out = groupMeans(
      items,
      (t) => t.g,
      (t) => t.v,
    );
    expect(out).toEqual([{ key: "a", mean: 10, n: 1 }]);
  });
});

describe("extractFeatures", () => {
  // One match, two players. p1 answers war well + numeric spot-on +
  // risky capital + initiates an attack; p2 is the opposite.
  const snapshot: SnapshotLike = {
    finalState: {
      players: [
        { id: "m1", profileId: "p1", nickname: "A" },
        { id: "m2", profileId: "p2", nickname: "B" },
      ],
    },
    telemetry: {
      warAnswers: [
        { playerId: "m1", category: "geo", isCorrect: true, role: "attacker", submittedAtMs: 1000 },
        { playerId: "m1", category: "geo", isCorrect: true, role: "defender", submittedAtMs: 1200 },
        { playerId: "m2", category: "geo", isCorrect: false, role: "defender", submittedAtMs: 4000 },
      ],
      numericAnswers: [
        { playerId: "m1", category: "geo", diff: 0, correctAnswer: 100, timeMs: 2000, firstInputAtMs: 500, inputChangeCount: 1 },
        { playerId: "m2", category: "geo", diff: 50, correctAnswer: 100, timeMs: 9000, firstInputAtMs: 4000, inputChangeCount: 6 },
      ],
      capitalPicks: [
        { playerId: "m1", auto: false, capitalStyle: "risky" },
        { playerId: "m2", auto: true, capitalStyle: "standard" },
      ],
      territoryPicks: [
        { playerId: "m1", auto: false },
        { playerId: "m2", auto: true },
      ],
      attacks: [
        // Real telemetry writes a "started" record (with decision
        // context) and a separate resolution record per attack.
        {
          attackerId: "m1",
          defenderId: "m2",
          outcome: "started",
          auto: false,
          decision: {
            targetArmies: 2,
            targetPoints: 1500,
            targetIsCapital: true,
            targetIsLeader: true,
            numTargets: 2,
            capitalAvailable: true,
            leaderAvailable: true,
            pickedWeakestArmies: false,
            pickedStrongestArmies: true,
            pickedHighestValue: true,
            setMinArmies: 1,
            setMaxArmies: 3,
            attackerRank: 2,
            playersWithLand: 2,
          },
        },
        {
          attackerId: "m1",
          defenderId: "m2",
          outcome: "attacker_won",
          auto: false,
          capitalFell: false,
        },
      ],
    },
  };

  it("derives the expected per-player feature vectors", () => {
    const feats = extractFeatures([snapshot]);
    const p1 = feats.find((f) => f.profileId === "p1")!;
    const p2 = feats.find((f) => f.profileId === "p2")!;

    expect(p1.warAccuracy).toBe(1); // 2/2
    expect(p1.attackerAccuracy).toBe(1);
    expect(p1.defenderAccuracy).toBe(1);
    expect(p1.numericCloseness).toBe(1); // diff 0 → 0 rel error → closeness 1
    expect(p1.avgThinkMs).toBe(500);
    expect(p1.avgHesitation).toBe(1);
    expect(p1.riskAppetite).toBe(1); // 1/1 risky
    expect(p1.aggression).toBe(1); // 1 started attack / 1 match
    expect(p1.autoPickRate).toBe(0); // 0/2 auto

    // Target-selection style — derived from the single deliberate attack
    // whose decision context targeted the leader's capital (the
    // strongest of two reachable options).
    expect(p1.deliberateAttacks).toBe(1);
    expect(p1.giantSlayerRate).toBe(1); // leader reachable + attacked
    expect(p1.bullyRate).toBe(0); // 2 options, did NOT pick weakest
    expect(p1.capitalAggression).toBe(1); // capital reachable + attacked
    expect(p1.avgTargetStrengthPct).toBeCloseTo(0.5, 10); // (2-1)/(3-1)

    expect(p2.warAccuracy).toBe(0); // 0/1
    expect(p2.numericCloseness).toBeCloseTo(0.5, 10); // |50|/100 = 0.5 rel err → 0.5 closeness
    expect(p2.avgThinkMs).toBe(4000);
    expect(p2.avgHesitation).toBe(6);
    expect(p2.riskAppetite).toBe(0);
    expect(p2.aggression).toBe(0); // initiated none
    expect(p2.autoPickRate).toBe(1); // 2/2 auto
    // Never attacked → no targeting decisions → all null.
    expect(p2.deliberateAttacks).toBe(0);
    expect(p2.giantSlayerRate).toBeNull();
    expect(p2.bullyRate).toBeNull();
    expect(p2.capitalAggression).toBeNull();
    expect(p2.avgTargetStrengthPct).toBeNull();
  });

  it("excludes auto-attacks from targeting style but counts aggression", () => {
    const autoSnap: SnapshotLike = {
      finalState: {
        players: [
          { id: "x1", profileId: "px", nickname: "X" },
          { id: "x2", profileId: "py", nickname: "Y" },
        ],
      },
      telemetry: {
        attacks: [
          {
            attackerId: "x1",
            defenderId: "x2",
            outcome: "started",
            auto: true, // timer ran out → random target, not a choice
            decision: {
              targetArmies: 1,
              targetPoints: 200,
              targetIsCapital: false,
              targetIsLeader: true,
              numTargets: 3,
              capitalAvailable: true,
              leaderAvailable: true,
              pickedWeakestArmies: true,
              pickedStrongestArmies: false,
              pickedHighestValue: false,
              setMinArmies: 1,
              setMaxArmies: 4,
              attackerRank: 1,
              playersWithLand: 2,
            },
          },
        ],
      },
    };
    const feats = extractFeatures([autoSnap]);
    const px = feats.find((f) => f.profileId === "px")!;
    expect(px.aggression).toBe(1); // auto attack still counts as initiated
    expect(px.deliberateAttacks).toBe(0); // ...but not as a deliberate choice
    expect(px.giantSlayerRate).toBeNull();
    expect(px.bullyRate).toBeNull();
    expect(px.avgTargetStrengthPct).toBeNull();
  });

  it("respects the minMatches filter", () => {
    expect(extractFeatures([snapshot], 2)).toHaveLength(0);
    expect(extractFeatures([snapshot], 1)).toHaveLength(2);
  });

  it("pools a player's behaviour across multiple matches", () => {
    const feats = extractFeatures([snapshot, snapshot]);
    const p1 = feats.find((f) => f.profileId === "p1")!;
    expect(p1.matches).toBe(2);
    expect(p1.aggression).toBe(1); // 2 attacks / 2 matches
    expect(p1.warAnswerCount).toBe(4); // 2 per match
  });
});
