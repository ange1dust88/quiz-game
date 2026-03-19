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
  const [pickOrder, setPickOrder] = useState(initialPickOrder);

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
            setPickOrder(payload.new.pickOrder);
          }
        },
      )
      .subscribe();

    return () => void channel.unsubscribe();
  }, [sessionId]);
  const activePlayerId =
    stage === "expand" && pickOrder.length > 0
      ? pickOrder[0]
      : players[turnIndex]?.id;
  const activePlayer = players.find((p) => p.id === activePlayerId);
  const isMyTurn = playerInGame.id === activePlayerId;
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
