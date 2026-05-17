"use server";

// Friend system server actions. All actions assume the caller is the
// authenticated user — we resolve their profile via getProfileSafe()
// and reject anything that doesn't match. Friendship rows store an
// ordered (requester, addressee) pair until accepted; once accepted,
// both sides count as friends and the row stays put forever (no
// "swap requester/addressee" gymnastics — the unique constraint
// stays simple).

import { revalidatePath } from "next/cache";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";

export type FriendActionResult = { ok: true } | { ok: false; error: string };

export async function sendFriendRequest(
  nickname: string,
): Promise<FriendActionResult> {
  const me = await getProfileSafe();
  if (!me) return { ok: false, error: "Not signed in." };
  const clean = nickname.trim();
  if (!clean) return { ok: false, error: "Enter a nickname." };
  if (clean.toLowerCase() === me.nickname.toLowerCase()) {
    return { ok: false, error: "You can't friend yourself." };
  }

  const target = await prisma.playerProfile.findUnique({
    where: { nickname: clean },
    select: { id: true },
  });
  if (!target) return { ok: false, error: "No player with that nickname." };

  // Reject if any pair already exists in either direction.
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: me.id, addresseeId: target.id },
        { requesterId: target.id, addresseeId: me.id },
      ],
    },
    select: { status: true },
  });
  if (existing) {
    return {
      ok: false,
      error:
        existing.status === "accepted"
          ? "You're already friends."
          : "Friend request already exists.",
    };
  }

  await prisma.friendship.create({
    data: {
      requesterId: me.id,
      addresseeId: target.id,
      status: "pending",
    },
  });
  revalidatePath("/friends");
  return { ok: true };
}

export async function acceptFriendRequest(
  friendshipId: string,
): Promise<FriendActionResult> {
  const me = await getProfileSafe();
  if (!me) return { ok: false, error: "Not signed in." };
  // Only the addressee can accept.
  const row = await prisma.friendship.findUnique({
    where: { id: friendshipId },
    select: { addresseeId: true, status: true },
  });
  if (!row || row.addresseeId !== me.id) {
    return { ok: false, error: "Request not found." };
  }
  if (row.status === "accepted") {
    return { ok: false, error: "Already accepted." };
  }
  await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: "accepted", acceptedAt: new Date() },
  });
  revalidatePath("/friends");
  return { ok: true };
}

// Used for both "reject incoming", "cancel outgoing" and "remove
// existing friend" — semantically the same DB op (delete the row).
// Caller identity (must be on one of the two sides) gates the action.
export async function removeFriendship(
  friendshipId: string,
): Promise<FriendActionResult> {
  const me = await getProfileSafe();
  if (!me) return { ok: false, error: "Not signed in." };
  const row = await prisma.friendship.findUnique({
    where: { id: friendshipId },
    select: { requesterId: true, addresseeId: true },
  });
  if (!row) return { ok: false, error: "Friendship not found." };
  if (row.requesterId !== me.id && row.addresseeId !== me.id) {
    return { ok: false, error: "Not your friendship to remove." };
  }
  await prisma.friendship.delete({ where: { id: friendshipId } });
  revalidatePath("/friends");
  return { ok: true };
}
