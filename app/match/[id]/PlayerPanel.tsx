"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/client";
import { PLAYER_COLORS } from "@/app/lib/constants";

type Player = {
  id: string;
  profile: {
    id: string;
    nickname: string;
  };
};

type Country = {
  id: string;
  ownerId: string | null;
  isCapital: boolean;
  armies: number;
  points: number;
  template: { id: number; name: string };
};

type Props = {
  sessionId: string;
  initialPlayers: Player[];
  initialCountries: Country[];
  initialTurnIndex: number;
  initialStage: string;
  initialPickOrder: string[];
  currentPlayerId: string;
};

export default function PlayerPanel({
  sessionId,
  initialPlayers,
  initialCountries,
  initialTurnIndex,
  initialStage,
  initialPickOrder,
  currentPlayerId,
}: Props) {
  const [countries, setCountries] = useState(initialCountries);
  const [turnIndex, setTurnIndex] = useState(initialTurnIndex);
  const [stage, setStage] = useState(initialStage);
  const [pickOrder, setPickOrder] = useState(initialPickOrder);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`players-game-${sessionId}`)
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
          if (payload.new.stage) setStage(payload.new.stage);
          if (payload.new.pickOrder !== undefined) {
            setPickOrder(payload.new.pickOrder ?? []);
          }
        },
      )
      .subscribe();
    return () => void channel.unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`players-countries-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "MatchCountry",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        (payload) => {
          setCountries((prev) =>
            prev.map((c) =>
              c.id === payload.new.id ? { ...c, ...payload.new } : c,
            ),
          );
        },
      )
      .subscribe();
    return () => void channel.unsubscribe();
  }, [sessionId]);

  let activePlayerId: string | null = null;
  if (stage === "capitals") {
    activePlayerId = initialPlayers[turnIndex]?.id ?? null;
  } else if (stage === "expand" && pickOrder.length > 0) {
    activePlayerId = pickOrder[0] ?? null;
  } else if (stage === "war") {
    activePlayerId = initialPlayers[turnIndex]?.id ?? null;
  }

  const totalPoints = countries.reduce((s, c) => s + (c.points ?? 0), 0);

  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-500">
          <span>Players</span>
          <span className="text-gray-400">{initialPlayers.length}</span>
        </div>
        <span className="text-xs text-gray-500">↑ pts</span>
      </div>

      <div className="flex flex-col gap-1">
        {initialPlayers.map((p, idx) => {
          const isYou = p.id === currentPlayerId;
          const isActive = p.id === activePlayerId;
          const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
          const owned = countries.filter((c) => c.ownerId === p.id);
          const lands = owned.length;
          const points = owned.reduce((s, c) => s + (c.points ?? 0), 0);
          const capital = owned.find((c) => c.isCapital);
          const code = capital
            ? capital.template.name.slice(0, 2).toUpperCase()
            : p.profile.nickname.slice(0, 2).toUpperCase();
          const initial = p.profile.nickname.charAt(0).toUpperCase();
          const progress =
            totalPoints > 0
              ? Math.round((points / totalPoints) * 100)
              : 0;

          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                isActive
                  ? "border-emerald-400/40 bg-emerald-400/5"
                  : "border-transparent"
              }`}
            >
              <div
                className="w-9 h-9 rounded-md flex items-center justify-center text-sm font-bold shrink-0 text-black"
                style={{ backgroundColor: color }}
              >
                {initial}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <Link
                    href={`/profile/${encodeURIComponent(p.profile.nickname)}`}
                    target="_blank"
                    className="text-sm font-semibold truncate hover:text-blue-400 hover:underline transition-colors"
                  >
                    {p.profile.nickname}
                  </Link>
                  {isYou && (
                    <span className="text-[10px] text-gray-500">you</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <span>
                    {code} · {points.toLocaleString()} pts · {lands}{" "}
                    {lands === 1 ? "land" : "lands"}
                  </span>
                  {capital && <CapitalHp hp={capital.armies} />}
                </div>
              </div>

              <div className="w-16 h-1 bg-[#1f1f24] rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(progress, 4)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>

              {isActive && (
                <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold shrink-0">
                  Turn
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MAX_CAPITAL_HP = 3;

function CapitalHp({ hp }: { hp: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`Capital HP: ${hp}/${MAX_CAPITAL_HP}`}
    >
      {Array.from({ length: MAX_CAPITAL_HP }).map((_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i < hp ? "bg-amber-400" : "bg-[#2a2a32]"
          }`}
        />
      ))}
    </span>
  );
}
