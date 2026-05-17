// Podium card for the top 3 players. Medal-coloured top border, huge
// faded rank number behind the content, avatar + level hex + nickname,
// flag + ELO in medal colour, matches/wr/streak line. The three sizes
// (lg/md/sm) give the podium its stair-step silhouette.

import Link from "next/link";
import Avatar from "@/app/components/ui/Avatar";
import Hexagon from "@/app/components/ui/Hexagon";
import FlagTag from "@/app/components/ui/FlagTag";

type Props = {
  rank: 1 | 2 | 3;
  size: "lg" | "md" | "sm";
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
  };
};

const MEDAL: Record<1 | 2 | 3, string> = {
  1: "var(--color-gold)",
  2: "#bdc1c8",
  3: "#c08458",
};

const MIN_HEIGHT: Record<"lg" | "md" | "sm", number> = {
  lg: 240,
  md: 210,
  sm: 190,
};

export default function PodiumCard({ rank, size, isMe, player: p }: Props) {
  const accent = MEDAL[rank];
  const wr =
    p.gamesPlayed > 0
      ? Math.round((p.gamesWon / p.gamesPlayed) * 100)
      : 0;
  const streak = p.streakKind && p.streakLen > 0
    ? `${p.streakKind}${p.streakLen}`
    : "—";
  const streakColor = p.streakKind === "W"
    ? "var(--color-win)"
    : p.streakKind === "L"
      ? "var(--color-lose)"
      : "var(--color-dim)";

  return (
    <Link
      href={`/profile/${encodeURIComponent(p.nickname)}`}
      className="relative overflow-hidden border bg-surface px-4 pt-5 pb-4 flex flex-col justify-between hover:bg-surface-hi transition-colors"
      style={{
        borderColor: "var(--color-stroke)",
        borderTop: `3px solid ${accent}`,
        minHeight: MIN_HEIGHT[size],
      }}
    >
      <span
        className="absolute top-1 right-2 font-head leading-none select-none pointer-events-none"
        style={{
          fontSize: size === "lg" ? 120 : size === "md" ? 100 : 88,
          color: accent,
          opacity: 0.07,
        }}
        aria-hidden
      >
        {rank}
      </span>

      <div className="relative flex items-start justify-between gap-2">
        <Hexagon
          value={p.level}
          size={size === "lg" ? 34 : 30}
          variant="outlined"
          color="var(--color-accent)"
          textColor="var(--color-accent)"
        />
        {isMe && (
          <span
            className="font-head text-[9px] px-1.5 py-0.5"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-accent-fg)",
            }}
          >
            you
          </span>
        )}
      </div>

      <div className="relative flex flex-col items-center gap-2 -mt-2">
        <Avatar
          nickname={p.nickname}
          avatarUrl={p.avatarUrl}
          size={size === "lg" ? 72 : size === "md" ? 64 : 56}
          shape="square"
        />
        <div className="text-center min-w-0 w-full">
          <div
            className="font-head text-white truncate"
            style={{ fontSize: size === "lg" ? 18 : 16 }}
          >
            {p.nickname.toUpperCase()}
          </div>
          <div className="mt-0.5 flex justify-center">
            <FlagTag code={p.country} />
          </div>
        </div>
      </div>

      <div className="relative flex flex-col items-center gap-1">
        <div
          className="font-num font-bold leading-none"
          style={{
            color: accent,
            fontSize: size === "lg" ? 32 : 28,
          }}
        >
          {p.elo.toLocaleString()}
        </div>
        <div className="font-mono text-[10px] text-dim flex items-center gap-1.5">
          <span>{p.gamesPlayed.toLocaleString()}m</span>
          <span className="text-stroke">·</span>
          <span>{wr}% wr</span>
          <span className="text-stroke">·</span>
          <span style={{ color: streakColor }}>{streak}</span>
        </div>
      </div>
    </Link>
  );
}
