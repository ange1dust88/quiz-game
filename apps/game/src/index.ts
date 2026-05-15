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
import { prisma } from "@quiz/db";
import { MatchRoom } from "./rooms/MatchRoom.js";

// Load shared env vars from monorepo root (no-op in production where Fly
// injects them via `fly secrets`).
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.local") });

const port = Number(process.env.PORT) || 2567;

// On boot, mark all sessions still flagged "active" in the DB as
// cancelled — their Colyseus rooms can't exist anymore (we just
// started), so any client trying to join would hit "room not found".
// Otherwise stale rows keep the "Rejoin match" banner alive forever.
try {
  const cleared = await prisma.gameSession.updateMany({
    where: { status: "active" },
    data: { status: "cancelled" },
  });
  if (cleared.count > 0) {
    console.log(
      `[colyseus] cleaned up ${cleared.count} orphan active session(s)`,
    );
  }
} catch (err) {
  console.warn("[colyseus] startup cleanup failed", err);
}

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

// `filterBy(['sessionId'])` makes the matchmaker key its room pool on the
// sessionId option. Without this, two players joining "match" with the
// SAME sessionId could still land in different rooms because the matchmaker
// treats all "match" rooms as one pool — clients then see desynced state
// (different countries, different questions). With filterBy, joinOrCreate
// scans only rooms whose options.sessionId matches the incoming request,
// so a second player joining the same match is guaranteed to share state
// with the first.
gameServer.define("match", MatchRoom).filterBy(["sessionId"]);

gameServer.listen(port);
console.log(`[colyseus] listening on :${port}`);
