"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import Link from "next/link";

type Props = {
  sessionId: string;
  matchId: string;
  initialStage: string;
};

const STAGES = ["capitals", "expand", "war"] as const;
const LABELS: Record<string, string> = {
  capitals: "Capitals",
  expand: "Expand",
  war: "War",
};

export default function MatchHeader({
  sessionId,
  matchId,
  initialStage,
}: Props) {
  const [stage, setStage] = useState(initialStage);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`header-${sessionId}`)
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
        },
      )
      .subscribe();
    return () => void channel.unsubscribe();
  }, [sessionId]);

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[#1f1f24] bg-[#0a0a0f]/80 backdrop-blur">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 via-yellow-300 to-teal-400 shrink-0" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">EuropeQuiz</div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              Match · Round 1
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-[#14141a] border border-[#1f1f24] rounded-full p-1">
          {STAGES.map((s) => {
            const active = s === stage;
            return (
              <span
                key={s}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full transition-colors ${
                  active
                    ? "bg-[#1f1f24] text-white"
                    : "text-gray-500"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    active ? "bg-emerald-400" : "bg-gray-700"
                  }`}
                />
                {LABELS[s]}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-5 text-xs">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-widest text-gray-500">Match</span>
          <span className="font-mono text-gray-300">{matchId}</span>
        </div>
        <Link
          href="/dashboard"
          className="text-gray-400 hover:text-white transition-colors"
        >
          Leave
        </Link>
      </div>
    </header>
  );
}
