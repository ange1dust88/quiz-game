// Server-side fetch for any pending lobby invites the signed-in user
// hasn't dismissed yet. We filter to invites whose target session is
// still "waiting" — once a host starts or cancels, lingering rows are
// just dead weight. Render delegates to the client wrapper so the
// notification can be dismissed without a full nav.

import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import LobbyInviteWidgetClient from "./LobbyInviteWidgetClient";

export default async function LobbyInviteWidget() {
  const me = await getProfileSafe();
  if (!me) return null;
  const invites = await prisma.lobbyInvite.findMany({
    where: {
      inviteeId: me.id,
      gameSession: { status: "waiting" },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      inviter: { select: { nickname: true, avatarUrl: true } },
      gameSession: { select: { id: true } },
    },
  });
  if (invites.length === 0) return null;
  return (
    <LobbyInviteWidgetClient
      invites={invites.map((i) => ({
        id: i.id,
        sessionId: i.gameSessionId,
        inviterNickname: i.inviter.nickname,
        inviterAvatarUrl: i.inviter.avatarUrl,
      }))}
    />
  );
}
