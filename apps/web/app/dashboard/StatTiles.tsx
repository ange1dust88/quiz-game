// 5-up stat row sitting between the hero and match history. Uses the
// shared StatBlock primitive — colour-coded for the two "headline"
// stats (Win Rate green, War Win % cyan).

import StatBlock from "@/app/components/ui/StatBlock";

type Props = {
  matches: number;
  winRate: number;
  capitals: number;
  territories: number;
  warWinPct: number;
  warTotal: number;
  warWins: number;
};

export default function StatTiles({
  matches,
  winRate,
  capitals,
  territories,
  warWinPct,
  warTotal,
  warWins,
}: Props) {
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatBlock label="Matches" value={matches.toLocaleString()} sub="Season 1" />
      <StatBlock
        label="Win rate"
        value={`${winRate}%`}
        accent="var(--color-win)"
        sub="—"
      />
      <StatBlock
        label="Capitals"
        value={capitals.toLocaleString()}
        sub={matches > 0 ? `${(capitals / matches).toFixed(1)} / match` : "—"}
      />
      <StatBlock
        label="Territories"
        value={territories.toLocaleString()}
        sub={
          matches > 0
            ? `${(territories / matches).toFixed(1)} / match`
            : "—"
        }
      />
      <StatBlock
        label="War win %"
        value={`${warWinPct}%`}
        accent="var(--color-accent)"
        sub={`${warWins} / ${warTotal}`}
      />
    </section>
  );
}
