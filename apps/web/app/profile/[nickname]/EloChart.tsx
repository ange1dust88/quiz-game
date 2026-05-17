// ELO progression chart. Cyan line + gradient fill + gold marker at the
// peak ELO + label on the current value. Three "summary" tiles on the
// right (net change / best result / worst result) match the FACEIT
// "30 matches" widget.
//
// Pure server-side render (SVG, no client JS).

import PanelCard from "@/app/components/ui/PanelCard";
import PillTab from "@/app/components/ui/PillTab";

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

const W = 620;
const H = 200;
const PAD_X = 8;
const PAD_TOP = 24;
const PAD_BOTTOM = 16;

export default function EloChart({ history, startingElo }: Props) {
  if (history.length === 0) {
    return (
      <PanelCard title="ELO progression · last 30 matches" accent="#1ed3ff">
        <p className="font-body text-sm text-dim py-6 text-center">
          No matches yet — play one to see how your rating moves.
        </p>
      </PanelCard>
    );
  }

  const last30 = history.slice(-30);
  const elos = last30.map((h) => h.eloAfter);
  const rawMin = Math.min(startingElo, ...elos);
  const rawMax = Math.max(startingElo, ...elos);
  const pad = Math.max(30, Math.round((rawMax - rawMin) * 0.15));
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const yRange = Math.max(1, yMax - yMin);

  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const stepX =
    last30.length === 1 ? 0 : innerW / (last30.length - 1);

  const points = last30.map((h, i) => ({
    x: PAD_X + (last30.length === 1 ? innerW / 2 : i * stepX),
    y: PAD_TOP + (1 - (h.eloAfter - yMin) / yRange) * innerH,
    ...h,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaD =
    `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${H} L ${points[0].x.toFixed(1)} ${H} Z`;

  const peakIdx = elos.indexOf(Math.max(...elos));
  const peak = points[peakIdx];
  const last = points[points.length - 1];
  const totalDelta = last.eloAfter - startingElo;
  const best = last30.reduce(
    (acc, h) => (h.delta > acc ? h.delta : acc),
    -Infinity,
  );
  const worst = last30.reduce(
    (acc, h) => (h.delta < acc ? h.delta : acc),
    Infinity,
  );

  return (
    <PanelCard
      title={`ELO progression · last ${last30.length} matches`}
      accent="#1ed3ff"
      right={
        <div className="flex">
          <PillTab label="30D" active />
          <PillTab label="Season" dim />
          <PillTab label="All time" dim />
        </div>
      }
    >
      <div className="flex gap-6 items-start flex-wrap">
        <div className="flex-1 min-w-[320px]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            role="img"
            aria-label="ELO over last 30 matches"
          >
            <defs>
              <linearGradient id="eloFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1ed3ff" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#1ed3ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((p) => (
              <line
                key={p}
                x1="0"
                x2={W}
                y1={H * p + 4}
                y2={H * p + 4}
                stroke="#262f3d"
                strokeDasharray="2 4"
                strokeWidth="1"
              />
            ))}
            <path d={areaD} fill="url(#eloFill)" />
            <path
              d={pathD}
              stroke="#1ed3ff"
              strokeWidth="2"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* peak marker */}
            <g transform={`translate(${peak.x.toFixed(1)},${peak.y.toFixed(1)})`}>
              <circle r="4" fill="#ffc24a" stroke="#0d1218" strokeWidth="2" />
              <text
                y="-10"
                textAnchor="middle"
                fontSize="10"
                fontFamily="var(--font-num)"
                fill="#ffc24a"
                fontWeight="700"
              >
                PEAK {peak.eloAfter}
              </text>
            </g>
            {/* current */}
            <circle
              cx={last.x}
              cy={last.y}
              r="5"
              fill="#1ed3ff"
              stroke="#0d1218"
              strokeWidth="2"
            />
            <text
              x={last.x - 8}
              y={last.y - 10}
              textAnchor="end"
              fontSize="11"
              fontFamily="var(--font-num)"
              fill="#ffffff"
              fontWeight="700"
            >
              {last.eloAfter}
            </text>
          </svg>
        </div>

        <div className="flex flex-col gap-3 w-[140px] pt-2">
          <SideStat
            label="Net change"
            value={`${totalDelta >= 0 ? "+" : ""}${totalDelta}`}
            color={
              totalDelta > 0
                ? "var(--color-win)"
                : totalDelta < 0
                  ? "var(--color-lose)"
                  : undefined
            }
          />
          <SideStat
            label="Best result"
            value={`${best >= 0 ? "+" : ""}${best}`}
          />
          <SideStat
            label="Worst result"
            value={String(worst)}
            color="var(--color-lose)"
          />
        </div>
      </div>
    </PanelCard>
  );
}

function SideStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="font-head text-[9px] text-mute">{label}</span>
      <span
        className="font-mono text-xl font-bold mt-0.5"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
