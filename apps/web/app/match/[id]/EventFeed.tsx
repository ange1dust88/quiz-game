"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { PLAYER_COLORS } from "@/app/lib/constants";
import { parsePgDate, relativeTime } from "@/app/lib/dates";

type Player = {
  id: string;
  profile: { nickname: string };
};

export type MatchEvent = {
  id: string;
  createdAt: string;
  type: string;
  actorId: string | null;
  payload: Record<string, unknown>;
};

type Props = {
  sessionId: string;
  initialEvents: MatchEvent[];
  players: Player[];
};

export default function EventFeed({
  sessionId,
  initialEvents,
  players,
}: Props) {
  const [events, setEvents] = useState<MatchEvent[]>(initialEvents);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`events-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "MatchEvent",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        (payload) => {
          const e = payload.new;
          const created = parsePgDate(e.createdAt);
          if (!created) return;
          setEvents((prev) => [
            {
              id: e.id,
              createdAt: created,
              type: e.type,
              actorId: e.actorId ?? null,
              payload: (e.payload ?? {}) as Record<string, unknown>,
            },
            ...prev,
          ]);
        },
      )
      .subscribe();
    return () => void channel.unsubscribe();
  }, [sessionId]);

  // Tick every 5s so relative timestamps stay fresh.
  // Init in effect so SSR and first client render match (both render no timestamp).
  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  const playerColor = (id: string | null) => {
    if (!id) return "#666";
    const idx = players.findIndex((p) => p.id === id);
    return idx >= 0 ? PLAYER_COLORS[idx % PLAYER_COLORS.length] : "#666";
  };

  const playerName = (id: string | null) => {
    if (!id) return "Someone";
    return players.find((p) => p.id === id)?.profile.nickname ?? "?";
  };

  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-4 flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-gray-500">
        <span>Recent · Live</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      </div>

      <div className="flex flex-col gap-1.5 overflow-y-auto">
        {events.length === 0 ? (
          <div className="text-xs text-gray-500 italic">
            Events will appear here once the match begins.
          </div>
        ) : (
          events.map((e) => (
            <EventRow
              key={e.id}
              event={e}
              now={now}
              color={playerColor(e.actorId)}
              actorName={playerName(e.actorId)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EventRow({
  event,
  now,
  color,
  actorName,
}: {
  event: MatchEvent;
  now: number | null;
  color: string;
  actorName: string;
}) {
  const text = describeEvent(event, actorName);
  const ago =
    now !== null
      ? relativeTime(now - new Date(event.createdAt).getTime())
      : "";
  return (
    <div className="flex items-center gap-2 text-xs py-1">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 text-gray-300 truncate">{text}</span>
      <span className="text-gray-600 font-mono shrink-0">{ago}</span>
    </div>
  );
}

function describeEvent(e: MatchEvent, actor: string): string {
  const country = (e.payload.country as string | undefined) ?? "";
  const auto = e.payload.auto === true;
  switch (e.type) {
    case "capital":
      return auto
        ? `${actor} got ${country} as capital (auto)`
        : `${actor} claimed ${country} as capital`;
    case "territory":
      return auto
        ? `${actor} got ${country} (auto)`
        : `${actor} took ${country}`;
    case "round":
      return e.payload.noAnswers
        ? `${actor} got the round (no answers)`
        : `${actor} had the closest answer`;
    default:
      return `${actor} · ${e.type}`;
  }
}

