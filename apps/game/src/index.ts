// Colyseus game server entry point. One process, listens on PORT, defines
// rooms by name. Web clients connect via WebSocket and joinOrCreate("match").

import "dotenv/config";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { Server } from "colyseus";
import { createServer } from "http";
import { MatchRoom } from "./rooms/MatchRoom.js";

// Load shared env vars from monorepo root.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.local") });

const port = Number(process.env.PORT) || 2567;
const httpServer = createServer();
const gameServer = new Server({ server: httpServer });

gameServer.define("match", MatchRoom);

gameServer.listen(port);
console.log(`[colyseus] listening on :${port}`);
