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
          const rowStyle = isActive
            ? {
                borderColor: color,
                backgroundColor: `${color}1c`,
                boxShadow: `0 0 0 1px ${color}33`,
              }
            : { borderColor: "transparent" };
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border-2 transition-all"
              style={rowStyle}
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
                  {p.abandoned ? (
                    <span className="text-[10px] text-red-400 uppercase tracking-widest">
                      left
                    </span>
                  ) : (
                    !p.connected && (
                      <span className="text-[10px] text-amber-400">
                        offline
                      </span>
                    )
                  )}
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <span>
                    {s.points.toLocaleString()} pts · {s.lands} lands
                  </span>
                  {s.capHp !== null && s.capMax !== null && (
                    <CapitalHearts hp={s.capHp} max={s.capMax} />
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {isActive && (
                  <span
                    className="text-[10px] uppercase tracking-widest font-semibold"
                    style={{ color }}
                  >
                    Turn
                  </span>
                )}
                <div className="w-16 h-1 bg-[#1f1f24] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(share, 4)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Capital HP as filled/empty hearts — easier to parse at a glance than
// "★3/3" text, especially when you only have a quarter-second of side-eye
// while reading the question.
function CapitalHearts({ hp, max }: { hp: number; max: number }) {
  const pips = [];
  for (let i = 0; i < max; i++) {
    pips.push(
      <span
        key={i}
        className={`inline-block w-2 h-2 rounded-full ${
          i < hp ? "bg-amber-300" : "bg-amber-300/20"
        }`}
      />,
    );
  }
  return (
    <span
      title={`Capital ${hp}/${max} HP`}
      className="inline-flex items-center gap-0.5"
    >
      {pips}
    </span>
  );
}
