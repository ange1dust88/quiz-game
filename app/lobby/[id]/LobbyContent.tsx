"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { StartGameButton } from "./StartGameButton";
import { joinGame } from "./actions";
import { useRouter } from "next/navigation";

interface Player {
  id: string;
  profileId: string;
  role: string;
  profile: {
    nickname: string;
  };
}

interface GameSession {
  id: string;
  status: string;
  players: Player[];
}

interface Props {
  sessionId: string;
  initialSession: GameSession;
  currentUser: {
    id: string;
    userId: string;
  };
}

export function LobbyContent({
  sessionId,
  initialSession,
  currentUser,
}: Props) {
  const [session, setSession] = useState(initialSession);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`room-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "PlayerInGame",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        async () => {
          const response = await fetch(`/api/sessions/${sessionId}`);
          const freshSession = await response.json();

          setSession(freshSession);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "GameSession",
          filter: `id=eq.${sessionId}`,
        },
        async (payload) => {
          if (payload.new.status === "active") {
            router.push(`/match/${sessionId}`);
          }
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId]);
  const host = session?.players?.find((p) => p.role === "host");
  const players = session?.players ?? [];
  const me = session?.players?.find((p) => p.profileId === currentUser.id);
  const isHost = me?.role === "host";
  const canStart = players.length >= 1;

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
              {host?.profile?.nickname || "Unknown"}'s lobby
            </h1>
          </div>
          <span className="text-xs bg-[#1a1a1a] px-3 py-1 rounded-lg border border-[#333] text-[#a0a0a0]">
            {session?.status || "waiting"}
          </span>
        </div>

        <div className="bg-[#1a1a1a] p-5 rounded-lg m-4 flex flex-col gap-5">
          <div className="flex justify-between text-sm text-[#9a9a9a]">
            <h2 className="text-lg font-semibold text-white">Players</h2>
            <p>
              Players: <span className="text-white">{players.length}</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {players.length > 0 ? (
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

          {session?.status === "waiting" && isHost && (
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

          {session?.status === "waiting" && !me && (
            <button
              onClick={async () => {
                await joinGame(session.id);
              }}
              className="w-full bg-blue-400 hover:bg-blue-500 border border-blue-300 text-white px-6 py-2 rounded-lg"
            >
              Join Game
            </button>
          )}

          {session?.status === "active" && (
            <div className="bg-green-900/40 border border-green-700 text-green-300 px-4 py-2 rounded-lg text-sm">
              Game already started
            </div>
          )}

          <div className="pt-2 border-t border-[#2a2a2a] flex flex-col items-start">
            <p className="text-[#9a9a9a] mb-1 text-sm">Invite friends</p>
            <div className="flex items-center gap-2 bg-[#242424] px-3 py-2 rounded-lg border border-[#333] w-full">
              <span className="text-sm text-[#ccc]">{sessionId}</span>
              <button
                onClick={() => navigator.clipboard.writeText(sessionId)}
                className="ml-auto text-xs bg-[#2a2a2a] px-2 py-1 rounded hover:bg-[#333]"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
