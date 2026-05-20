"use client";

// ELO progression chart. Cyan line + gradient fill + gold marker at the
// peak ELO + label on the current value. Three "summary" tiles on the
// right (net change / best result / worst result) plus a period
// toggle: 7D, month, all-time.
//
// When the current ELO equals the peak, we skip the "current" label
// and dot — they sit on top of the peak ones and look like overlapped
// junk. Peak alone communicates both.

import { useMemo, useState } from "react";
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

type Range = "7d" | "month" | "all";

const RANGES: { key: Range; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "month", label: "Month" },
  { key: "all", label: "All time" },
];

const W = 620;
const H = 200;
const PAD_X = 8;
const PAD_TOP = 24;
const PAD_BOTTOM = 22;

export default function EloChart({ history, startingElo }: Props) {
  const [range, setRange] = useState<Range>("month");

  const filtered = useMemo(() => filterByRange(history, range), [history, range]);

  if (history.length === 0) {
    return (
      <PanelCard title="ELO progression" accent="#1ed3ff">
        <p className="font-body text-sm text-dim py-6 text-center">
          No matches yet — play one to see how your rating moves.
        </p>
      </PanelCard>
    );
  }

  // Starting ELO for the visible window: walk back from the first
  // entry's `eloAfter - delta`. If the window is empty (no matches in
  // the period), fall back to overall starting elo so the chart still
  // renders something sensible.
  const windowStartingElo =
    filtered.length > 0
      ? filtered[0].eloAfter - filtered[0].delta
      : startingElo;

  return (
    <PanelCard
      title={`ELO progression · ${rangeSubtitle(range, filtered.length)}`}
      accent="#1ed3ff"
      right={
        <div className="flex">
          {RANGES.map((r) => (
            <PillTab
              key={r.key}
              label={r.label}
              active={r.key === range}
              onClick={() => setRange(r.key)}
            />
          ))}
        </div>
      }
    >
      {filtered.length === 0 ? (
        <p className="font-body text-sm text-dim py-6 text-center">
          No matches in this period.
        </p>
      ) : (
        <ChartBody
          points={filtered}
          windowStartingElo={windowStartingElo}
          range={range}
        />
      )}
    </PanelCard>
  );
}

function ChartBody({
  points: history,
  windowStartingElo,
  range,
}: {
  points: Point[];
  windowStartingElo: number;
  range: Range;
}) {
  const elos = history.map((h) => h.eloAfter);
  const rawMin = Math.min(windowStartingElo, ...elos);
  const rawMax = Math.max(windowStartingElo, ...elos);
  const pad = Math.max(30, Math.round((rawMax - rawMin) * 0.15));
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const yRange = Math.max(1, yMax - yMin);

  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  // Index-based X axis — each match gets equal spacing on the chart.
  // We tried a time-axis previously, but with bursts of matches all
  // played within the same hour the line collapsed into near-vertical
  // segments and the area-fill looked broken. The date scale is still
  // surfaced via the tick labels at the bottom (they show the date of
  // the match sitting on that x position).
  const stepX = history.length === 1 ? 0 : innerW / (history.length - 1);
  const points = history.map((h, i) => ({
    x: PAD_X + (history.length === 1 ? innerW / 2 : i * stepX),
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
  // When the current rating IS the peak, the two labels (gold "PEAK
  // 1133" and white "1133") sit on top of each other and read as
  // garbled overlap. Hide the current marker in that case — peak alone
  // tells the user both stories.
  const currentIsPeak = peakIdx === points.length - 1;
  const totalDelta = last.eloAfter - windowStartingElo;
  const best = history.reduce(
    (acc, h) => (h.delta > acc ? h.delta : acc),
    -Infinity,
  );
  const worst = history.reduce(
    (acc, h) => (h.delta < acc ? h.delta : acc),
    Infinity,
  );

  return (
    <div className="flex gap-6 items-start flex-wrap">
      <div className="flex-1 min-w-[320px]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label="ELO progression"
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
          {/* Date tick marks tied to specific match positions. We
              sample up to 5 evenly-spaced match indices and label
              each with the date of THAT match. The player can read
              "matches between Apr 19 and May 19" at a glance. */}
          {sampleMatchTicks(points, range).map((t) => (
            <g key={t.idx}>
              <line
                x1={t.x}
                x2={t.x}
                y1={H - PAD_BOTTOM - 2}
                y2={H - PAD_BOTTOM + 1}
                stroke="#262f3d"
                strokeWidth="1"
              />
              <text
                x={t.x}
                y={H - 2}
                fontSize="9"
                fontFamily="var(--font-num)"
                fill="#8a93a1"
                textAnchor={t.align}
              >
                {t.label}
              </text>
            </g>
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
          {/* current — only when distinct from peak */}
          {!currentIsPeak && (
            <>
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
            </>
          )}
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

function filterByRange(history: Point[], range: Range): Point[] {
  if (range === "all") return history;
  const days = range === "7d" ? 7 : 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return history.filter((p) => new Date(p.createdAt).getTime() >= cutoff);
}

type MatchTick = {
  idx: number;
  x: number;
  label: string;
  align: "start" | "middle" | "end";
};

type ChartPoint = {
  x: number;
  y: number;
  eloAfter: number;
  delta: number;
  createdAt: Date;
  isWinner: boolean;
};

// Up to 5 ticks at evenly-spaced match indices. Each tick's label is
// the date of THE match at that index, so the X axis tells the player
// when matches happened even though spacing itself is by index.
function sampleMatchTicks(points: ChartPoint[], range: Range): MatchTick[] {
  if (points.length === 0) return [];
  const TARGET = Math.min(5, points.length);
  const out: MatchTick[] = [];
  for (let i = 0; i < TARGET; i++) {
    const frac = TARGET === 1 ? 0.5 : i / (TARGET - 1);
    const idx = Math.round(frac * (points.length - 1));
    const p = points[idx];
    out.push({
      idx,
      x: p.x,
      label: formatTick(new Date(p.createdAt), range),
      align:
        i === 0 ? "start" : i === TARGET - 1 ? "end" : "middle",
    });
  }
  return out;
}

function formatTick(d: Date, _range: Range): string {
  // Always show day-level "May 19". The old all-time branch used
  // {month, year:"2-digit"} which produced "May 26" — visually
  // identical to "May 26" (day 26) and confusing. If the all-time
  // span ever crosses years we can add an explicit year ("May 19 '24")
  // — for now day-level is unambiguous in our typical timeframes.
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function rangeSubtitle(range: Range, count: number): string {
  if (range === "all") {
    return `all time · ${count} match${count === 1 ? "" : "es"}`;
  }
  const label = range === "7d" ? "last 7 days" : "last 30 days";
  return `${label} · ${count} match${count === 1 ? "" : "es"}`;
}
