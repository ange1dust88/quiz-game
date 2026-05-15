"use server";

import { getProfile } from "@/app/lib/auth";
import { prisma } from "@quiz/db";
import { isValidChoice } from "@quiz/shared/matchChoices";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function startGame(formData: FormData) {
  const sessionId = formData.get("sessionId") as string;

  const profile = await getProfile();
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) throw new Error("Session not found");

  const currentPlayer = session.players.find((p) => p.profileId === profile.id);
  if (!currentPlayer) throw new Error("You are not in this session");

  if (currentPlayer.role !== "host")
    throw new Error("Only host can start the game");

  if (session.players.length < 2)
    throw new Error("Not enough players to start the game");

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      status: "active",
      capitalExpiresAt: new Date(Date.now() + 20000),
      // Reset for a fresh match — a previous game (if any) might have
      // left a stale id pointing at a now-disposed Colyseus room.
      gameRoomId: null,
    },
  });
  // Layout-level revalidate so the floating ActiveGameWidget on every
  // page picks up the new "in match" status instead of "in lobby".
  revalidatePath("/", "layout");
  redirect(`/match/${sessionId}`);
}

// Called from the host's MatchClient after they successfully joinOrCreate
// the Colyseus room. Guests poll for this column and use joinById, which
// eliminates the joinOrCreate race that puts the two clients in different
// rooms (same sessionId, different room ids on the matchmaker).
//
// The where clause is conservative: only set gameRoomId if it's still
// null. If two clients happen to race joinOrCreate, the second claim is
// a no-op and the loser leaves their orphan room.
export async function claimGameRoomId(
  sessionId: string,
  roomId: string,
): Promise<{ ok: boolean; canonicalRoomId: string | null }> {
  if (!sessionId || !roomId)
    return { ok: false, canonicalRoomId: null };
  const result = await prisma.gameSession.updateMany({
    where: { id: sessionId, gameRoomId: null },
    data: { gameRoomId: roomId },
  });
  if (result.count === 1) {
    return { ok: true, canonicalRoomId: roomId };
  }
  // Someone else got here first — return what they claimed so the caller
  // can hop into the canonical room.
  const fresh = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    select: { gameRoomId: true },
  });
  return { ok: false, canonicalRoomId: fresh?.gameRoomId ?? null };
}

// Polled by guests until the host's first joinOrCreate populates this.
// Cheap single-row read, called every ~500ms by waiting clients —
// bounded because the host's connect typically finishes in a few hundred
// milliseconds.
export async function getGameRoomId(
  sessionId: string,
): Promise<string | null> {
  if (!sessionId) return null;
  const row = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    select: { gameRoomId: true },
  });
  return row?.gameRoomId ?? null;
}

export async function setMatchChoice(
  sessionId: string,
  key: string,
  value: string,
) {
  if (!isValidChoice(key, value)) return;

  const profile = await getProfile();
  const player = await prisma.playerInGame.findUnique({
    where: {
      gameSessionId_profileId: {
        gameSessionId: sessionId,
        profileId: profile.id,
      },
    },
    include: { gameSession: true },
  });
  if (!player) return;
  // Choices lock once the game starts so they can't be changed mid-match.
  if (player.gameSession.status !== "waiting") return;

  await prisma.matchChoice.upsert({
    where: {
      playerInGameId_key: { playerInGameId: player.id, key },
    },
    create: { playerInGameId: player.id, key, value },
    update: { value },
  });
}

export async function joinGame(sessionId: string) {
  const profile = await getProfile();
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) throw new Error("Session not found");
  if (session.status !== "waiting") throw new Error("Game already started");

  const existing = session.players.find((p) => p.profileId === profile.id);
  if (existing) return;

  await prisma.playerInGame.create({
    data: {
      gameSessionId: sessionId,
      profileId: profile.id,
      role: "player",
    },
  });
  revalidatePath("/", "layout");
}

// Player drops out of a waiting lobby. If they're the host the whole
// lobby is cancelled (status="cancelled" — kept around for analytics,
// hidden from the active-game banner / widget). Guests just remove
// their seat. Only allowed for waiting lobbies; active matches are
// authoritative on Colyseus and should be left via the match Leave
// button instead.
export async function leaveLobby(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;

  const profile = await getProfile();
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        where: { profileId: profile.id },
        select: { id: true, role: true },
      },
    },
  });
  if (!session) {
    redirect("/dashboard");
  }
  const me = session.players[0];
  if (!me || session.status !== "waiting") {
    redirect("/dashboard");
    return;
  }

  // Step 1 — remove the leaving player's seat + their choices.
  // MatchChoice has a FK to PlayerInGame and there's no onDelete cascade
  // in the schema, so we wipe choices first to avoid a constraint error.
  await prisma.matchChoice.deleteMany({
    where: { playerInGameId: me.id },
  });
  await prisma.playerInGame.delete({ where: { id: me.id } });

  // Step 2 — if the lobby is now empty (solo host leaving, or last
  // guest of an abandoned cancelled lobby), drop the GameSession row
  // entirely. Waiting lobbies have no MatchCountry / MatchQuestion /
  // MatchEvent children yet, so this trio is enough.
  const remaining = await prisma.playerInGame.count({
    where: { gameSessionId: sessionId },
  });
  if (remaining === 0) {
    await prisma.gameSession.delete({ where: { id: sessionId } });
  } else if (me.role === "host") {
    // Host bailed but guests are still here — flip to "cancelled" so
    // their lobby UIs (subscribed via Supabase realtime) auto-redirect
    // them home. Their PlayerInGame rows survive for analytics.
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: "cancelled" },
    });
  }

  // Force the root layout (which renders ActiveGameWidget) to re-fetch
  // its DB lookup so the floating "in lobby" pill drops off. Without
  // this the RSC payload from before the action gets reused and the
  // banner persists despite the user being out of the session.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
