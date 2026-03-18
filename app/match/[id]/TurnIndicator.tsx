"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";

type Props = {
  sessionId: string;
  initialTurnIndex: number;
  initialStage: string;
  players: any[];
  playerInGame: any;
};

export default function TurnIndicator({
  sessionId,
  initialTurnIndex,
  initialStage,
  players,
  playerInGame,
}: Props) {
  const [turnIndex, setTurnIndex] = useState(initialTurnIndex);
  const [stage, setStage] = useState(initialStage);

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
        },
      )
      .subscribe();

    return () => channel.unsubscribe();
  }, [sessionId]);

  const activePlayer = players[turnIndex];
  const isMyTurn = playerInGame.id === activePlayer?.id;

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
    </div>
  );
}
