// Single row of the Full Rankings table. 9-column grid matching the
// header above it: rank · level-hex · player · ELO · win rate (bar) ·
// matches · avg place · streak · 7-day Δ.
//
// `isMe` adds a cyan left-stripe + soft accent background so the
// viewer's own row stands out whether it's inside the top N or pinned
// below the gap.

import Link from "next/link";
import Avatar from "@/app/components/ui/Avatar";
import Hexagon from "@/app/components/ui/Hexagon";
import FlagTag from "@/app/components/ui/FlagTag";
import MicroBar from "@/app/components/ui/MicroBar";

type Props = {
  rank: number;
  isMe?: boolean;
  player: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
    level: number;
    elo: number;
    country: string | null;
    gamesPlayed: number;
    gamesWon: number;
    streakKind: "W" | "L" | null;
    streakLen: number;
    trend7d: number;
  };
};

export default function LeaderboardRow({ rank, isMe, player: p }: Props) {
  const wr =
    p.gamesPlayed > 0
      ? Math.round((p.gamesWon / p.gamesPlayed) * 100)
      : 0;
  const rankColor =
    rank === 1
      ? "var(--color-gold)"
      : rank === 2
        ? "#bdc1c8"
        : rank === 3
          ? "#c08458"
          : "var(--color-mute)";

  const streakLabel =
    p.streakKind && p.streakLen > 0
      ? `${p.streakKind}${p.streakLen}`
      : "—";
  const streakColor =
    p.streakKind === "W"
      ? "var(--color-win)"
      : p.streakKind === "L"
        ? "var(--color-lose)"
        : "var(--color-dim)";

  const trendColor =
    p.trend7d > 0
      ? "var(--color-win)"
      : p.trend7d < 0
        ? "var(--color-lose)"
        : "var(--color-dim)";
  const trendLabel =
    p.trend7d === 0
      ? "—"
      : `${p.trend7d > 0 ? "+" : ""}${p.trend7d}`;

  return (
    <Link
      href={`/profile/${encodeURIComponent(p.nickname)}`}
      className="relative grid items-center gap-2 px-4 py-2 border-t border-stroke first:border-t-0 hover:bg-surface-hi transition-colors"
      style={{
        gridTemplateColumns: "70px 38px 1fr 90px 110px 90px 90px 80px",
        background: isMe ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : undefined,
      }}
    >
      {isMe && (
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: "var(--color-accent)" }}
          aria-hidden
        />
      )}

      <span
        className="font-head text-sm"
        style={{ color: rankColor }}
      >
        #{rank.toLocaleString()}
      </span>

      <Hexagon
        value={p.level}
        size={26}
        variant="outlined"
        color="var(--color-accent)"
        textColor="var(--color-accent)"
      />

      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar
          nickname={p.nickname}
          avatarUrl={p.avatarUrl}
          size={28}
          shape="square"
        />
        <div className="min-w-0 flex flex-col leading-tight">
          <span className="font-head text-xs text-white truncate">
            {p.nickname.toUpperCase()}
            {isMe && (
              <span
                className="font-head text-[9px] ml-2"
                style={{ color: "var(--color-accent)" }}
              >
                YOU
              </span>
            )}
          </span>
          <div className="mt-0.5">
            <FlagTag code={p.country} />
          </div>
        </div>
      </div>

      <span className="font-num text-sm font-bold" style={{ color: "var(--color-accent)" }}>
        {p.elo.toLocaleString()}
      </span>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] text-white">{wr}%</span>
        <MicroBar
          value={wr}
          total={100}
          height={3}
          color="var(--color-accent)"
        />
      </div>

      <span className="font-mono text-[11px] text-mute">
        {p.gamesPlayed.toLocaleString()}
      </span>

      <span
        className="font-head text-[11px]"
        style={{ color: streakColor }}
      >
        {streakLabel}
      </span>

      <span
        className="font-num text-xs font-bold"
        style={{ color: trendColor }}
      >
        {trendLabel}
      </span>
    </Link>
  );
}
