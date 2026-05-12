"use client";

// Sidebar list of players + their current land/point totals. Highlights
// the player whose turn it is and "you".

import {
  useActivePlayerId,
  useCountries,
  usePlayers,
} from "@/app/lib/gameStore";
import { PLAYER_COLORS } from "@/app/lib/constants";

type Props = { myPlayerId: string };

export default function PlayerPanel({ myPlayerId }: Props) {
  const players = usePlayers();
  const countries = useCountries();
  const activeId = useActivePlayerId();

  // Per-player aggregates from countries.
  const stats = new Map<string, { lands: number; points: number; capHp: number | null; capMax: number | null }>();
  players.forEach((p) =>
    stats.set(p.id, { lands: 0, points: 0, capHp: null, capMax: null }),
  );
  for (const c of countries) {
    if (!c.ownerId) continue;
    const s = stats.get(c.ownerId);
    if (!s) continue;
    s.lands += 1;
    s.points += c.points;
    if (c.isCapital) {
      s.capHp = c.armies;
      s.capMax = c.maxArmies;
    }
  }
  const totalPoints = countries.reduce((acc, c) => acc + c.points, 0);

  return (
    <div className="bg-[#14141a] border border-[#1f1f24] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-gray-500">
        <span>Players</span>
        <span>{players.length}</span>
      </div>
      <div className="flex flex-col gap-1">
        {players.map((p) => {
          const isYou = p.id === myPlayerId;
          const isActive = p.id === activeId;
          const color = PLAYER_COLORS[p.turnOrder % PLAYER_COLORS.length];
          const s = stats.get(p.id) ?? { lands: 0, points: 0, capHp: null, capMax: null };
          const share = totalPoints > 0 ? Math.round((s.points / totalPoints) * 100) : 0;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                isActive ? "border-emerald-400/40 bg-emerald-400/5" : "border-transparent"
              }`}
            >
              <div
                className="w-9 h-9 rounded-md flex items-center justify-center text-sm font-bold shrink-0 text-black"
                style={{ backgroundColor: color }}
              >
                {p.nickname.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold truncate">
                    {p.nickname}
                  </span>
                  {isYou && (
                    <span className="text-[10px] text-gray-500">you</span>
                  )}
                  {!p.connected && (
                    <span className="text-[10px] text-amber-400">offline</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {s.points.toLocaleString()} pts · {s.lands} lands
                  {s.capHp !== null && (
                    <span className="ml-1 text-amber-300">
                      ★{s.capHp}/{s.capMax}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-16 h-1 bg-[#1f1f24] rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(share, 4)}%`, backgroundColor: color }}
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
