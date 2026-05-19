// Initial server-side fetch for the floating "return to lobby / rejoin
// match" pill. Always renders the client wrapper so its poller can
// keep the pill in sync with the database — after a match ends the
// server flips the session to "completed" via a Colyseus write, and
// the polling client picks it up within seconds instead of needing a
// full nav.

import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import ActiveGameWidgetClient from "./ActiveGameWidgetClient";

export default async function ActiveGameWidget() {
  const profile = await getProfileSafe();
  if (!profile) return null;
  const game = await prisma.playerInGame.findFirst({
    where: {
      profileId: profile.id,
      gameSession: { status: { in: ["waiting", "active"] } },
    },
    orderBy: { joinedAt: "desc" },
    select: {
      gameSessionId: true,
      gameSession: { select: { status: true } },
    },
  });
  return (
    <ActiveGameWidgetClient
      initialGame={
        game
          ? {
              sessionId: game.gameSessionId,
              status: game.gameSession.status,
            }
          : null
      }
      ownNickname={profile.nickname}
    />
  );
}
