"use client";

// Top-level client component for the new Colyseus-backed match flow.
// Connects on mount, renders three panels: map, action panel, players.

import { useEffect } from "react";
import Link from "next/link";
import {
  useGameStore,
  useRoomStatus,
  useStage,
  useWinnerId,
} from "@/app/lib/gameStore";
import MapPanel from "./MapPanel";
import ActionPanel from "./ActionPanel";
import PlayerPanel from "./PlayerPanel";

type Props = { sessionId: string; jwt: string; myPlayerId: string };

export default function MatchClient({ sessionId, jwt, myPlayerId }: Props) {
  const status = useRoomStatus();
  const errorMessage = useGameStore((s) => s.errorMessage);
  const stage = useStage();
  const winnerId = useWinnerId();
  const connect = useGameStore((s) => s.connect);
  const disconnect = useGameStore((s) => s.disconnect);

  useEffect(() => {
    connect(sessionId, jwt);
    return () => disconnect();
  }, [connect, disconnect, sessionId, jwt]);

  if (status === "connecting" || status === "idle") {
    return (
      <div className="min-h-screen text-white flex items-center justify-center">
        <span className="text-sm text-gray-400">Connecting to game…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center flex flex-col gap-4">
          <h1 className="text-xl font-bold">Couldn&apos;t join match</h1>
          <p className="text-sm text-red-300">{errorMessage}</p>
          <Link
            href="/dashboard"
            className="text-sm bg-blue-400 hover:bg-blue-500 transition-colors text-white px-4 py-2 rounded-lg w-fit mx-auto"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (stage === "ended") {
    return (
      <div className="min-h-screen text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-[10px] uppercase tracking-widest text-emerald-400">
          Game over
        </div>
        <h1 className="text-3xl font-bold">
          {winnerId === myPlayerId ? "You win!" : "Match ended"}
        </h1>
        <Link
          href={`/lobby/${sessionId}`}
          className="text-sm bg-blue-400 hover:bg-blue-500 transition-colors text-white px-5 py-2 rounded-lg"
        >
          See results
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col text-white overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#1f1f24] bg-[#0a0a0f]/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 via-yellow-300 to-teal-400 shrink-0" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">EuropeQuiz</div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              Match · {stage}
            </div>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          Leave
        </Link>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 relative overflow-hidden bg-[#0a0a0f]">
          <MapPanel myPlayerId={myPlayerId} />
        </main>
        <aside className="w-[360px] flex flex-col gap-3 p-4 border-l border-[#1f1f24] bg-[#0a0a0f]/80 overflow-y-auto">
          <ActionPanel myPlayerId={myPlayerId} />
          <PlayerPanel myPlayerId={myPlayerId} />
        </aside>
      </div>
    </div>
  );
}
