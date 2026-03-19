"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";

type Props = {
  sessionId: string;
  initialTurnIndex: number;
  initialStage: string;
  initialPickOrder: string[];
  players: any[];
  playerInGame: any;
};

export default function TurnIndicator({
  sessionId,
  initialTurnIndex,
  initialStage,
  initialPickOrder,
  players,
  playerInGame,
}: Props) {
  const [turnIndex, setTurnIndex] = useState(initialTurnIndex);
  const [stage, setStage] = useState(initialStage);
  const [pickOrder, setPickOrder] = useState(initialPickOrder ?? []);
  const [pickTimer, setPickTimer] = useState<number | null>(null);

  useEffect(() => {
    if (stage === "expand" && pickOrder.length > 0) {
      setPickTimer(15);
    } else {
      setPickTimer(null);
    }
  }, [pickOrder]);

  useEffect(() => {
    if (pickTimer === null) return;

    const interval = setInterval(() => {
      setPickTimer((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [pickTimer !== null]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`turn-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "GameSession",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.new.turnIndex !== undefined) {
            setTurnIndex(payload.new.turnIndex);
          }
          if (payload.new.stage) {
            setStage(payload.new.stage);
          }
          if (payload.new.pickOrder !== undefined) {
            setPickOrder(payload.new.pickOrder ?? []);
          }
        },
      )
      .subscribe();

    return () => void channel.unsubscribe();
  }, [sessionId]);
  const activePlayerId =
    stage === "expand" && (pickOrder ?? []).length > 0
      ? pickOrder[0]
      : players[turnIndex]?.id;
  const activePlayer = players.find((p) => p.id === activePlayerId);
  const isMyTurn = playerInGame.id === activePlayerId;

  const pickCounts = (pickOrder ?? []).reduce(
    (acc, id) => {
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex gap-6 items-center">
      <p className="text-sm text-gray-400">
        Stage: <span className="text-white font-semibold">{stage}</span>
      </p>
      <p className="text-sm text-gray-400">
        Turn:
        <span className="text-white font-semibold ml-1">
          {activePlayer?.profile?.nickname}
        </span>
      </p>
      {isMyTurn && (
        <span className="text-green-400 text-sm font-semibold">Your turn</span>
      )}

      {stage === "expand" && pickOrder.length > 0 && (
        <div className="flex gap-2 items-center border-l border-[#4f4f4f] pl-6">
          <span className="text-gray-400 text-sm">Picks:</span>
          {Object.entries(pickCounts).map(([id, count]) => {
            const player = players.find((p) => p.id === id);
            return (
              <span key={id} className="text-sm bg-[#2a2a2a] px-2 py-1 rounded">
                <span className="text-white">{player?.profile?.nickname}</span>
                <span className="text-green-400 ml-1">×{count}</span>
              </span>
            );
          })}

          {pickTimer !== null && (
            <span
              className={`text-sm font-bold ml-2 ${pickTimer <= 3 ? "text-red-500" : "text-yellow-400"}`}
            >
              {pickTimer}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}
