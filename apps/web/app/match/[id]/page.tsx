"use server";

import { prisma } from "@quiz/db";
import EuropeMap from "./EuropeMap";
import { getProfileSafe } from "@/app/lib/auth";
import MatchHeader from "./MatchHeader";
import PlayerPanel from "./PlayerPanel";
import ActionPanel from "./ActionPanel";
import StatusBar from "./StatusBar";
import EventFeed from "./EventFeed";
import { MAX_WAR_ROUNDS } from "@/app/lib/constants";

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
    include: {
      players: { include: { profile: true } },
      events: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!session) return <div>Session not found</div>;

  const initialEvents = session.events.map((e) => ({
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    type: e.type,
    actorId: e.actorId,
    payload: e.payload as Record<string, unknown>,
  }));

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

  const matchId = sessionId.slice(-6).replace(/(.{4})(.{2})/, "$1-$2");

  return (
    <>
      <div className="h-screen flex flex-col text-white overflow-hidden">
        <MatchHeader
          sessionId={sessionId}
          matchId={matchId}
          initialStage={session.stage}
          initialWarTurns={session.warTurns}
          totalPlayers={session.players.length}
          maxWarRounds={MAX_WAR_ROUNDS}
        />

        <div className="flex-1 flex min-h-0">
          <main className="flex-1 relative overflow-hidden">
            <EuropeMap
              countries={countries}
              players={session.players}
              playerInGame={playerInGame}
              sessionId={sessionId}
              stage={stage}
              turnIndex={session.turnIndex}
              pickOrder={session.pickOrder}
            />

            <div className="absolute bottom-4 left-4">
              <StatusBar
                sessionId={sessionId}
                players={session.players}
                initialStage={session.stage}
                initialTurnIndex={session.turnIndex}
                initialPickOrder={session.pickOrder}
              />
            </div>

            <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
              <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-gray-500 font-medium">
                <span>Scroll · Zoom</span>
                <span>Drag · Pan</span>
              </div>
            </div>
          </main>

          <aside className="w-[360px] flex flex-col gap-3 p-4 border-l border-[#1f1f24] bg-[#0a0a0f]/80 overflow-y-auto">
            <ActionPanel
              sessionId={sessionId}
              initialStage={session.stage}
              initialTurnIndex={session.turnIndex}
              initialPickOrder={session.pickOrder}
              initialPickExpiresAt={
                session.pickExpiresAt
                  ? session.pickExpiresAt.toISOString()
                  : null
              }
              initialNextQuestionAt={
                session.nextQuestionAt
                  ? session.nextQuestionAt.toISOString()
                  : null
              }
              initialCapitalExpiresAt={
                session.capitalExpiresAt
                  ? session.capitalExpiresAt.toISOString()
                  : null
              }
              initialWarTurnExpiresAt={
                session.warTurnExpiresAt
                  ? session.warTurnExpiresAt.toISOString()
                  : null
              }
              initialWinnerId={session.winnerId}
              players={session.players}
              playerInGame={playerInGame}
            />

            <PlayerPanel
              sessionId={sessionId}
              initialPlayers={session.players}
              initialCountries={countries}
              initialTurnIndex={session.turnIndex}
              initialStage={session.stage}
              initialPickOrder={session.pickOrder}
              currentPlayerId={playerInGame.id}
            />

            <EventFeed
              sessionId={sessionId}
              initialEvents={initialEvents}
              players={session.players}
            />
          </aside>
        </div>
      </div>
    </>
  );
};

export default Match;
