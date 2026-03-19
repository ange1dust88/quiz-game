"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";

type Props = {
  sessionId: string;
  initialStage: string;
};

const PHASE_MESSAGES: Record<string, { title: string; description: string }> = {
  capitals: {
    title: "Game Started!",
    description: "Select your capital city.",
  },
  expand: {
    title: "Capitals Selected!",
    description:
      "Expand phase is starting. Answer questions to claim territories.",
  },
  war: {
    title: "All Territories Claimed!",
    description: "War phase is starting. Fight for dominance!",
  },
};

export default function PhaseModal({ sessionId, initialStage }: Props) {
  const [message, setMessage] = useState<{
    title: string;
    description: string;
  } | null>(PHASE_MESSAGES[initialStage] ?? null);
  const currentStageRef = useRef(initialStage);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`phase-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "GameSession",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const newStage = payload.new.stage;
          if (
            newStage &&
            newStage !== currentStageRef.current &&
            PHASE_MESSAGES[newStage]
          ) {
            setMessage(PHASE_MESSAGES[newStage]);
            currentStageRef.current = newStage;
          }
        },
      )
      .subscribe();

    return () => void channel.unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timeout);
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 pointer-events-none">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-white text-4xl font-bold">{message.title}</h1>
        <p className="text-gray-300 text-xl">{message.description}</p>
      </div>
    </div>
  );
}
