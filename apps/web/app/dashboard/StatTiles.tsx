// Five-up stat tile row. Numbers are real aggregates from MatchSnapshot
// data. Trend chips ("↑ 3% vs S1") are wired with a `trend` prop but
// land empty until we actually track per-season stats.

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
      <Tile label="Matches" value={matches.toLocaleString()} sub="Season 1" />
      <Tile
        label="Win rate"
        value={`${winRate}%`}
        accent="text-emerald-400"
        sub="—"
      />
      <Tile
        label="Capitals"
        value={capitals.toLocaleString()}
        sub={matches > 0 ? `${(capitals / matches).toFixed(1)} / match` : "—"}
      />
      <Tile
        label="Territories"
        value={territories.toLocaleString()}
        sub={
          matches > 0
            ? `${(territories / matches).toFixed(1)} / match`
            : "—"
        }
      />
      <Tile
        label="War win %"
        value={`${warWinPct}%`}
        accent="text-blue-400"
        sub={`${warWins} / ${warTotal}`}
      />
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#0d1117] border border-[#1f2230] rounded-xl px-4 py-4 flex flex-col gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <span className={`text-3xl font-black leading-none ${accent ?? "text-white"}`}>
        {value}
      </span>
      <span className="text-[10px] text-gray-600 uppercase tracking-widest">
        {sub}
      </span>
    </div>
  );
}
