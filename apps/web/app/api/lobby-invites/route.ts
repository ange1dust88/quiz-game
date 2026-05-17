// Tiny GET endpoint the floating invite widget polls every ~12s so
// new lobby invites surface without a full page nav. Auth-gated and
// scoped to invites whose target lobby is still "waiting".

import { NextResponse } from "next/server";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";

export async function GET() {
  const me = await getProfileSafe();
  if (!me) {
    return NextResponse.json({ invites: [] }, { status: 200 });
  }
  const invites = await prisma.lobbyInvite.findMany({
    where: {
      inviteeId: me.id,
      gameSession: { status: "waiting" },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      inviter: { select: { nickname: true, avatarUrl: true } },
    },
  });
  return NextResponse.json({
    invites: invites.map((i) => ({
      id: i.id,
      sessionId: i.gameSessionId,
      inviterNickname: i.inviter.nickname,
      inviterAvatarUrl: i.inviter.avatarUrl,
    })),
  });
}
