// 3-up stat row sitting between the hero and match history. Kept
// deliberately lean — deep per-phase stats live on the profile page.
// War accuracy shows here (and only here — the hero's mini stats carry
// Rank + Streak, so no metric appears twice on the dashboard).

import StatBlock from "@/app/components/ui/StatBlock";

type Props = {
  matches: number;
  winRate: number;
  warAccuracyPct: number;
  warTotal: number;
  warWins: number;
};

export default function StatTiles({
  matches,
  winRate,
  warAccuracyPct,
  warTotal,
  warWins,
}: Props) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatBlock label="Matches" value={matches.toLocaleString()} />
      <StatBlock
        label="Win rate"
        value={`${winRate}%`}
        accent="var(--color-win)"
      />
      <StatBlock
        label="War accuracy"
        value={`${warAccuracyPct}%`}
        accent="var(--color-accent)"
        sub={warTotal > 0 ? `${warWins} / ${warTotal} answers` : "—"}
      />
    </section>
  );
}
