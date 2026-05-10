import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..", "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

const { prisma } = await import("@quiz/db");

const sessions = await prisma.gameSession.findMany({
  include: {
    players: {
      include: { profile: { select: { nickname: true } } },
    },
  },
  orderBy: { createdAt: "desc" },
  take: 5,
});

for (const s of sessions) {
  console.log(
    `${s.id}  status=${s.status}  stage=${s.stage}  ` +
      `players=[${s.players.map((p) => p.profile.nickname).join(", ")}]`,
  );
}
process.exit(0);
