"use server";

import { prisma } from "@/app/lib/prisma";
import { cookies } from "next/headers";
import { decrypt } from "@/app/lib/session";
import { claimCapital } from "./actions";
import { claimTerritory } from "./actions"; // нужно реализовать для expand

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
    orderBy: { templateId: "asc" },
  });
  if (!countries.length) return <div>Map not initialized</div>;

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

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-2">Match: {sessionId}</h1>
      <p className="mb-4">
        Stage: <strong>{stage.toUpperCase()}</strong>
      </p>
      <p className="mb-4">
        Turn: <strong>{activePlayer.profile.nickname}</strong>
        {isMyTurn ? " (Your turn!)" : ""}
      </p>

      <div className="grid grid-cols-4 gap-4">
        {countries.map((c) => (
          <div
            key={c.id}
            className="p-3 border rounded text-center bg-gray-300"
          >
            <div className="font-semibold">{c.template.name}</div>
            <div className="text-sm text-gray-700">
              {c.owner ? (
                <>
                  {c.owner.profile.nickname} (
                  {c.owner.role === "host" ? "Host" : "Player"})
                </>
              ) : (
                "Unclaimed"
              )}
            </div>
            {c.isCapital && (
              <div className="text-xs text-red-500 font-semibold">Capital</div>
            )}

            {!c.owner && isMyTurn && (
              <form
                action={playerHasCapital ? claimTerritory : claimCapital}
                className="mt-2"
              >
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="playerId" value={playerInGame.id} />
                <input type="hidden" name="countryId" value={c.templateId} />
                <button className="px-2 py-1 bg-blue-500 text-white rounded text-sm">
                  {playerHasCapital ? "Claim Territory" : "Place Capital"}
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Match;
