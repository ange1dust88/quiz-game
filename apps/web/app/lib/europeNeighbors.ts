// Adjacency map (svgId → svgIds that share a land border) for the
// playable Europe set. Re-exports the shared topology so client +
// server stay in lockstep — the server enforces adjacency, this is
// only a UI hint for highlighting legal targets.
//
// Importing from the specific subpath (not the package root) keeps
// Turbopack from pulling the rest of @quiz/shared into the client
// bundle — only europeMap travels.

export { EUROPE_TOPOLOGY as EUROPE_NEIGHBORS } from "@quiz/shared/europeMap";
