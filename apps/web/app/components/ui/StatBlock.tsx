// Single labeled stat tile. 5 of these sit in a row on the dashboard
// between the hero card and match history. The `accent` prop colours
// the big number (use for "Win Rate" green, "War Win %" cyan, etc.).

type Props = {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
};

export default function StatBlock({ label, value, sub, accent }: Props) {
  return (
    <div className="border border-stroke bg-surface px-4 py-3 flex flex-col gap-1">
      <span className="font-head text-[10px] text-mute">{label}</span>
      <span
        className="font-head text-3xl font-extrabold leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
      {sub && (
        <span className="font-mono text-[10px] text-dim mt-0.5">{sub}</span>
      )}
    </div>
  );
}
