// Phase 3.3 smoke test: connects two players to a real session, picks
// capitals on each one's turn, watches the room transition to expand
// after both have placed.
//
// Run: pnpm --filter @quiz/game exec tsx src/scripts/testCapitals.ts

import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { SignJWT } from "jose";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..", "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

const { prisma } = await import("@quiz/db");
const { Client } = await import(
  "/Users/levzubenko/uni/quiz-game/node_modules/.pnpm/colyseus.js@0.16.22/node_modules/colyseus.js/build/esm/index.mjs" as any
);

const sessions = await prisma.gameSession.findMany({
  include: { players: { include: { profile: { include: { user: true } } } } },
  orderBy: { createdAt: "desc" },
  take: 10,
});
const session = sessions.find((s) => s.players.length >= 2);
if (!session) {
  console.log("[!] no session with ≥2 players found in last 10 sessions");
  process.exit(1);
}

const secret = process.env.SESSION_SECRET!;
async function jwtFor(userId: string) {
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

const client = new Client("ws://localhost:2567");

const p0 = session.players[0];
const p1 = session.players[1];
console.log(
  `[test] session ${session.id} | players: ${p0.profile.nickname}, ${p1.profile.nickname}`,
);

const room0 = await client.joinOrCreate("match", {
  sessionId: session.id,
  jwt: await jwtFor(p0.profile.userId),
});
const room1 = await client.joinById(room0.roomId, {
  sessionId: session.id,
  jwt: await jwtFor(p1.profile.userId),
});
console.log(`[test] both connected to room ${room0.roomId}`);

await new Promise<void>((r) =>
  room0.onStateChange.once(() => r()),
);

let lastStage = room0.state.stage;
let lastTurn = room0.state.turnIndex;
console.log(
  `[init] stage=${lastStage} turnIndex=${lastTurn} capitalExpiresAt=${room0.state.capitalExpiresAt}`,
);

room0.onStateChange((s: any) => {
  if (s.stage !== lastStage || s.turnIndex !== lastTurn) {
    console.log(`[update] stage=${s.stage} turnIndex=${s.turnIndex}`);
    lastStage = s.stage;
    lastTurn = s.turnIndex;
  }
});

// Find any free country svgIds
const freeSvgIds: string[] = [];
room0.state.countries.forEach((c: any) => {
  if (!c.ownerId) freeSvgIds.push(c.svgId);
});

// Player 0 picks first
console.log(`[test] p0 picking capital ${freeSvgIds[0]}`);
room0.send("claim_capital", { svgId: freeSvgIds[0] });
await new Promise((r) => setTimeout(r, 500));

// Player 1 picks second
console.log(`[test] p1 picking capital ${freeSvgIds[1]}`);
room1.send("claim_capital", { svgId: freeSvgIds[1] });
await new Promise((r) => setTimeout(r, 500));

console.log(`[final] stage=${room0.state.stage} turnIndex=${room0.state.turnIndex}`);
let capitals = 0;
room0.state.countries.forEach((c: any) => {
  if (c.isCapital) {
    capitals++;
    const owner = room0.state.players.get(c.ownerId);
    console.log(
      `  capital ${c.svgId}: owner=${owner?.nickname} armies=${c.armies}/${c.maxArmies} points=${c.points}`,
    );
  }
});
console.log(`[final] ${capitals} capitals placed`);

room0.leave();
room1.leave();
process.exit(0);
