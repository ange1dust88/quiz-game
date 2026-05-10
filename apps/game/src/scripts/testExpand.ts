// Phase 3.4 smoke test:
// 1. Connect 2 players
// 2. Both pick capitals → stage flips to expand
// 3. Wait for first question to arrive (~3.5s nextQuestionAt delay)
// 4. Both submit answers
// 5. Confirm pickOrder is set on the winner
// 6. Winner picks a territory
//
// Run: pnpm --filter @quiz/game exec tsx src/scripts/testExpand.ts

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
  console.log("[!] no session with ≥2 players");
  process.exit(1);
}

const secret = process.env.SESSION_SECRET!;
const sign = (uid: string) =>
  new SignJWT({ userId: uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));

const client = new Client("ws://localhost:2567");
const p0 = session.players[0];
const p1 = session.players[1];

const room0 = await client.joinOrCreate("match", {
  sessionId: session.id,
  jwt: await sign(p0.profile.userId),
});
const room1 = await client.joinById(room0.roomId, {
  sessionId: session.id,
  jwt: await sign(p1.profile.userId),
});
console.log(`[test] connected to ${room0.roomId}`);

await new Promise<void>((r) => room0.onStateChange.once(() => r()));

// Both pick capitals to advance to expand
const free: string[] = [];
room0.state.countries.forEach((c: any) => { if (!c.ownerId) free.push(c.svgId); });
console.log(`[test] p0 picks capital ${free[0]}`);
room0.send("claim_capital", { svgId: free[0] });
await new Promise((r) => setTimeout(r, 300));
console.log(`[test] p1 picks capital ${free[1]}`);
room1.send("claim_capital", { svgId: free[1] });
await new Promise((r) => setTimeout(r, 300));
console.log(`[stage] ${room0.state.stage}, nextQuestionAt=${room0.state.nextQuestionAt}`);

// Listen for round_results broadcast
room0.onMessage("round_results", (msg: any) => {
  console.log(`[results] correct=${msg.correctAnswer}, places:`);
  for (const r of msg.results) {
    console.log(`  #${r.place} ${r.nickname} answer=${r.answer} diff=${r.diff} timeMs=${r.timeMs}`);
  }
});

// Wait for question to arrive (PHASE_DELAY_MS = 3.5s)
console.log(`[test] waiting for question...`);
await new Promise<void>((resolve) => {
  const check = () => {
    if (room0.state.activeQuestion) {
      console.log(`[question] "${room0.state.activeQuestion.text}" (${room0.state.activeQuestion.category})`);
      resolve();
    } else {
      setTimeout(check, 200);
    }
  };
  check();
});

// Both submit answers
console.log(`[test] p0 submits answer 100`);
room0.send("submit_answer", { value: 100, firstInputAtMs: 500, inputChangeCount: 3 });
await new Promise((r) => setTimeout(r, 200));
console.log(`[test] p1 submits answer 200`);
room1.send("submit_answer", { value: 200, firstInputAtMs: 800, inputChangeCount: 5 });

// Wait for resolution
await new Promise((r) => setTimeout(r, 800));
const pickOrderArr: string[] = [];
room0.state.pickOrder.forEach((id: string) => pickOrderArr.push(id));
console.log(`[after-resolve] activeQuestion=${room0.state.activeQuestion ? "still" : "null"} pickOrder=[${pickOrderArr.join(",")}]`);

// Winner picks a territory
const winnerId = pickOrderArr[0];
const winnerRoom = winnerId === p0.id ? room0 : room1;
const winnerName = winnerId === p0.id ? p0.profile.nickname : p1.profile.nickname;

// Find a free neighbor of winner's existing country
let pickSvg: string | null = null;
const myTids = new Set<number>();
winnerRoom.state.countries.forEach((c: any) => { if (c.ownerId === winnerId) myTids.add(c.templateId); });
console.log(`[test] ${winnerName} owns ${myTids.size} territories, picking neighbor...`);
// Brute force: try every free country (the room will reject non-neighbors)
let attempts = 0;
const candidates: string[] = [];
winnerRoom.state.countries.forEach((c: any) => { if (!c.ownerId) candidates.push(c.svgId); });
for (const svgId of candidates) {
  if (attempts >= 5) break;
  pickSvg = svgId;
  console.log(`[test] ${winnerName} picks territory ${pickSvg}`);
  winnerRoom.send("claim_territory", { svgId: pickSvg });
  await new Promise((r) => setTimeout(r, 300));
  // Check if it was accepted (look for new ownership)
  let claimed = false;
  winnerRoom.state.countries.forEach((c: any) => {
    if (c.svgId === pickSvg && c.ownerId === winnerId) claimed = true;
  });
  if (claimed) { console.log(`  ✓ accepted`); break; }
  attempts++;
}

const pickOrderAfter: string[] = [];
room0.state.pickOrder.forEach((id: string) => pickOrderAfter.push(id));
console.log(`[final] pickOrder=[${pickOrderAfter.join(",")}] nextQuestionAt=${room0.state.nextQuestionAt}`);

room0.leave();
room1.leave();
process.exit(0);
