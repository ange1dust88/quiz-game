"use server";

import { prisma } from "@/app/lib/prisma";
import { StartGameButton } from "./StartGameButton";
import { cookies } from "next/headers";
import { decrypt } from "@/app/lib/session";
import { joinGame } from "./actions";
import { JoinGameButton } from "./JoinGameButton";

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
        include: { profile: true },
      },
    },
  });

  if (!session) {
    return <div>No room found</div>;
  }

  const players = session.players ?? [];
  const playersCount = players.length;

  const canStart = playersCount >= 1;

  const me = players.find((p) => p.profileId === profile.id);
  const isHost = me?.role === "host";

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Lobby</h1>

      <p>
        <strong>Match ID:</strong> {session.id}
      </p>
      <p>
        <strong>Status:</strong> {session.status}
      </p>

      <div>
        <h2 className="text-xl font-semibold">Players:</h2>

        {playersCount > 0 ? (
          <ul className="list-disc pl-5">
            {players.map((p) => (
              <li key={p.id}>
                {p.profile?.nickname || "Без ника"}{" "}
                <span className="text-gray-500">
                  ({p.role === "host" ? "Host" : "Player"})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No players connected</p>
        )}
      </div>

      {session.status === "waiting" && isHost && (
        <>
          {!canStart && (
            <p className="text-red-500">Need at least 2 players to start</p>
          )}

          {canStart && <StartGameButton sessionId={session.id} />}
        </>
      )}
      {session.status === "waiting" && !me && (
        <JoinGameButton sessionId={session.id} joinAction={joinGame} />
      )}

      {session.status === "active" && <p>Game already started!</p>}
    </div>
  );
};

export default LobbyPage;
