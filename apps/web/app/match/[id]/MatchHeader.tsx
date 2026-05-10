"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import Link from "next/link";
import { isMuted, setMuted } from "@/app/lib/sounds";

type Props = {
  sessionId: string;
  matchId: string;
  initialStage: string;
  initialWarTurns: number;
  totalPlayers: number;
  maxWarRounds: number;
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
  initialWarTurns,
  totalPlayers,
  maxWarRounds,
}: Props) {
  const [stage, setStage] = useState(initialStage);
  const [warTurns, setWarTurns] = useState(initialWarTurns);
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

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
          if (payload.new.warTurns !== undefined) {
            setWarTurns(payload.new.warTurns);
          }
        },
      )
      .subscribe();
    return () => void channel.unsubscribe();
  }, [sessionId]);

  const warRound =
    totalPlayers > 0
      ? Math.min(maxWarRounds, Math.floor(warTurns / totalPlayers) + 1)
      : 1;

  let subtitle = "Match";
  if (stage === "war") {
    subtitle = `Match · Round ${warRound} / ${maxWarRounds}`;
  } else if (stage === "ended") {
    subtitle = "Match · Ended";
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[#1f1f24] bg-[#0a0a0f]/80 backdrop-blur">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 via-yellow-300 to-teal-400 shrink-0" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">EuropeQuiz</div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              {subtitle}
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
        <button
          onClick={toggleMute}
          className="text-gray-400 hover:text-white transition-colors"
          title={muted ? "Unmute sounds" : "Mute sounds"}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <SpeakerOff /> : <SpeakerOn />}
        </button>
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

function SpeakerOn() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function SpeakerOff() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}
