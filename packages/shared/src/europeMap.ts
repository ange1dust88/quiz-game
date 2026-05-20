// Playable subset + adjacency for the European map. Source of truth
// for both the game server (which countries land in MatchState.countries
// and which neighbour each other) and the client (highlight rules in
// MapPanel). The full 45-country SVG is still rendered as background
// on the client; only countries listed here are interactive.
//
// Match count vs player count is balanced so each expand round
// distributes 3 territories cleanly (2P uses a separate 1-per-round
// rule):
//   2P → 12 (central Europe)
//   3P → 15 (+HR, RO, UA — eastward expansion)
//   4P → 20 (+BA, RS, BG, ME, MK — Balkans cluster)
//
// Topology is hand-curated for the 20 playable codes only. Non-playable
// codes (e.g. ES, GB) appear on the SVG but have no entry here; the
// game server simply never instantiates them as Country rows.

const CORE_12 = [
  "AT",
  "BE",
  "CH",
  "CZ",
  "DE",
  "FR",
  "HU",
  "IT",
  "NL",
  "PL",
  "SI",
  "SK",
] as const;

const EXTRA_3 = ["HR", "RO", "UA"] as const;
const EXTRA_5 = ["BA", "RS", "BG", "ME", "MK"] as const;

export const PLAYABLE_BY_COUNT: Record<number, readonly string[]> = {
  2: CORE_12,
  3: [...CORE_12, ...EXTRA_3],
  4: [...CORE_12, ...EXTRA_3, ...EXTRA_5],
};

// Default for any player count we don't explicitly support — pick the
// largest known set so the match never starts empty.
export const PLAYABLE_FALLBACK: readonly string[] = PLAYABLE_BY_COUNT[4];

// Adjacency for the 20 playable countries. Undirected — list each
// neighbour on both sides. Anything not listed here is treated as
// disconnected (no path → never a war target).
export const EUROPE_TOPOLOGY: Record<string, readonly string[]> = {
  // Central core (existing 12)
  AT: ["DE", "CZ", "SK", "HU", "SI", "IT", "CH"],
  BE: ["NL", "DE", "FR"],
  CH: ["DE", "FR", "IT", "AT"],
  CZ: ["DE", "PL", "SK", "AT"],
  DE: ["NL", "BE", "FR", "CH", "AT", "CZ", "PL"],
  FR: ["BE", "DE", "CH", "IT"],
  HU: ["SK", "AT", "SI", "HR", "RS", "RO", "UA"],
  IT: ["FR", "CH", "AT", "SI"],
  NL: ["DE", "BE"],
  PL: ["DE", "CZ", "SK", "UA"],
  SI: ["IT", "AT", "HU", "HR"],
  SK: ["CZ", "PL", "UA", "HU", "AT"],

  // Eastward extension (3P)
  HR: ["SI", "HU", "BA", "RS"],
  RO: ["HU", "UA", "BG", "RS"],
  UA: ["PL", "SK", "HU", "RO"],

  // Balkans cluster (4P)
  BA: ["HR", "RS", "ME"],
  RS: ["HU", "RO", "BG", "HR", "BA", "ME", "MK"],
  BG: ["RO", "RS", "MK"],
  ME: ["BA", "RS"],
  MK: ["RS", "BG"],
};

export const PLAYABLE_SVG_IDS: readonly string[] = Object.freeze(
  Array.from(new Set(Object.keys(EUROPE_TOPOLOGY))),
);

// Resolve the playable set for a given player count, falling back to
// the largest known set when the count is unsupported.
export function playableForCount(count: number): readonly string[] {
  return PLAYABLE_BY_COUNT[count] ?? PLAYABLE_FALLBACK;
}
