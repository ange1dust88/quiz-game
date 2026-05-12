"use client";

// Top-level client component for the new Colyseus-backed match flow.
// Connects on mount, renders three panels: map, action panel, players.

import { useEffect } from "react";
import Link from "next/link";
import {
  useCountries,
  useGameStore,
  usePlayers,
  useRoomStatus,
  useStage,
  useWinnerId,
} from "@/app/lib/gameStore";
import { PLAYER_COLORS } from "@/app/lib/constants";
import Spinner from "@/app/components/ui/Spinner";
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
      <div className="min-h-screen text-white flex flex-col items-center justify-center gap-4">
        <Spinner />
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
    return <EndScreen sessionId={sessionId} myPlayerId={myPlayerId} />;
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

// --- Game over screen ---------------------------------------------------

function EndScreen({
  sessionId,
  myPlayerId,
}: {
  sessionId: string;
  myPlayerId: string;
}) {
  const winnerId = useWinnerId();
  const players = usePlayers();
  const countries = useCountries();

  const winner = players.find((p) => p.id === winnerId);
  const winnerColor = winner
    ? PLAYER_COLORS[winner.turnOrder % PLAYER_COLORS.length]
    : null;
  const isMe = winnerId === myPlayerId;

  // Per-player aggregates so the screen shows the actual final standings.
  const lands = new Map<string, number>();
  const points = new Map<string, number>();
  for (const c of countries) {
    if (!c.ownerId) continue;
    lands.set(c.ownerId, (lands.get(c.ownerId) ?? 0) + 1);
    points.set(c.ownerId, (points.get(c.ownerId) ?? 0) + c.points);
  }
  const ranked = [...players].sort(
    (a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0),
  );
  const totalPoints = countries.reduce((s, c) => s + c.points, 0);

  return (
    <div className="min-h-screen text-white flex items-center justify-center px-6 py-10">
      <div className="max-w-lg w-full flex flex-col gap-6">
        <section className="bg-[#14141a] border border-emerald-400/40 rounded-2xl p-8 flex flex-col items-center text-center gap-3">
          <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
            Game over
          </div>
          {winner ? (
            <>
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-black"
                style={{ backgroundColor: winnerColor ?? "#666" }}
              >
                {winner.nickname.charAt(0).toUpperCase()}
              </div>
              <h1 className="text-3xl font-bold leading-tight">
                {isMe ? `You win, ${winner.nickname}!` : `${winner.nickname} wins`}
              </h1>
              <p className="text-sm text-gray-400">
                {(points.get(winner.id) ?? 0).toLocaleString()} points ·{" "}
                {lands.get(winner.id) ?? 0} territories
              </p>
            </>
          ) : (
            <h1 className="text-3xl font-bold leading-tight">Match ended</h1>
          )}
        </section>

        <section className="bg-[#14141a] border border-[#1f1f24] rounded-2xl p-6 flex flex-col gap-3">
          <div className="text-xs uppercase tracking-widest text-gray-500">
            Final standings
          </div>
          {ranked.map((p, idx) => {
            const pts = points.get(p.id) ?? 0;
            const ld = lands.get(p.id) ?? 0;
            const share =
              totalPoints > 0 ? Math.round((pts / totalPoints) * 100) : 0;
            const color = PLAYER_COLORS[p.turnOrder % PLAYER_COLORS.length];
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                  p.id === winnerId
                    ? "border border-emerald-400/40 bg-emerald-400/5"
                    : "bg-[#1a1a20]"
                }`}
              >
                <span className="text-xs text-gray-500 font-mono w-5 text-center">
                  #{idx + 1}
                </span>
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center text-sm font-bold shrink-0 text-black"
                  style={{ backgroundColor: color }}
                >
                  {p.nickname.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold truncate">
                      {p.nickname}
                    </span>
                    {p.id === myPlayerId && (
                      <span className="text-[10px] text-gray-500">you</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {pts.toLocaleString()} pts · {ld} lands · {share}%
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <div className="flex justify-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm bg-blue-400 hover:bg-blue-500 transition-colors text-white px-5 py-2 rounded-lg"
          >
            Dashboard
          </Link>
          <Link
            href={`/lobby/${sessionId}`}
            className="text-sm border border-[#4f4f4f] bg-[#1a1a1a] hover:bg-[#292929] transition-colors px-5 py-2 rounded-lg"
          >
            See full results
          </Link>
        </div>
      </div>
    </div>
  );
}
