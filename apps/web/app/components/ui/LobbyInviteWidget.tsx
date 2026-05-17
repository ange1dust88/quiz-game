// Initial server-side fetch for the floating invite widget. Always
// renders the client wrapper (even with an empty list) so its poller
// can keep the list fresh without page navs — that's what surfaces an
// invite that lands while the user is sitting on the dashboard.

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
    },
  });
  return (
    <LobbyInviteWidgetClient
      initialInvites={invites.map((i) => ({
        id: i.id,
        sessionId: i.gameSessionId,
        inviterNickname: i.inviter.nickname,
        inviterAvatarUrl: i.inviter.avatarUrl,
      }))}
    />
  );
}
