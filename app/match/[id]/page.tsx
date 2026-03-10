"use server";

import { prisma } from "@/app/lib/prisma";
import { cookies } from "next/headers";
import { decrypt } from "@/app/lib/session";
import { claimCapital } from "./actions";
import { claimTerritory } from "./actions";
import EuropeMap from "./EuropeMap";

const Match = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id: sessionId } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return <div>Not authenticated</div>;

  const payload = await decrypt(token);
  const userId: any = payload?.userId;
  if (!userId) return <div>User not found</div>;

  const playerProfile = await prisma.playerProfile.findUnique({
    where: { userId },
  });
  if (!playerProfile) return <div>Profile not found</div>;

  const playerInGame = await prisma.playerInGame.findFirst({
    where: { profileId: playerProfile.id, gameSessionId: sessionId },
  });
  if (!playerInGame) return <div>You are not in this match</div>;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: { include: { profile: true } } },
  });
  if (!session) return <div>Session not found</div>;

  const countries = await prisma.matchCountry.findMany({
    where: { gameSessionId: sessionId },
    include: { template: true, owner: { include: { profile: true } } },
  });

  const activePlayer = session.players[session.turnIndex];
  const isMyTurn = playerInGame.id === activePlayer.id;

  const playerHasCapital = !!countries.find(
    (c) => c.ownerId === playerInGame.id && c.isCapital,
  );

  const unclaimedTerritories = countries.filter((c) => !c.ownerId);

  let stage = session.stage;
  if (
    stage === "setup" &&
    countries.filter((c) => c.isCapital).length === session.players.length
  ) {
    stage = "expand";
  }
  if (stage === "expand" && unclaimedTerritories.length === 0) {
    stage = "war";
  }

  const getColor = (c: any) => {
    if (!c.owner) return "#d1d5db";
    if (c.ownerId === playerInGame.id) return "#3b82f6";
    return "#ef4444";
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-2">Match: {sessionId}</h1>

      <p className="mb-2">
        Stage: <strong>{stage.toUpperCase()}</strong>
      </p>

      <p className="mb-6">
        Turn: <strong>{activePlayer.profile.nickname}</strong>
        {isMyTurn ? " (Your turn!)" : ""}
      </p>

      <EuropeMap />

      <div className="mt-6 flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500"></div> Your territory
        </div>

        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500"></div> Enemy territory
        </div>

        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-300"></div> Unclaimed
        </div>
      </div>
    </div>
  );
};

export default Match;
