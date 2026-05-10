"use client";

// Phase 2 smoke screen — connects to Colyseus and prints whatever state
// the server sends. Lives at /match-test; the real /match/[id] flow is
// untouched until the new gameplay UI is fully ported.

import { useEffect } from "react";
import {
  useGameStore,
  useRoomStatus,
  useStage,
  useTurnIndex,
  usePlayerCount,
} from "@/app/lib/gameStore";

export default function MatchTestPage() {
  const status = useRoomStatus();
  const stage = useStage();
  const turnIndex = useTurnIndex();
  const playerCount = usePlayerCount();

  const lastPong = useGameStore((s) => s.lastPong);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const connect = useGameStore((s) => s.connect);
  const disconnect = useGameStore((s) => s.disconnect);
  const sendPing = useGameStore((s) => s.sendPing);

  useEffect(() => {
    connect("test-session", undefined);
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <div className="min-h-screen text-white p-8 font-mono">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <header className="border-b border-[#4f4f4f] pb-4">
          <h1 className="text-2xl font-bold">Phase 2 — Colyseus connection test</h1>
          <p className="text-xs text-gray-500 mt-1">
            Connects to ws://localhost:2567 and renders live game state.
          </p>
        </header>

        <section className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-widest text-gray-400">
            Status
          </span>
          <span
            className={`text-sm font-bold ${
              status === "connected"
                ? "text-emerald-400"
                : status === "error"
                  ? "text-red-400"
                  : status === "connecting"
                    ? "text-amber-400"
                    : "text-gray-500"
            }`}
          >
            {status.toUpperCase()}
          </span>
          {errorMessage && (
            <span className="text-xs text-red-300 ml-2">{errorMessage}</span>
          )}
        </section>

        <section className="bg-[#1a1a1a] border border-[#4f4f4f] rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
          <Row label="stage" value={stage} />
          <Row label="turnIndex" value={String(turnIndex)} />
          <Row label="players" value={String(playerCount)} />
          <Row label="status" value={status} />
        </section>

        <section className="flex flex-col gap-3">
          <button
            onClick={sendPing}
            disabled={status !== "connected"}
            className="bg-blue-400 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white px-4 py-2 rounded-lg text-sm font-medium w-fit"
          >
            Send ping
          </button>
          {lastPong && (
            <pre className="text-xs bg-[#0d0d12] border border-[#4f4f4f] rounded-md p-3 overflow-x-auto">
              {JSON.stringify(lastPong, null, 2)}
            </pre>
          )}
        </section>

        <p className="text-xs text-gray-500 leading-relaxed border-t border-[#4f4f4f]/40 pt-4">
          If <span className="text-emerald-400">CONNECTED</span> shows up,
          the WebSocket → Zustand → React pipeline works. State here is
          empty for now (server doesn&apos;t mutate it yet) — that&apos;s
          Phase 3.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <span className="text-white">{value || "—"}</span>
    </div>
  );
}
