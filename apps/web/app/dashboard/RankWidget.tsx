// Player rank panel. Big hexagonal level badge + ELO + XP progress to
// next level + three mini stats (rank, streak, K/D). Right column of
// the hero row on the dashboard.

import Hexagon from "@/app/components/ui/Hexagon";

type Props = {
  level: number;
  elo: number;
  experience: number;
  xpForNext: number;
  rank: number;
  streakKind: "W" | "L" | null;
  streakLen: number;
  kd: number;
};

export default function RankWidget({
  level,
  elo,
  experience,
  xpForNext,
  rank,
  streakKind,
  streakLen,
  kd,
}: Props) {
  const xpPct = Math.min(
    100,
    Math.round((experience / Math.max(1, xpForNext)) * 100),
  );

  return (
    <section className="relative rounded-2xl border border-[#1f2230] bg-[#0d1117] p-6 flex flex-col gap-4 min-h-[260px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-gray-500">
          Your rank · Season 1
        </span>
        <span className="text-[10px] uppercase tracking-widest text-gray-600">
          EU
        </span>
      </div>

      <div className="flex items-center gap-4">
        <Hexagon
          value={level}
          size={64}
          color="#fbbf24"
          textColor="#0a0d14"
        />
        <div className="flex flex-col leading-tight">
          <span className="text-3xl font-black tracking-tight">
            LEVEL {level}
          </span>
          <span className="text-sm font-mono text-blue-400">
            {elo.toLocaleString()} ELO
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-[10px] uppercase tracking-widest text-gray-500">
          <span>to Level {level + 1}</span>
          <span>
            {experience} / {xpForNext} XP
          </span>
        </div>
        <div className="h-1.5 bg-[#1f2230] rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500"
            style={{ width: `${xpPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-auto">
        <MiniStat label="Rank" value={`#${rank}`} />
        <MiniStat
          label="Streak"
          value={
            streakKind && streakLen > 0
              ? `${streakKind}${streakLen}`
              : "—"
          }
          accent={streakKind === "W" ? "text-emerald-400" : streakKind === "L" ? "text-red-400" : undefined}
        />
        <MiniStat label="K/D" value={kd.toFixed(2)} />
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#0a0d14] border border-[#1f2230] rounded-md px-3 py-2 flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <span
        className={`text-base font-bold font-mono ${accent ?? "text-white"}`}
      >
        {value}
      </span>
    </div>
  );
}
