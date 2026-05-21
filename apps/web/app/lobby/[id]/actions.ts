"use server";

import { getProfile } from "@/app/lib/auth";
import { prisma } from "@quiz/db";
import { isValidChoice } from "@quiz/shared/matchChoices";
import {
  CAPITALS_TIMER_PRESETS,
  EXPAND_TIMER_PRESETS,
  RANKED_DEFAULTS,
  WAR_TIMER_PRESETS,
  isQuestionCategory,
  isValidTimer,
  type QuestionCategoryKey,
} from "@quiz/shared/lobbySettings";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type LobbySettingsResult = { ok: true } | { ok: false; error: string };

async function assertHostInWaitingLobby(
  sessionId: string,
): Promise<LobbySettingsResult & { profileId?: string }> {
  const profile = await getProfile();
  const player = await prisma.playerInGame.findUnique({
    where: {
      gameSessionId_profileId: {
        gameSessionId: sessionId,
        profileId: profile.id,
      },
    },
    select: { role: true, gameSession: { select: { status: true } } },
  });
  if (!player) return { ok: false, error: "You're not in this lobby." };
  if (player.role !== "host") {
    return { ok: false, error: "Only the host can change settings." };
  }
  if (player.gameSession.status !== "waiting") {
    return { ok: false, error: "Settings are locked once the match starts." };
  }
  return { ok: true, profileId: profile.id };
}

// Flip ranked ↔ custom. Switching back to ranked resets all overrides
// to the canonical defaults so a previous custom config doesn't quietly
// leak into a ranked match.
export async function setLobbyRanked(
  sessionId: string,
  ranked: boolean,
): Promise<LobbySettingsResult> {
  const guard = await assertHostInWaitingLobby(sessionId);
  if (!guard.ok) return guard;
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: ranked
      ? {
          ranked: true,
          capitalsTimerSec: RANKED_DEFAULTS.capitalsTimerSec,
          expandTimerSec: RANKED_DEFAULTS.expandTimerSec,
          warTimerSec: RANKED_DEFAULTS.warTimerSec,
          categories: [],
        }
      : { ranked: false },
  });
  revalidatePath(`/lobby/${sessionId}`);
  return { ok: true };
}

// Update one or more of the three customisable timers. Only allowed
// while the lobby is in custom mode — otherwise we silently ignore the
// write so a stale form submission can't sneak through after switching
// back to ranked.
export async function setLobbyTimers(
  sessionId: string,
  patch: {
    capitalsTimerSec?: number;
    expandTimerSec?: number;
    warTimerSec?: number;
  },
): Promise<LobbySettingsResult> {
  const guard = await assertHostInWaitingLobby(sessionId);
  if (!guard.ok) return guard;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    select: { ranked: true },
  });
  if (!session || session.ranked) {
    return { ok: false, error: "Switch to Custom to edit timers." };
  }

  const data: Record<string, number> = {};
  if (patch.capitalsTimerSec !== undefined) {
    if (!isValidTimer(CAPITALS_TIMER_PRESETS, patch.capitalsTimerSec)) {
      return { ok: false, error: "Invalid Capitals timer value." };
    }
    data.capitalsTimerSec = patch.capitalsTimerSec;
  }
  if (patch.expandTimerSec !== undefined) {
    if (!isValidTimer(EXPAND_TIMER_PRESETS, patch.expandTimerSec)) {
      return { ok: false, error: "Invalid Expand timer value." };
    }
    data.expandTimerSec = patch.expandTimerSec;
  }
  if (patch.warTimerSec !== undefined) {
    if (!isValidTimer(WAR_TIMER_PRESETS, patch.warTimerSec)) {
      return { ok: false, error: "Invalid War timer value." };
    }
    data.warTimerSec = patch.warTimerSec;
  }
  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.gameSession.update({ where: { id: sessionId }, data });
  revalidatePath(`/lobby/${sessionId}`);
  return { ok: true };
}

// Replace the enabled-category set. Empty array = "all categories",
// which we keep as the natural default so existing rows behave the
// same as before. Refusing to drop the last category prevents the
// question pool from going empty mid-match.
export async function setLobbyCategories(
  sessionId: string,
  categories: string[],
): Promise<LobbySettingsResult> {
  const guard = await assertHostInWaitingLobby(sessionId);
  if (!guard.ok) return guard;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    select: { ranked: true },
  });
  if (!session || session.ranked) {
    return { ok: false, error: "Switch to Custom to edit categories." };
  }

  const filtered = categories.filter(isQuestionCategory) as QuestionCategoryKey[];
  if (filtered.length === 0) {
    return { ok: false, error: "Pick at least one category." };
  }

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { categories: filtered },
  });
  revalidatePath(`/lobby/${sessionId}`);
  return { ok: true };
}

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
  // Pending invites for this lobby are dead the moment the match
  // starts — wipe them so they don't linger as stale cards in the
  // invitees' bottom-left widget (it filters by status="waiting" so
  // they'd disappear on the next poll anyway, but instant cleanup
  // removes the 12s perceived lag).
  await prisma.lobbyInvite.deleteMany({
    where: { gameSessionId: sessionId },
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

export type SendMessageResult = { ok: true } | { ok: false; error: string };

// Lobby chat: append-only. Caller must be a player in the session
// AND the session must still be waiting (we don't surface chat during
// the live match — Colyseus has its own broadcast channel).
export async function sendLobbyMessage(
  sessionId: string,
  rawText: string,
): Promise<SendMessageResult> {
  const text = rawText.trim();
  if (!text) return { ok: false, error: "Message can't be empty." };
  if (text.length > 500) {
    return { ok: false, error: "Message is too long (max 500)." };
  }

  const profile = await getProfile();
  const player = await prisma.playerInGame.findUnique({
    where: {
      gameSessionId_profileId: {
        gameSessionId: sessionId,
        profileId: profile.id,
      },
    },
    select: { id: true, gameSession: { select: { status: true } } },
  });
  if (!player) return { ok: false, error: "You're not in this lobby." };
  if (player.gameSession.status !== "waiting") {
    return { ok: false, error: "Lobby chat is closed." };
  }

  await prisma.lobbyChatMessage.create({
    data: {
      gameSessionId: sessionId,
      authorId: profile.id,
      text,
    },
  });
  return { ok: true };
}

// Host kicks a guest from a waiting lobby. Refuses if the caller isn't
// host, the target is the caller themselves, or the lobby is already
// running. Tears down their MatchChoice rows first (FK has no cascade)
// and clears any pending invite that brought them here. Cancelled
// lobbies follow the leave flow — kick is only for "waiting".
export async function kickFromLobby(
  sessionId: string,
  playerInGameId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getProfile();
  const me = await prisma.playerInGame.findUnique({
    where: {
      gameSessionId_profileId: {
        gameSessionId: sessionId,
        profileId: profile.id,
      },
    },
    select: { id: true, role: true, gameSession: { select: { status: true } } },
  });
  if (!me) return { ok: false, error: "You're not in this lobby." };
  if (me.role !== "host") {
    return { ok: false, error: "Only the host can kick players." };
  }
  if (me.gameSession.status !== "waiting") {
    return { ok: false, error: "Lobby is no longer open." };
  }
  if (me.id === playerInGameId) {
    return { ok: false, error: "Use Disband instead of kicking yourself." };
  }

  const target = await prisma.playerInGame.findUnique({
    where: { id: playerInGameId },
    select: { id: true, gameSessionId: true, profileId: true },
  });
  if (!target || target.gameSessionId !== sessionId) {
    return { ok: false, error: "Player not found in this lobby." };
  }

  await prisma.matchChoice.deleteMany({
    where: { playerInGameId: target.id },
  });
  await prisma.playerInGame.delete({ where: { id: target.id } });
  // Drop any open invite the kicked player still had so the host can
  // re-invite them after, and they don't see a ghost notification.
  await prisma.lobbyInvite.deleteMany({
    where: { gameSessionId: sessionId, inviteeId: target.profileId },
  });
  revalidatePath(`/lobby/${sessionId}`);
  return { ok: true };
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

  // Host's mode pick (2P/3P/4P) caps how many can join.
  if (session.players.length >= session.maxPlayers) {
    throw new Error("Lobby is full");
  }

  await prisma.playerInGame.create({
    data: {
      gameSessionId: sessionId,
      profileId: profile.id,
      role: "player",
    },
  });
  // Drop any pending invite for me to this lobby — I'm in, so it's
  // resolved. Without this the floating widget would keep flashing it
  // until the next poll cycle.
  await prisma.lobbyInvite.deleteMany({
    where: { inviteeId: profile.id, gameSessionId: sessionId },
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
    // Invites cascade with the session row, but lobbies torn down this
    // way are rare enough that the explicit no-op is fine.
  } else if (me.role === "host") {
    // Host bailed but guests are still here — flip to "cancelled" so
    // their lobby UIs (subscribed via Supabase realtime) auto-redirect
    // them home. Their PlayerInGame rows survive for analytics. Pending
    // invites to this dead lobby are also wiped so they stop nagging
    // anyone who hadn't accepted yet.
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: "cancelled" },
    });
    await prisma.lobbyInvite.deleteMany({
      where: { gameSessionId: sessionId },
    });
  }

  // Force the root layout (which renders ActiveGameWidget) to re-fetch
  // its DB lookup so the floating "in lobby" pill drops off. Without
  // this the RSC payload from before the action gets reused and the
  // banner persists despite the user being out of the session.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
