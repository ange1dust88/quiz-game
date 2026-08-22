/** Remove ALL seeded synthetic players + their sessions/snapshots/history. */
import { prisma } from "@quiz/db";
const profiles = await prisma.playerProfile.findMany({ where: { synthetic: true }, select: { id: true, userId: true } });
const ids = profiles.map((p) => p.id);
console.log(`wiping ${ids.length} synthetic profiles`);
if (ids.length) {
  const pigs = await prisma.playerInGame.findMany({ where: { profileId: { in: ids } }, select: { gameSessionId: true } });
  const sessionIds = [...new Set(pigs.map((p) => p.gameSessionId))];
  // Only sessions where EVERY player is synthetic (seeded matches are, by construction).
  const safe: string[] = [];
  for (const sid of sessionIds) {
    const others = await prisma.playerInGame.count({ where: { gameSessionId: sid, profile: { synthetic: false } } });
    if (others === 0) safe.push(sid);
  }
  await prisma.gameSession.deleteMany({ where: { id: { in: safe } } }); // cascades PIG + snapshot; elo history SetNull
  await prisma.eloHistoryEntry.deleteMany({ where: { profileId: { in: ids } } });
  await prisma.playerProfile.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: profiles.map((p) => p.userId) } } });
  console.log(`removed ${safe.length} sessions + ${ids.length} profiles`);
}
await prisma.$disconnect();
