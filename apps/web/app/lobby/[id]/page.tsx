"use server";

import { prisma } from "@quiz/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decrypt } from "@/app/lib/session";
import { LobbyContent } from "./LobbyContent";
import { MAX_WAR_ROUNDS } from "@/app/lib/constants";

function redirectToMatch(sessionId: string): never {
  redirect(`/match/${sessionId}`);
}

const LobbyPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) {
    return <div>Unauthorized</div>;
  }

  const payload = await decrypt(token);
  if (!payload?.userId) {
    return <div>Invalid session</div>;
  }

  const userId = payload.userId as string;

  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    return <div>Profile not found</div>;
  }

  const session = await prisma.gameSession.findUnique({
    where: { id },
    include: {
      players: {
        include: {
          profile: {
            select: {
              nickname: true,
              avatarUrl: true,
              level: true,
              elo: true,
              country: true,
            },
          },
          choices: { select: { key: true, value: true } },
        },
      },
      matchMap: true,
      events: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });

  if (!session) {
    return <div>No room found</div>;
  }

  // Disbanded by host — there's nothing to do here, send the user back.
  if (session.status === "cancelled") {
    redirect("/dashboard");
  }

  // If the match is already running, drop the player straight into it. This
  // catches the case where someone joined a session whose host had already
  // hit Start — without this they'd see a stale "waiting" lobby.
  const myPlayer = session.players.find((p) => p.profileId === profile.id);
  if (myPlayer && session.status === "active") {
    return redirectToMatch(id);
  }


  // For finished matches, the ONLY source of truth is MatchSnapshot —
  // the legacy MatchCountry / MatchEvent tables are not written during
  // a Colyseus match, so lands / points / per-player stats must come
  // from finalState + telemetry, not from session.matchMap / events.
  const abandonedByPlayerId = new Map<string, boolean>();
  let snapshotCountries: Array<{
    id: string;
    ownerId: string | null;
    isCapital: boolean;
    points: number;
  }> | null = null;
  let snapshotStats: Array<{
    playerId: string;
    roundsWon: number;
    attacksWon: number;
    defended: number;
    capitalsTaken: number;
  }> = [];
  let snapshotWarTurns: number | null = null;
  if (session.status === "completed") {
    const snap = await prisma.matchSnapshot.findUnique({
      where: { sessionId: id },
      select: { finalState: true, telemetry: true },
    });
    type SnapPlayer = { id: string; abandoned?: boolean };
    type SnapCountry = {
      svgId: string;
      ownerId: string | null;
      isCapital: boolean;
      points: number;
    };
    const fs = snap?.finalState as {
      players?: SnapPlayer[];
      countries?: SnapCountry[];
      warTurns?: number;
    } | null;
    fs?.players?.forEach((sp) => {
      abandonedByPlayerId.set(sp.id, Boolean(sp.abandoned));
    });
    if (fs?.countries) {
      snapshotCountries = fs.countries.map((c) => ({
        id: c.svgId,
        ownerId: c.ownerId,
        isCapital: c.isCapital,
        points: c.points,
      }));
    }
    if (typeof fs?.warTurns === "number") snapshotWarTurns = fs.warTurns;

    // Per-player aggregates from telemetry. Attacks log two rows per
    // attack (a "started" record + a resolution record) — count only
    // resolutions. Expand-round wins: group numeric answers by question
    // and credit the closest guess (earlier submission breaks ties).
    type Tel = {
      attacks?: Array<{
        attackerId: string;
        defenderId: string;
        outcome: string;
        capitalFell?: boolean;
      }>;
      numericAnswers?: Array<{
        playerId: string;
        questionId: number;
        diff: number;
        timeMs: number;
      }>;
    };
    const tel = (snap?.telemetry ?? {}) as Tel;
    const agg = new Map<
      string,
      { roundsWon: number; attacksWon: number; defended: number; capitalsTaken: number }
    >();
    const bump = (
      pid: string,
      key: "roundsWon" | "attacksWon" | "defended" | "capitalsTaken",
    ) => {
      const a =
        agg.get(pid) ??
        { roundsWon: 0, attacksWon: 0, defended: 0, capitalsTaken: 0 };
      a[key] += 1;
      agg.set(pid, a);
    };
    for (const at of tel.attacks ?? []) {
      if (at.outcome === "attacker_won") {
        bump(at.attackerId, "attacksWon");
        if (at.capitalFell) bump(at.attackerId, "capitalsTaken");
      } else if (at.outcome === "defender_held") {
        bump(at.defenderId, "defended");
      }
    }
    const byQuestion = new Map<
      number,
      { playerId: string; diff: number; timeMs: number }
    >();
    for (const na of tel.numericAnswers ?? []) {
      const best = byQuestion.get(na.questionId);
      if (
        !best ||
        na.diff < best.diff ||
        (na.diff === best.diff && na.timeMs < best.timeMs)
      ) {
        byQuestion.set(na.questionId, na);
      }
    }
    for (const w of byQuestion.values()) bump(w.playerId, "roundsWon");
    snapshotStats = [...agg.entries()].map(([playerId, a]) => ({
      playerId,
      ...a,
    }));
  }

  const totalPlayers = session.players.length;
  const effectiveWarTurns = snapshotWarTurns ?? session.warTurns;
  const warRound =
    totalPlayers > 0
      ? Math.min(
          MAX_WAR_ROUNDS,
          Math.floor(effectiveWarTurns / totalPlayers) + 1,
        )
      : 1;

  const initialSession = {
    id: session.id,
    status: session.status,
    stage: session.stage,
    winnerId: session.winnerId,
    warRound,
    maxWarRounds: MAX_WAR_ROUNDS,
    maxPlayers: session.maxPlayers,
    ranked: session.ranked,
    capitalsTimerSec: session.capitalsTimerSec,
    expandTimerSec: session.expandTimerSec,
    warTimerSec: session.warTimerSec,
    categories: session.categories as string[],
    players: session.players.map((p) => ({
      id: p.id,
      profileId: p.profileId,
      role: p.role,
      abandoned: abandonedByPlayerId.get(p.id) ?? false,
      profile: {
        nickname: p.profile.nickname,
        avatarUrl: p.profile.avatarUrl ?? null,
        level: p.profile.level,
        elo: p.profile.elo,
        country: p.profile.country ?? null,
      },
      choices: p.choices.map((c) => ({ key: c.key, value: c.value })),
    })),
    // Completed matches read the authoritative snapshot; the legacy
    // matchMap only covers pre-Colyseus data.
    countries:
      snapshotCountries ??
      session.matchMap.map((c) => ({
        id: c.id,
        ownerId: c.ownerId,
        isCapital: c.isCapital,
        points: c.points,
      })),
    snapshotStats,
    events: session.events.map((e) => ({
      id: e.id,
      type: e.type,
      actorId: e.actorId,
      payload: (e.payload ?? {}) as Record<string, unknown>,
    })),
  };

  // Sweep expired invites for this lobby before reading. Cheap (one
  // DELETE WHERE filter) and runs on every page load — keeps the
  // LobbyInvite table from accumulating stale rows once the TTL kicks
  // in. Awaited so subsequent queries see the post-cleanup state.
  const now = new Date();
  await prisma.lobbyInvite.deleteMany({
    where: { gameSessionId: id, expiresAt: { lt: now } },
  });

  // Friends + already-sent invites + active invite roster for slot
  // rendering. After the sweep above, every LobbyInvite row for this
  // session is by construction active — we still keep the expiresAt
  // filter as a safety net against the millisecond between sweep and
  // read.
  const playerProfileIds = new Set(session.players.map((p) => p.profileId));
  const [friendships, sentInvites, activeInvites] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        status: "accepted",
        OR: [
          { requesterId: profile.id },
          { addresseeId: profile.id },
        ],
      },
      include: {
        requester: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            level: true,
            elo: true,
            country: true,
          },
        },
        addressee: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            level: true,
            elo: true,
            country: true,
          },
        },
      },
    }),
    prisma.lobbyInvite.findMany({
      where: {
        gameSessionId: id,
        inviterId: profile.id,
        expiresAt: { gt: now },
      },
      select: { inviteeId: true },
    }),
    prisma.lobbyInvite.findMany({
      where: { gameSessionId: id, expiresAt: { gt: now } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        inviteeId: true,
        expiresAt: true,
        invitee: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            level: true,
            elo: true,
            country: true,
          },
        },
      },
    }),
  ]);
  const friendList = friendships
    .map((f) =>
      f.requesterId === profile.id ? f.addressee : f.requester,
    )
    .filter((p) => !playerProfileIds.has(p.id));
  const invitedIds = new Set(sentInvites.map((i) => i.inviteeId));
  const pendingInvites = activeInvites.map((inv) => ({
    inviteId: inv.id,
    profile: {
      id: inv.invitee.id,
      nickname: inv.invitee.nickname,
      avatarUrl: inv.invitee.avatarUrl ?? null,
      level: inv.invitee.level,
      elo: inv.invitee.elo,
      country: inv.invitee.country ?? null,
    },
    expiresAt: inv.expiresAt.toISOString(),
  }));

  return (
    <LobbyContent
      sessionId={session.id}
      initialSession={initialSession}
      currentUser={{ id: profile.id, userId }}
      friends={friendList}
      invitedIds={Array.from(invitedIds)}
      pendingInvites={pendingInvites}
    />
  );
};

export default LobbyPage;
