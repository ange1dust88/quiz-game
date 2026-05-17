// Skinny progress bar used in daily missions, XP, ratings — anywhere
// we need a single thin coloured stripe of progress without a
// surrounding box.

type Props = {
  value: number;
  total: number;
  height?: number;
  color?: string;
};

export default function MicroBar({
  value,
  total,
  height = 4,
  color = "#1ed3ff",
}: Props) {
  const pct = Math.min(100, Math.round((value / Math.max(1, total)) * 100));
  return (
    <div className="bg-panel overflow-hidden w-full" style={{ height }}>
      <div
        className="h-full transition-[width]"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
