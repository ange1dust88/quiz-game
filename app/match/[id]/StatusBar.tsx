"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";

type Player = { id: string; profile: { nickname: string } };

type Props = {
  sessionId: string;
  players: Player[];
  initialStage: string;
  initialTurnIndex: number;
  initialPickOrder: string[];
};

export default function StatusBar({
  sessionId,
  players,
  initialStage,
  initialTurnIndex,
  initialPickOrder,
}: Props) {
  const [stage, setStage] = useState(initialStage);
  const [turnIndex, setTurnIndex] = useState(initialTurnIndex);
  const [pickOrder, setPickOrder] = useState(initialPickOrder);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`status-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "GameSession",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.new.stage) setStage(payload.new.stage);
          if (payload.new.turnIndex !== undefined) {
            setTurnIndex(payload.new.turnIndex);
          }
          if (payload.new.pickOrder !== undefined) {
            setPickOrder(payload.new.pickOrder ?? []);
          }
        },
      )
      .subscribe();
    return () => void channel.unsubscribe();
  }, [sessionId]);

  let active: Player | undefined;
  let action: string | null = null;

  if (stage === "capitals") {
    active = players[turnIndex];
    action = "is picking a capital";
  } else if (stage === "expand" && pickOrder.length > 0) {
    active = players.find((p) => p.id === pickOrder[0]);
    action = "is picking a territory";
  } else if (stage === "expand") {
    action = "Question phase";
  } else if (stage === "war") {
    active = players[turnIndex];
    action = "is attacking";
  }

  if (!action) return null;

  return (
    <div className="bg-[#14141a]/95 backdrop-blur border border-[#1f1f24] rounded-full pl-3 pr-4 py-2 flex items-center gap-2 text-sm shadow-xl">
      <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
        Now
      </span>
      <span className="text-white">
        {active ? `${active.profile.nickname} ${action}` : action}
      </span>
    </div>
  );
}
