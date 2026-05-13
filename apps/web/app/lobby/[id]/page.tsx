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

  const userId: any = payload.userId;

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
            select: { nickname: true },
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

  const totalPlayers = session.players.length;
  const warRound =
    totalPlayers > 0
      ? Math.min(
          MAX_WAR_ROUNDS,
          Math.floor(session.warTurns / totalPlayers) + 1,
        )
      : 1;

  const initialSession = {
    id: session.id,
    status: session.status,
    stage: session.stage,
    winnerId: session.winnerId,
    warRound,
    maxWarRounds: MAX_WAR_ROUNDS,
    players: session.players.map((p) => ({
      id: p.id,
      profileId: p.profileId,
      role: p.role,
      profile: {
        nickname: p.profile.nickname,
      },
      choices: p.choices.map((c) => ({ key: c.key, value: c.value })),
    })),
    countries: session.matchMap.map((c) => ({
      id: c.id,
      ownerId: c.ownerId,
      isCapital: c.isCapital,
      points: c.points,
    })),
    events: session.events.map((e) => ({
      id: e.id,
      type: e.type,
      actorId: e.actorId,
      payload: (e.payload ?? {}) as Record<string, unknown>,
    })),
  };

  return (
    <LobbyContent
      sessionId={session.id}
      initialSession={initialSession}
      currentUser={{ id: profile.id, userId }}
    />
  );
};

export default LobbyPage;
