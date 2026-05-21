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

// How long a lobby invite stays live before it auto-expires. 3 minutes
// is short enough that an unanswered invite frees the reserved slot
// quickly, long enough that the invitee has time to swing back to the
// app and click Accept. Module-private — a "use server" file can only
// export async functions.
const INVITE_TTL_MS = 3 * 60 * 1000;

export async function inviteFriendToLobby(
  friendProfileId: string,
  sessionId: string,
): Promise<InviteResult> {
  const me = await getProfileSafe();
  if (!me) return { ok: false, error: "Not signed in." };

  // Caller must be in the target session AND it must still be waiting.
  // Pull maxPlayers + total seats + active invite count so we can
  // refuse over-booking (lobby capacity = players + outstanding invites).
  const now = new Date();
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      maxPlayers: true,
      _count: { select: { players: true } },
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

  // Don't let invites + seats exceed maxPlayers. We count only active
  // (non-expired) invites so a stale row from a previous session
  // doesn't permanently block the slot.
  const activeInvites = await prisma.lobbyInvite.count({
    where: { gameSessionId: sessionId, expiresAt: { gt: now } },
  });
  if (session._count.players + activeInvites >= session.maxPlayers) {
    return { ok: false, error: "Lobby is full." };
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
  // Re-inviting an expired row refreshes both createdAt and expiresAt
  // so it becomes "live" again.
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
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
      expiresAt,
    },
    update: { inviterId: me.id, createdAt: now, expiresAt },
  });
  revalidatePath(`/lobby/${sessionId}`);
  return { ok: true };
}

// Host-side invite cancel — removes the LobbyInvite row, freeing the
// reserved slot and dismissing the invitee's notification on the next
// poll. Differs from `dismissLobbyInvite` (which is invitee-side).
export async function cancelLobbyInvite(
  inviteId: string,
): Promise<InviteResult> {
  const me = await getProfileSafe();
  if (!me) return { ok: false, error: "Not signed in." };

  const row = await prisma.lobbyInvite.findUnique({
    where: { id: inviteId },
    select: {
      inviterId: true,
      gameSessionId: true,
      gameSession: {
        select: {
          players: { where: { profileId: me.id }, select: { role: true } },
        },
      },
    },
  });
  if (!row) return { ok: false, error: "Invite not found." };
  const myRole = row.gameSession.players[0]?.role;
  // Either the original inviter or the lobby host can cancel.
  if (row.inviterId !== me.id && myRole !== "host") {
    return { ok: false, error: "Not allowed to cancel this invite." };
  }
  await prisma.lobbyInvite.delete({ where: { id: inviteId } });
  revalidatePath(`/lobby/${row.gameSessionId}`);
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
