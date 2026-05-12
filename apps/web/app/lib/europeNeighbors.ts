// Static adjacency map (svgId → svgIds that share a land border). Dumped
// from CountryTemplate.neighbors so the client can highlight only legal
// targets during expand/war without keeping neighbours in MatchState.
// The server still enforces adjacency — this is purely a UI hint.

export const EUROPE_NEIGHBORS: Record<string, readonly string[]> = {
  AT: ["CH", "CZ", "DE", "HU", "IT", "SI", "SK"],
  BE: ["DE", "FR", "NL"],
  CH: ["AT", "DE", "FR", "IT"],
  CZ: ["AT", "DE", "PL", "SK"],
  DE: ["AT", "BE", "CH", "CZ", "NL", "PL"],
  FR: ["BE", "CH", "IT"],
  HU: ["AT", "SI", "SK"],
  IT: ["AT", "CH", "FR", "SI"],
  NL: ["BE", "DE"],
  PL: ["CZ", "DE", "SK"],
  SI: ["AT", "HU", "IT"],
  SK: ["AT", "CZ", "HU", "PL"],
};
