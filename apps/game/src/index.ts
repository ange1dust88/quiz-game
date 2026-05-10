// Colyseus game server entry point. One process, listens on PORT, defines
// rooms by name. Web clients connect via WebSocket and joinOrCreate("match").
//
// We also expose plain HTTP routes on the same port so Fly.io / Railway /
// uptime monitors get a 200 response when they probe the box:
//   GET /        → "ok"  (Fly's default health check hits "/")
//   GET /health  → "ok"  (conventional liveness endpoint)
// Everything else falls through to Colyseus, which serves its matchmaking
// API.

import "dotenv/config";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { Server } from "colyseus";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { MatchRoom } from "./rooms/MatchRoom.js";

// Load shared env vars from monorepo root (no-op in production where Fly
// injects them via `fly secrets`).
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.local") });

const port = Number(process.env.PORT) || 2567;

// Pre-create the HTTP server and install our health handler BEFORE Colyseus
// wraps it. Colyseus registers its own /matchmake routes on the same server;
// our handler short-circuits for the few paths we care about and otherwise
// hands off to the next listener (Colyseus).
const httpServer = createServer();
httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  }
  // Other URLs intentionally not handled here — Colyseus's request handler
  // (registered via gameServer.attach internally) takes them.
});

const gameServer = new Server({ server: httpServer });

gameServer.define("match", MatchRoom);

gameServer.listen(port);
console.log(`[colyseus] listening on :${port}`);
