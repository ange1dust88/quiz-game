// Tiny GET endpoint the floating "rejoin / return to lobby" widget
// polls so it snaps to the user's current PlayerInGame state without
// waiting for a full page nav. Returns the single most-recent open
// session the viewer is attached to (or null).

import { NextResponse } from "next/server";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";

export async function GET() {
  const me = await getProfileSafe();
  if (!me) return NextResponse.json({ game: null }, { status: 200 });
  const game = await prisma.playerInGame.findFirst({
    where: {
      profileId: me.id,
      gameSession: { status: { in: ["waiting", "active"] } },
    },
    orderBy: { joinedAt: "desc" },
    select: {
      gameSessionId: true,
      gameSession: { select: { status: true } },
    },
  });
  return NextResponse.json({
    game: game
      ? {
          sessionId: game.gameSessionId,
          status: game.gameSession.status,
        }
      : null,
  });
}
