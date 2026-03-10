"use server";

import { prisma } from "@/app/lib/prisma";
import { StartGameButton } from "./StartGameButton";
import { cookies } from "next/headers";
import { decrypt } from "@/app/lib/session";
import { joinGame } from "./actions";
import { JoinGameButton } from "./JoinGameButton";
import CopyMatchId from "./CopyMatchId";

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

  const sessionHost = players.find((p) => p.role === "host");

  const canStart = playersCount >= 2;

  const me = players.find((p) => p.profileId === profile.id);
  const isHost = me?.role === "host";

  return (
    <div
      className="flex justify-center items-center min-h-screen bg-cover bg-center text-white"
      style={{ backgroundImage: "url('/gradient.png')" }}
    >
      <div className="bg-black/90 backdrop-blur rounded-xl p-2 w-120 shadow-xl border border-[#2a2a2a]">
        <div className="flex gap-4 items-center p-4 justify-between border-b border-[#2a2a2a]">
          <div className="flex gap-3 items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 448 512"
              className="w-6 h-6 text-[#757575]"
              fill="currentColor"
            >
              <path d="M224 248a120 120 0 1 0 0-240 120 120 0 1 0 0 240zm-29.7 56C95.8 304 16 383.8 16 482.3 16 498.7 29.3 512 45.7 512l356.6 0c16.4 0 29.7-13.3 29.7-29.7 0-98.5-79.8-178.3-178.3-178.3l-59.4 0z" />
            </svg>

            <h1 className="text-xl font-bold">
              {sessionHost?.profile.nickname}'s lobby
            </h1>
          </div>

          <span className="text-xs bg-[#1a1a1a] px-3 py-1 rounded-lg border border-[#333] text-[#a0a0a0]">
            {session.status}
          </span>
        </div>
        <div className="bg-[#1a1a1a] p-5 rounded-lg m-4 flex flex-col gap-5">
          <div className="flex justify-between text-sm text-[#9a9a9a]">
            <h2 className="text-lg font-semibold text-white">Players</h2>
            <p>
              Players: <span className="text-white">{playersCount}</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {playersCount > 0 ? (
              <div className="flex flex-col gap-2">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between items-center bg-[#242424] px-4 py-2 rounded-lg border border-[#333]"
                  >
                    <span className="flex items-center gap-2">
                      {p.profile?.nickname || "No name"}

                      {p.role === "host" && (
                        <span className="text-yellow-400 text-sm">👑</span>
                      )}
                    </span>

                    <span className="text-xs text-[#8a8a8a]">
                      {p.role === "host" ? "Host" : "Player"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[#888]">No players connected</p>
            )}
          </div>

          {session.status === "waiting" && isHost && (
            <>
              {canStart ? (
                <StartGameButton sessionId={session.id} />
              ) : (
                <div className="flex items-center gap-4">
                  <StartGameButton sessionId={session.id} disabled={true} />
                  <p className="text-red-400 text-sm">
                    Need at least 2 players
                  </p>
                </div>
              )}
            </>
          )}

          {session.status === "waiting" && !me && (
            <JoinGameButton sessionId={session.id} joinAction={joinGame} />
          )}

          {session.status === "active" && (
            <div className="bg-green-900/40 border border-green-700 text-green-300 px-4 py-2 rounded-lg text-sm">
              Game already started
            </div>
          )}

          <div className="pt-2 border-t border-[#2a2a2a] flex flex-col items-start">
            <p className="text-[#9a9a9a] mb-1 text-sm">Invite friends</p>
            <CopyMatchId id={session.id} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LobbyPage;
