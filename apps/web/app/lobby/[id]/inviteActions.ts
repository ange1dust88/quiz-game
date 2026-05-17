"use server";

// Lobby-invite actions. Inviting requires (a) the caller is currently
// in the lobby they're inviting to and (b) caller + invitee are
// accepted friends. Dismiss can be called by the invitee only.
//
// We don't store an "accepted" status — once the invitee joins the
// lobby through the normal flow, the invite row becomes redundant and
// the lobby UI just doesn't render it anymore. Dismissed invites are
// deleted outright.

import { revalidatePath } from "next/cache";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";

export type InviteResult = { ok: true } | { ok: false; error: string };

export async function inviteFriendToLobby(
  friendProfileId: string,
  sessionId: string,
): Promise<InviteResult> {
  const me = await getProfileSafe();
  if (!me) return { ok: false, error: "Not signed in." };

  // Caller must be in the target session AND it must still be waiting.
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      players: { where: { profileId: me.id }, select: { id: true } },
    },
  });
  if (!session) return { ok: false, error: "Lobby not found." };
  if (session.status !== "waiting") {
    return { ok: false, error: "Lobby is no longer open." };
  }
  if (session.players.length === 0) {
    return { ok: false, error: "You're not in this lobby." };
  }

  // Friendship must be accepted (in either direction).
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: me.id, addresseeId: friendProfileId },
        { requesterId: friendProfileId, addresseeId: me.id },
      ],
    },
    select: { id: true },
  });
  if (!friendship) {
    return { ok: false, error: "Not friends with that player." };
  }

  // Don't invite someone who's already in the lobby.
  const alreadyIn = await prisma.playerInGame.findFirst({
    where: { gameSessionId: sessionId, profileId: friendProfileId },
    select: { id: true },
  });
  if (alreadyIn) {
    return { ok: false, error: "They're already in the lobby." };
  }

  // Upsert protects against double-clicks and the unique constraint.
  await prisma.lobbyInvite.upsert({
    where: {
      inviteeId_gameSessionId: {
        inviteeId: friendProfileId,
        gameSessionId: sessionId,
      },
    },
    create: {
      inviterId: me.id,
      inviteeId: friendProfileId,
      gameSessionId: sessionId,
    },
    update: { inviterId: me.id, createdAt: new Date() },
  });
  revalidatePath(`/lobby/${sessionId}`);
  return { ok: true };
}

export async function dismissLobbyInvite(
  inviteId: string,
): Promise<InviteResult> {
  const me = await getProfileSafe();
  if (!me) return { ok: false, error: "Not signed in." };
  const row = await prisma.lobbyInvite.findUnique({
    where: { id: inviteId },
    select: { inviteeId: true },
  });
  if (!row || row.inviteeId !== me.id) {
    return { ok: false, error: "Invite not found." };
  }
  await prisma.lobbyInvite.delete({ where: { id: inviteId } });
  revalidatePath("/");
  return { ok: true };
}
