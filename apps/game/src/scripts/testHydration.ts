// Manual smoke test for Phase 3.1 + 3.2:
// 1. Pick the most recent completed session
// 2. Sign a JWT for one of its players using SESSION_SECRET
// 3. Connect to Colyseus with sessionId + jwt
// 4. Wait for state, print summary
//
// Run: pnpm --filter @quiz/game exec tsx src/scripts/testHydration.ts

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

const session = await prisma.gameSession.findFirst({
  include: {
    players: { include: { profile: { include: { user: true } } } },
  },
  orderBy: { createdAt: "desc" },
});
if (!session || session.players.length === 0) {
  console.log("[!] no session with players found");
  process.exit(1);
}
const player = session.players[0];
const userId = player.profile.userId;
console.log(
  `[test] using session ${session.id} as player ${player.profile.nickname} (userId=${userId})`,
);

const secret = process.env.SESSION_SECRET!;
const jwt = await new SignJWT({ userId })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(secret));
console.log(`[test] signed jwt (${jwt.length} chars)`);

const client = new Client("ws://localhost:2567");
const room = await client.joinOrCreate("match", {
  sessionId: session.id,
  jwt,
});
console.log(`[test] connected to room ${room.roomId}`);

await new Promise<void>((resolve) => {
  room.onStateChange.once((s: any) => {
    console.log(`[test] state arrived:`);
    console.log(`  stage=${s.stage}`);
    console.log(`  status=${s.status}`);
    console.log(`  turnIndex=${s.turnIndex}`);
    console.log(`  players.size=${s.players.size}`);
    console.log(`  countries.size=${s.countries.size}`);
    s.players.forEach((p: any) => {
      console.log(
        `    player ${p.id}: ${p.nickname} turnOrder=${p.turnOrder} capStyle=${p.capitalStyle} connected=${p.connected}`,
      );
    });
    resolve();
  });
});

await new Promise((r) => setTimeout(r, 200));
room.leave();
process.exit(0);
