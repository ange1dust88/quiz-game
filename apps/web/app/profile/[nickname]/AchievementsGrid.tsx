// FACEIT-style achievement card grid. Each card carries a rarity tag
// (common/uncommon/rare/epic/legendary) coloured to the catalogue spec;
// locked cards are dimmed with a dark overlay. Layout is the right-rail
// 2-col grid that sits inside a PanelCard on the profile screen.

import {
  ACHIEVEMENTS,
  type AchievementDef,
  type AchievementRarity,
} from "@quiz/shared/achievements";
import PanelCard from "@/app/components/ui/PanelCard";

type Unlock = { code: string; unlockedAt: Date };

type Props = {
  unlocks: Unlock[];
  // 2 col is the right-rail default; "wide" expands to 4 cols on lg+
  // for the dedicated Achievements tab.
  layout?: "rail" | "wide";
};

const RARITY: Record<
  AchievementRarity,
  { color: string; chipText: string }
> = {
  common: { color: "var(--color-mute)", chipText: "#06141c" },
  uncommon: { color: "var(--color-win)", chipText: "#06141c" },
  rare: { color: "var(--color-blue2)", chipText: "#06141c" },
  epic: { color: "var(--color-purple2)", chipText: "#06141c" },
  legendary: { color: "var(--color-gold)", chipText: "#06141c" },
};

export default function AchievementsGrid({
  unlocks,
  layout = "rail",
}: Props) {
  const byCode = new Map(unlocks.map((u) => [u.code, u.unlockedAt]));
  const earnedCount = unlocks.length;
  const gridCols =
    layout === "wide"
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      : "grid-cols-1 sm:grid-cols-2";
  return (
    <PanelCard
      title={`Achievements · ${earnedCount} / ${ACHIEVEMENTS.length}`}
      accent="#ff6cf3"
    >
      <div className={`grid ${gridCols} gap-2`}>
        {ACHIEVEMENTS.map((a) => (
          <Card key={a.code} a={a} unlockedAt={byCode.get(a.code)} />
        ))}
      </div>
    </PanelCard>
  );
}

function Card({
  a,
  unlockedAt,
}: {
  a: AchievementDef;
  unlockedAt?: Date;
}) {
  const r = RARITY[a.rarity];
  const unlocked = Boolean(unlockedAt);
  return (
    <div
      className="relative overflow-hidden border px-3 py-3 flex flex-col gap-1"
      style={{
        borderColor: unlocked ? r.color : "var(--color-stroke)",
        background: unlocked ? "var(--color-surface)" : "var(--color-panel)",
        opacity: unlocked ? 1 : 0.65,
      }}
    >
      {!unlocked && (
        <div className="absolute inset-0 bg-black/35 pointer-events-none" />
      )}
      <span
        className="absolute top-0 right-0 font-head text-[9px] px-2 py-0.5"
        style={{ background: r.color, color: r.chipText }}
      >
        {a.rarity}
      </span>
      <span
        className="text-2xl"
        style={{ filter: unlocked ? "none" : "grayscale(1)" }}
        aria-hidden
      >
        {a.icon}
      </span>
      <span className="font-head text-xs text-white relative">
        {a.name}
      </span>
      <span className="font-body text-[11px] text-mute leading-snug relative">
        {a.description}
      </span>
      {unlockedAt && (
        <span className="font-mono text-[10px] text-dim mt-1 relative">
          {unlockedAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      )}
    </div>
  );
}
