// Floating "return to game" pill rendered globally by the root layout.
// Shows when the signed-in user has an open PlayerInGame attached to a
// lobby or live match, so they can hop back from any screen with one
// click. Data is fetched server-side per nav; pathname-driven hiding is
// handled by the inner client wrapper so we don't duplicate the banner
// on screens that already advertise the same game.

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
  if (!game) return null;
  return (
    <ActiveGameWidgetClient
      sessionId={game.gameSessionId}
      status={game.gameSession.status}
      ownNickname={profile.nickname}
    />
  );
}
