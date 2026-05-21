// Hero card. Left half: ONLINE pill + huge "CONQUER THE MAP" + skewed
// PLAY NOW button that creates a fresh lobby (default 4 seats; host
// starts when at least 2 players have joined). Right half: rank
// panel — level hex, ELO, XP bar, 3 mini stats.

import { createRoom } from "./actions";
import Hexagon from "@/app/components/ui/Hexagon";
import Slash from "@/app/components/ui/Slash";
import MicroBar from "@/app/components/ui/MicroBar";
import JoinByCodeForm from "./JoinByCodeForm";

type Props = {
  onlineCount: number;
  level: number;
  elo: number;
  experience: number;
  xpForNext: number;
  rank: number;
  streakKind: "W" | "L" | null;
  streakLen: number;
  warAccuracyPct: number;
};

export default function HeroPlay({
  onlineCount,
  level,
  elo,
  experience,
  xpForNext,
  rank,
  streakKind,
  streakLen,
  warAccuracyPct,
}: Props) {
  return (
    <section className="relative grid grid-cols-1 lg:grid-cols-[1fr_360px] border border-stroke overflow-hidden bg-gradient-to-br from-surface-hi via-surface to-surface min-h-[280px]">
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            "radial-gradient(circle at 75% 50%, rgba(30,211,255,0.20), transparent 55%)",
        }}
      />

      <div className="relative p-6 sm:p-7 flex flex-col gap-5 z-10">
        <Slash
          label={`● Online · ${onlineCount.toLocaleString()} players`}
          color="#1ed3ff"
        />

        <h1 className="font-head text-5xl sm:text-6xl font-extrabold leading-[0.9] tracking-tight text-white">
          CONQUER
          <br />
          THE MAP
        </h1>

        <p className="font-body text-xs text-mute max-w-sm leading-relaxed">
          Create a lobby — invite friends or share the link.
        </p>

        <div className="mt-auto flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5">
          <form action={createRoom}>
            <button
              type="submit"
              className="font-head text-lg font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-9 py-4"
              style={{ transform: "skewX(-10deg)" }}
            >
              <span className="inline-block" style={{ transform: "skewX(10deg)" }}>
                ► Play now
              </span>
            </button>
          </form>
          <JoinByCodeForm />
        </div>
      </div>

      <div className="relative p-6 flex flex-col gap-4 bg-black/25 border-t lg:border-t-0 lg:border-l border-stroke z-10">
        <div className="flex items-center justify-between">
          <span className="font-head text-[10px] text-mute">Your rank</span>
        </div>

        <div className="flex items-center gap-4">
          <Hexagon
            value={level}
            size={64}
            color="#1ed3ff"
            textColor="#ffffff"
          />
          <div className="flex flex-col leading-tight">
            <span className="font-head text-3xl font-extrabold text-white">
              LEVEL {level}
            </span>
            <span className="font-mono text-xs text-accent font-bold mt-1">
              {elo.toLocaleString()} ELO
            </span>
          </div>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-mute mb-1.5">
            <span>to Level {level + 1}</span>
            <span className="text-white">
              {experience} / {xpForNext} XP
            </span>
          </div>
          <MicroBar
            value={experience}
            total={xpForNext}
            height={6}
            color="#1ed3ff"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-1">
          <MiniStat label="Rank" value={`#${rank}`} />
          <MiniStat
            label="Streak"
            value={
              streakKind && streakLen > 0
                ? `${streakKind}${streakLen}`
                : "—"
            }
            color={
              streakKind === "W"
                ? "var(--color-win)"
                : streakKind === "L"
                  ? "var(--color-lose)"
                  : undefined
            }
          />
          <MiniStat label="War acc" value={`${warAccuracyPct}%`} />
        </div>
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-canvas border border-stroke px-2.5 py-2 flex flex-col gap-0.5">
      <span className="font-head text-[9px] text-mute">{label}</span>
      <span
        className="font-mono text-sm font-bold leading-none mt-0.5"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
