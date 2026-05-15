// GitHub-style contribution grid. 53 columns × 7 rows (Sun → Sat), each
// cell is one day. Colour intensity scales with how many matches the
// profile participated in that day. Hover for an exact tooltip. Pure
// server-side render — no client JS, no extra DB calls beyond the
// `dates` array we get from the profile page.

type Props = { dates: Date[] };

const COLOR_BY_BUCKET = [
  "bg-[#1f1f24]", // 0
  "bg-emerald-900/80", // 1
  "bg-emerald-700/80", // 2
  "bg-emerald-500/90", // 3-4
  "bg-emerald-400", // 5+
];

function bucketFor(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ActivityHeatmap({ dates }: Props) {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = isoDay(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Anchor: the Sunday 52 weeks before today's column. We display 53
  // columns total — the right-most one is the current (partial) week.
  const start = new Date(today);
  start.setDate(today.getDate() - 52 * 7 - today.getDay());

  type Cell = { date: Date; count: number; inFuture: boolean };
  const columns: Cell[][] = [];
  for (let col = 0; col < 53; col++) {
    const week: Cell[] = [];
    for (let row = 0; row < 7; row++) {
      const date = new Date(start);
      date.setDate(start.getDate() + col * 7 + row);
      const inFuture = date > today;
      const count = counts.get(isoDay(date)) ?? 0;
      week.push({ date, count, inFuture });
    }
    columns.push(week);
  }

  const total = dates.length;

  return (
    <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-gray-400">
          Activity
        </h2>
        <span className="text-xs text-gray-500">
          {total.toLocaleString()} match{total === 1 ? "" : "es"} in the
          last year
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-[3px] min-w-fit">
          {columns.map((week, ci) => (
            <div key={ci} className="flex flex-col gap-[3px]">
              {week.map((cell, ri) => (
                <div
                  key={ri}
                  title={
                    cell.inFuture
                      ? ""
                      : `${cell.count} match${
                          cell.count === 1 ? "" : "es"
                        } on ${cell.date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}`
                  }
                  className={`w-2.5 h-2.5 rounded-[2px] ${
                    cell.inFuture
                      ? "bg-transparent"
                      : COLOR_BY_BUCKET[bucketFor(cell.count)]
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-500 self-end">
        <span>Less</span>
        {COLOR_BY_BUCKET.map((c, i) => (
          <span key={i} className={`w-2.5 h-2.5 rounded-[2px] ${c}`} />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}
