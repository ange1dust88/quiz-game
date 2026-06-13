// Behavioural analytics for the research dashboard.
//
// This module is the analytical core of the diploma research: it turns
// raw match telemetry into per-player behavioural feature vectors, then
// runs unsupervised clustering (k-means) and correlation analysis
// (Pearson) against the demographic + psychometric profile fields the
// /settings form collects (age, education, MBTI, IQ, traits).
//
// Everything here is a PURE function with no I/O, so the methodology is
// fully unit-testable — important for the research write-up. Randomness
// (k-means centroid init) is seeded with a deterministic PRNG so a given
// dataset always yields the same clusters (reproducibility).

// ---- Telemetry shapes (mirror MatchRoom.telemetry) ----------------------

export type NumericAnswer = {
  playerId: string;
  category: string;
  diff: number;
  correctAnswer: number;
  timeMs: number;
  firstInputAtMs: number | null;
  inputChangeCount: number;
};

export type WarAnswer = {
  playerId: string;
  category: string;
  isCorrect: boolean;
  role: "attacker" | "defender";
  submittedAtMs: number;
};

export type CapitalPick = {
  playerId: string;
  auto: boolean;
  capitalStyle: string;
};

export type TerritoryPick = {
  playerId: string;
  auto: boolean;
};

export type Attack = {
  attackerId: string;
  defenderId: string;
  outcome: string;
  capitalFell?: boolean;
};

export type Telemetry = {
  numericAnswers?: NumericAnswer[];
  warAnswers?: WarAnswer[];
  capitalPicks?: CapitalPick[];
  territoryPicks?: TerritoryPick[];
  attacks?: Attack[];
};

export type FinalState = {
  players?: Array<{ id: string; profileId: string; nickname: string }>;
};

export type SnapshotLike = {
  finalState: unknown;
  telemetry: unknown;
};

// ---- Per-player behavioural feature vector ------------------------------

export type PlayerFeatures = {
  profileId: string;
  matches: number;
  // 0..1 — share of correct multiple-choice war answers.
  warAccuracy: number;
  attackerAccuracy: number;
  defenderAccuracy: number;
  // 0..1 — 1 means numeric guesses were spot-on; derived from the mean
  // relative error |diff| / max(1, |correctAnswer|), clamped and
  // inverted so "higher is better" like the accuracy metrics.
  numericCloseness: number;
  // Mean ms from question shown to first keystroke. Lower = more
  // decisive. null-input answers (never typed) are excluded.
  avgThinkMs: number;
  // Mean number of input changes per numeric answer — a hesitation /
  // self-correction proxy.
  avgHesitation: number;
  // 0..1 — share of capital picks made in the "risky" style.
  riskAppetite: number;
  // Attacks initiated per match — an aggression proxy.
  aggression: number;
  // 0..1 — share of picks (capital + territory) that timed out into an
  // auto-pick. A disengagement / AFK proxy.
  autoPickRate: number;
  // Counters kept so panels can show sample sizes / filter thin data.
  warAnswerCount: number;
  numericCount: number;
};

type Acc = {
  matches: Set<string>;
  warCorrect: number;
  warTotal: number;
  attackerCorrect: number;
  attackerTotal: number;
  defenderCorrect: number;
  defenderTotal: number;
  relErrSum: number;
  numericCount: number;
  thinkSum: number;
  thinkCount: number;
  hesitationSum: number;
  hesitationCount: number;
  riskyCapitals: number;
  totalCapitals: number;
  attacksInitiated: number;
  autoPicks: number;
  totalPicks: number;
};

function emptyAcc(): Acc {
  return {
    matches: new Set(),
    warCorrect: 0,
    warTotal: 0,
    attackerCorrect: 0,
    attackerTotal: 0,
    defenderCorrect: 0,
    defenderTotal: 0,
    relErrSum: 0,
    numericCount: 0,
    thinkSum: 0,
    thinkCount: 0,
    hesitationSum: 0,
    hesitationCount: 0,
    riskyCapitals: 0,
    totalCapitals: 0,
    attacksInitiated: 0,
    autoPicks: 0,
    totalPicks: 0,
  };
}

const safeDiv = (a: number, b: number, fallback = 0): number =>
  b > 0 ? a / b : fallback;

// Aggregate every snapshot's telemetry into one feature vector per
// profileId. In-match playerIds are resolved to the durable profileId
// via finalState.players, so a player's behaviour is pooled across all
// their matches.
export function extractFeatures(
  snapshots: SnapshotLike[],
  minMatches = 1,
): PlayerFeatures[] {
  const acc = new Map<string, Acc>();
  const get = (profileId: string): Acc => {
    let a = acc.get(profileId);
    if (!a) {
      a = emptyAcc();
      acc.set(profileId, a);
    }
    return a;
  };

  snapshots.forEach((snap, snapIndex) => {
    const fs = (snap.finalState ?? {}) as FinalState;
    const tel = (snap.telemetry ?? {}) as Telemetry;
    // in-match id → profileId for this match. The snapshot's position
    // is a stable per-match key, so a player appearing in N snapshots
    // counts as N matches even if their in-match id repeats.
    const toProfile = new Map<string, string>();
    const matchKey = String(snapIndex);
    fs.players?.forEach((p) => {
      toProfile.set(p.id, p.profileId);
      get(p.profileId).matches.add(matchKey);
    });

    for (const wa of tel.warAnswers ?? []) {
      const pid = toProfile.get(wa.playerId);
      if (!pid) continue;
      const a = get(pid);
      a.warTotal += 1;
      if (wa.isCorrect) a.warCorrect += 1;
      if (wa.role === "attacker") {
        a.attackerTotal += 1;
        if (wa.isCorrect) a.attackerCorrect += 1;
      } else {
        a.defenderTotal += 1;
        if (wa.isCorrect) a.defenderCorrect += 1;
      }
    }

    for (const na of tel.numericAnswers ?? []) {
      const pid = toProfile.get(na.playerId);
      if (!pid) continue;
      const a = get(pid);
      const denom = Math.max(1, Math.abs(na.correctAnswer));
      const relErr = Math.min(1, Math.abs(na.diff) / denom);
      a.relErrSum += relErr;
      a.numericCount += 1;
      if (na.firstInputAtMs !== null) {
        a.thinkSum += na.firstInputAtMs;
        a.thinkCount += 1;
      }
      a.hesitationSum += na.inputChangeCount;
      a.hesitationCount += 1;
    }

    for (const cp of tel.capitalPicks ?? []) {
      const pid = toProfile.get(cp.playerId);
      if (!pid) continue;
      const a = get(pid);
      a.totalCapitals += 1;
      if (cp.capitalStyle === "risky") a.riskyCapitals += 1;
      a.totalPicks += 1;
      if (cp.auto) a.autoPicks += 1;
    }

    for (const tp of tel.territoryPicks ?? []) {
      const pid = toProfile.get(tp.playerId);
      if (!pid) continue;
      const a = get(pid);
      a.totalPicks += 1;
      if (tp.auto) a.autoPicks += 1;
    }

    for (const at of tel.attacks ?? []) {
      const pid = toProfile.get(at.attackerId);
      if (!pid) continue;
      get(pid).attacksInitiated += 1;
    }
  });

  const out: PlayerFeatures[] = [];
  for (const [profileId, a] of acc) {
    const matches = a.matches.size;
    if (matches < minMatches) continue;
    out.push({
      profileId,
      matches,
      warAccuracy: safeDiv(a.warCorrect, a.warTotal),
      attackerAccuracy: safeDiv(a.attackerCorrect, a.attackerTotal),
      defenderAccuracy: safeDiv(a.defenderCorrect, a.defenderTotal),
      numericCloseness: 1 - safeDiv(a.relErrSum, a.numericCount, 1),
      avgThinkMs: safeDiv(a.thinkSum, a.thinkCount),
      avgHesitation: safeDiv(a.hesitationSum, a.hesitationCount),
      riskAppetite: safeDiv(a.riskyCapitals, a.totalCapitals),
      aggression: safeDiv(a.attacksInitiated, matches),
      autoPickRate: safeDiv(a.autoPicks, a.totalPicks),
      warAnswerCount: a.warTotal,
      numericCount: a.numericCount,
    });
  }
  return out;
}

// ---- Basic statistics ---------------------------------------------------

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

// Pearson correlation coefficient over paired samples. Returns r in
// [-1, 1] plus the sample size n. r is 0 when either series has no
// variance (a flat predictor can't correlate). Pairs with a null in
// either slot are dropped.
export function pearson(
  pairs: Array<[number | null, number | null]>,
): { r: number; n: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of pairs) {
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y))
      continue;
    xs.push(x);
    ys.push(y);
  }
  const n = xs.length;
  if (n < 2) return { r: 0, n };
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return { r: 0, n };
  return { r: num / Math.sqrt(dx * dy), n };
}

// ---- MBTI helpers -------------------------------------------------------

export type MbtiAxis = "EI" | "SN" | "TF" | "JP";

// Split a 4-letter MBTI code into its four binary axes. Returns the
// first letter of each axis (E/I, S/N, T/F, J/P) or null if malformed.
export function mbtiAxes(
  code: string | null,
): Record<MbtiAxis, string> | null {
  if (!code || code.length !== 4) return null;
  const c = code.toUpperCase();
  const EI = c[0];
  const SN = c[1];
  const TF = c[2];
  const JP = c[3];
  if (
    !"EI".includes(EI) ||
    !"SN".includes(SN) ||
    !"TF".includes(TF) ||
    !"JP".includes(JP)
  )
    return null;
  return { EI, SN, TF, JP };
}

// ---- Seeded PRNG + k-means ----------------------------------------------

// mulberry32 — tiny deterministic PRNG. A fixed seed makes the k-means
// centroid initialisation (and therefore the resulting clusters)
// reproducible across runs, which the research write-up relies on.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Z-score each column across all rows so features measured on different
// scales (a 0..1 accuracy vs a 0..3000ms think-time) contribute equally
// to the Euclidean distance in k-means. Returns the normalised matrix
// plus the per-column mean/std so centroids can be de-normalised for
// display.
export function zNormalize(rows: number[][]): {
  normalized: number[][];
  means: number[];
  stds: number[];
} {
  if (rows.length === 0) return { normalized: [], means: [], stds: [] };
  const dims = rows[0].length;
  const means: number[] = [];
  const stds: number[] = [];
  for (let d = 0; d < dims; d++) {
    const col = rows.map((r) => r[d]);
    means.push(mean(col));
    const s = stddev(col);
    stds.push(s === 0 ? 1 : s);
  }
  const normalized = rows.map((r) =>
    r.map((v, d) => (v - means[d]) / stds[d]),
  );
  return { normalized, means, stds };
}

function dist2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
}

export type KMeansResult = {
  // Cluster index per input row, in input order.
  assignments: number[];
  // Centroid per cluster, in the SAME (normalised) space as the input.
  centroids: number[][];
  // How many rows landed in each cluster.
  sizes: number[];
};

// k-means with k-means++ seeding (seeded RNG) and Lloyd iterations.
// Operates on already-normalised rows. Empty clusters are re-seeded to
// the farthest point so k is preserved. Deterministic for a given seed.
export function kMeans(
  rows: number[][],
  k: number,
  seed = 42,
  maxIters = 100,
): KMeansResult {
  const n = rows.length;
  if (n === 0 || k <= 0) {
    return { assignments: [], centroids: [], sizes: [] };
  }
  const realK = Math.min(k, n);
  const rng = mulberry32(seed);

  // k-means++ init: first centroid random, rest weighted by squared
  // distance to the nearest chosen centroid.
  const centroids: number[][] = [];
  centroids.push([...rows[Math.floor(rng() * n)]]);
  while (centroids.length < realK) {
    const d2 = rows.map((r) =>
      Math.min(...centroids.map((c) => dist2(r, c))),
    );
    const total = d2.reduce((s, x) => s + x, 0);
    let target = rng() * total;
    let idx = 0;
    if (total === 0) {
      idx = Math.floor(rng() * n);
    } else {
      for (let i = 0; i < n; i++) {
        target -= d2[i];
        if (target <= 0) {
          idx = i;
          break;
        }
      }
    }
    centroids.push([...rows[idx]]);
  }

  const assignments = new Array<number>(n).fill(0);
  const dims = rows[0].length;

  for (let iter = 0; iter < maxIters; iter++) {
    let changed = false;
    // Assign.
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < realK; c++) {
        const d = dist2(rows[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }
    // Update.
    const sums = Array.from({ length: realK }, () =>
      new Array<number>(dims).fill(0),
    );
    const counts = new Array<number>(realK).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c] += 1;
      for (let d = 0; d < dims; d++) sums[c][d] += rows[i][d];
    }
    for (let c = 0; c < realK; c++) {
      if (counts[c] === 0) {
        // Re-seed an empty cluster to the row farthest from its centroid.
        let far = 0;
        let farD = -1;
        for (let i = 0; i < n; i++) {
          const d = dist2(rows[i], centroids[assignments[i]]);
          if (d > farD) {
            farD = d;
            far = i;
          }
        }
        centroids[c] = [...rows[far]];
      } else {
        for (let d = 0; d < dims; d++) centroids[c][d] = sums[c][d] / counts[c];
      }
    }
    if (!changed && iter > 0) break;
  }

  const sizes = new Array<number>(realK).fill(0);
  for (const a of assignments) sizes[a] += 1;
  return { assignments, centroids, sizes };
}

// Group a set of numeric samples by a categorical key and return the
// mean + count per group, sorted by mean descending. Used for the
// "behaviour by MBTI axis / education / trait" cross-tabs.
export function groupMeans<T>(
  items: T[],
  keyOf: (t: T) => string | null,
  valueOf: (t: T) => number | null,
): Array<{ key: string; mean: number; n: number }> {
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const it of items) {
    const k = keyOf(it);
    const v = valueOf(it);
    if (k === null || v === null || !Number.isFinite(v)) continue;
    const b = buckets.get(k) ?? { sum: 0, n: 0 };
    b.sum += v;
    b.n += 1;
    buckets.set(k, b);
  }
  return Array.from(buckets.entries())
    .map(([key, b]) => ({ key, mean: b.sum / b.n, n: b.n }))
    .sort((a, b) => b.mean - a.mean);
}
