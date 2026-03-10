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

  const PLAYER_COLORS = [
    "#3b82f6", // blue
    "#ef4444", // red
    "#22c55e", // green
    "#f59e0b", // yellow
  ];

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
    <div
      className="min-h-screen bg-cover bg-center text-white flex flex-col"
      style={{ backgroundImage: "url('/gradient.png')" }}
    >
      {/* TOP BAR */}
      <div className="flex justify-between items-center px-6 py-4 bg-black/70 backdrop-blur border-b border-[#4f4f4f]">
        <div className="flex gap-6 items-center">
          <p className="text-sm text-gray-400">
            Stage: <span className="text-white font-semibold">{stage}</span>
          </p>

          <p className="text-sm text-gray-400">
            Turn:
            <span className="text-white font-semibold ml-1">
              {activePlayer.profile.nickname}
            </span>
          </p>

          {isMyTurn && (
            <span className="text-green-400 text-sm font-semibold">
              Your turn
            </span>
          )}
        </div>

        <div className="text-xs text-gray-400">Match {sessionId}</div>
      </div>

      {/* MAP */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        <EuropeMap
          countries={countries}
          players={session.players}
          playerInGame={playerInGame}
          isMyTurn={isMyTurn}
          sessionId={sessionId}
          stage={stage}
        />

        <div className="absolute top-6 right-6 bg-black border border-[#4f4f4f] rounded-lg p-4 px-6 flex flex-col gap-3">
          <h3 className="text-sm text-gray-400 font-semibold">Players</h3>

          {session.players.map((p, index) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: PLAYER_COLORS[index] }}
              />

              <span className="text-white">
                {p.profile.nickname}
                {p.id === playerInGame.id && (
                  <span className="text-gray-400"> (You)</span>
                )}
              </span>
            </div>
          ))}

          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 bg-gray-300 rounded-sm"></div>
            <span className="text-gray-300">Unclaimed</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Match;
