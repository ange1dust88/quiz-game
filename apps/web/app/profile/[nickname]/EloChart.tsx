// ELO-over-time line chart. Server-side render — pure SVG, no client JS
// or charting libs. Each point is one finished match (sourced from the
// EloHistoryEntry table). Axes are min/max within the dataset with a
// little padding so single-match accounts still show a visible line.
//
// We render two layers:
//   1. a faint gray reference line at the starting ELO
//   2. the actual rating curve with circles at every match

type Point = {
  eloAfter: number;
  delta: number;
  createdAt: Date;
  isWinner: boolean;
};

type Props = {
  history: Point[];
  startingElo: number;
};

const W = 720;
const H = 220;
const PAD_X = 36;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export default function EloChart({ history, startingElo }: Props) {
  if (history.length === 0) {
    return (
      <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="text-sm uppercase tracking-widest text-gray-400">
          Rating history
        </h2>
        <p className="text-sm text-gray-500">
          No matches yet — play one to see how your rating moves.
        </p>
      </section>
    );
  }

  // Build the polyline. x is spread evenly across matches, y maps to
  // [minElo, maxElo] window with a small padding so even a 1-point
  // change is visible.
  const elos = history.map((h) => h.eloAfter);
  const rawMin = Math.min(startingElo, ...elos);
  const rawMax = Math.max(startingElo, ...elos);
  const pad = Math.max(20, Math.round((rawMax - rawMin) * 0.15));
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const yRange = Math.max(1, yMax - yMin);

  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const xFor = (idx: number) => {
    if (history.length === 1) return PAD_X + innerW / 2;
    return PAD_X + (idx / (history.length - 1)) * innerW;
  };
  const yFor = (elo: number) => {
    return PAD_TOP + (1 - (elo - yMin) / yRange) * innerH;
  };

  const points = history.map((h, i) => ({
    x: xFor(i),
    y: yFor(h.eloAfter),
    ...h,
  }));
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  // Filled area below the line for a subtle "trend" feel.
  const areaPath =
    points.length > 0
      ? `M ${points[0].x.toFixed(1)} ${(PAD_TOP + innerH).toFixed(1)} ` +
        points
          .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ") +
        ` L ${points[points.length - 1].x.toFixed(1)} ${(PAD_TOP + innerH).toFixed(1)} Z`
      : "";

  const startY = yFor(startingElo);

  const latest = history[history.length - 1];
  const totalDelta = latest.eloAfter - startingElo;

  return (
    <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-gray-400">
          Rating history
        </h2>
        <span className="text-xs text-gray-500">
          {history.length} match{history.length === 1 ? "" : "es"} ·{" "}
          <span
            className={
              totalDelta > 0
                ? "text-emerald-400"
                : totalDelta < 0
                  ? "text-red-400"
                  : "text-gray-400"
            }
          >
            {totalDelta > 0 ? "+" : ""}
            {totalDelta} since start
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto min-w-[480px]"
          role="img"
          aria-label="ELO over time"
        >
          {/* Starting-ELO reference line */}
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={startY}
            y2={startY}
            stroke="#3f3f46"
            strokeDasharray="3 4"
            strokeWidth="1"
          />
          <text
            x={W - PAD_X + 4}
            y={startY + 3}
            fontSize="9"
            fill="#6b7280"
          >
            {startingElo}
          </text>

          {/* Filled area under the curve */}
          {areaPath && (
            <path d={areaPath} fill="rgba(96, 165, 250, 0.12)" stroke="none" />
          )}
          {/* Curve */}
          <path
            d={path}
            stroke="#60a5fa"
            strokeWidth="2"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Match dots */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={p.isWinner ? "#34d399" : "#60a5fa"}
              stroke="#0d0d12"
              strokeWidth="1"
            >
              <title>
                {`${p.eloAfter} ELO (${p.delta >= 0 ? "+" : ""}${p.delta}) — ${p.createdAt.toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" },
                )}${p.isWinner ? " · win" : ""}`}
              </title>
            </circle>
          ))}

          {/* Y-axis labels: min, max, current */}
          <text
            x={PAD_X - 6}
            y={PAD_TOP + 8}
            fontSize="9"
            fill="#6b7280"
            textAnchor="end"
          >
            {yMax}
          </text>
          <text
            x={PAD_X - 6}
            y={PAD_TOP + innerH + 3}
            fontSize="9"
            fill="#6b7280"
            textAnchor="end"
          >
            {yMin}
          </text>

          {/* X-axis date labels: first, middle, last */}
          {[0, Math.floor(points.length / 2), points.length - 1]
            .filter((idx, i, arr) => arr.indexOf(idx) === i)
            .map((idx) => {
              const p = points[idx];
              if (!p) return null;
              return (
                <text
                  key={idx}
                  x={p.x}
                  y={H - 8}
                  fontSize="9"
                  fill="#6b7280"
                  textAnchor="middle"
                >
                  {p.createdAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </text>
              );
            })}
        </svg>
      </div>
    </section>
  );
}
