"use server";

import { prisma } from "@/app/lib/prisma";
import { cookies } from "next/headers";
import { decrypt } from "@/app/lib/session";
import EuropeMap from "./EuropeMap";
import TurnIndicator from "./TurnIndicator";
import QuestionModal from "./QuestionModal";
import PhaseModal from "./PhaseModal";
import { PLAYER_COLORS } from "@/app/lib/constants";
import { getProfileSafe } from "@/app/lib/auth";

const Match = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id: sessionId } = await params;

  const playerProfile = await getProfileSafe();
  if (!playerProfile) return <div>Not authenticated</div>;

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

  return (
    <>
      <div
        className="min-h-screen bg-cover bg-center text-white flex flex-col"
        style={{ backgroundImage: "url('/gradient.png')" }}
      >
        <div className="flex justify-between items-center px-6 py-4 bg-black/70 backdrop-blur border-b border-[#4f4f4f]">
          <div className="flex gap-6 items-center">
            <TurnIndicator
              sessionId={sessionId}
              initialTurnIndex={session.turnIndex}
              initialStage={session.stage}
              players={session.players}
              playerInGame={playerInGame}
              initialPickOrder={session.pickOrder}
            />
          </div>

          <div className="text-xs text-gray-400">Match {sessionId}</div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 relative">
          <EuropeMap
            countries={countries}
            players={session.players}
            playerInGame={playerInGame}
            sessionId={sessionId}
            stage={stage}
            turnIndex={session.turnIndex}
            pickOrder={session.pickOrder}
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

      <QuestionModal sessionId={sessionId} playerId={playerInGame.id} />
      <PhaseModal sessionId={sessionId} initialStage={session.stage} />
    </>
  );
};

export default Match;
