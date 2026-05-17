"use client";

// Sidebar list of players + their current land/point totals. Highlights
// the player whose turn it is and "you". FACEIT-style: sharp bordered
// panel with cyan title strip, sharp player rows with coloured seat
// stripe, capital HP as filled amber pips.

import {
  useActivePlayerId,
  useCountries,
  usePlayers,
} from "@/app/lib/gameStore";
import { PLAYER_COLORS } from "@/app/lib/constants";
import Avatar from "@/app/components/ui/Avatar";
import PanelCard from "@/app/components/ui/PanelCard";

type Props = { myPlayerId: string };

export default function PlayerPanel({ myPlayerId }: Props) {
  const players = usePlayers();
  const countries = useCountries();
  const activeId = useActivePlayerId();

  const stats = new Map<
    string,
    { lands: number; points: number; capHp: number | null; capMax: number | null }
  >();
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
    <PanelCard
      title={`Players · ${players.length}`}
      accent="#1ed3ff"
      padded={false}
    >
      <div className="flex flex-col">
        {players.map((p) => {
          const isYou = p.id === myPlayerId;
          const isActive = p.id === activeId;
          const color = PLAYER_COLORS[p.turnOrder % PLAYER_COLORS.length];
          const s =
            stats.get(p.id) ?? {
              lands: 0,
              points: 0,
              capHp: null,
              capMax: null,
            };
          const share =
            totalPoints > 0 ? Math.round((s.points / totalPoints) * 100) : 0;
          return (
            <div
              key={p.id}
              className="relative flex items-center gap-3 px-3 py-2 border-t border-stroke first:border-t-0 transition-colors"
              style={{
                background: isActive
                  ? `color-mix(in srgb, ${color} 12%, transparent)`
                  : undefined,
              }}
            >
              <span
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ background: color }}
                aria-hidden
              />
              <Avatar
                nickname={p.nickname}
                avatarUrl={p.avatarUrl}
                size={36}
                shape="square"
                color={color}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-head text-xs text-white truncate">
                    {p.nickname.toUpperCase()}
                  </span>
                  {isYou && (
                    <span className="font-head text-[9px] text-accent">YOU</span>
                  )}
                  {p.abandoned ? (
                    <span className="font-head text-[9px] text-lose">LEFT</span>
                  ) : (
                    !p.connected && (
                      <span className="font-head text-[9px] text-gold">
                        OFFLINE
                      </span>
                    )
                  )}
                </div>
                <div className="font-mono text-[10px] text-dim flex items-center gap-2 mt-0.5">
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
                    className="font-head text-[9px]"
                    style={{ color }}
                  >
                    TURN
                  </span>
                )}
                <div className="w-14 h-1 bg-panel overflow-hidden">
                  <div
                    className="h-full transition-all"
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
    </PanelCard>
  );
}

// Capital HP as filled/empty pips — easier to parse at a glance than
// "★3/3" text, especially during a war round.
function CapitalHearts({ hp, max }: { hp: number; max: number }) {
  const pips = [];
  for (let i = 0; i < max; i++) {
    pips.push(
      <span
        key={i}
        className="inline-block w-2 h-2"
        style={{
          background: i < hp ? "var(--color-gold)" : "color-mix(in srgb, var(--color-gold) 20%, transparent)",
        }}
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
