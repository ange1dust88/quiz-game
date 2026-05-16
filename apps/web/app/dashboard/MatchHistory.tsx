// Full match history table. Tabs (RECENT / RANKED / TOURNAMENTS /
// REPLAYS) are visual-only — only RECENT has data backing today,
// the other three render the same list with a "no data yet" hint
// once we wire ranked / tournament modes.
//
// Each row derives the viewer's place + ELO delta + capital / territory
// counts from MatchSnapshot.finalState; the W/L badge comes from
// winnerId === my PlayerInGame.id.

import Link from "next/link";
import { prisma } from "@quiz/db";

type Props = { profileId: string };

type SnapshotPlayer = {
  id: string;
  profileId: string;
  nickname: string;
};
type SnapshotCountry = {
  ownerId: string | null;
  isCapital: boolean;
  points: number;
};

type Row = {
  sessionId: string;
  createdAt: Date;
  durationMs: number;
  modeLabel: string;
  totalPlayers: number;
  rank: number;
  isWin: boolean;
  eloDelta: number | null;
  capitalsHeld: number;
  warWins: number;
  warLosses: number;
};

function buildRow(
  s: {
    sessionId: string;
    winnerId: string | null;
    duration: number;
    finalState: unknown;
    telemetry: unknown;
    createdAt: Date;
  },
  eloByCreatedAt: Map<string, number>,
  profileId: string,
): Row | null {
  const fs = s.finalState as
    | { players?: SnapshotPlayer[]; countries?: SnapshotCountry[] }
    | null;
  if (!fs?.players || !fs.countries) return null;
  const me = fs.players.find((p) => p.profileId === profileId);
  if (!me) return null;

  const points = new Map<string, number>();
  let capitalsHeld = 0;
  for (const c of fs.countries) {
    if (!c.ownerId) continue;
    points.set(c.ownerId, (points.get(c.ownerId) ?? 0) + c.points);
    if (c.ownerId === me.id && c.isCapital) capitalsHeld += 1;
  }
  const ranked = [...fs.players].sort(
    (a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0),
  );
  const rank = ranked.findIndex((p) => p.id === me.id) + 1;

  const tel = s.telemetry as
    | {
        warAnswers?: { playerId: string; isCorrect: boolean }[];
      }
    | null;
  let warWins = 0;
  let warLosses = 0;
  for (const a of tel?.warAnswers ?? []) {
    if (a.playerId !== me.id) continue;
    if (a.isCorrect) warWins += 1;
    else warLosses += 1;
  }

  // Look up ELO delta by matching createdAt timestamp (snapshots and
  // EloHistoryEntry rows are written in the same tick at game_over).
  const isoKey = s.createdAt.toISOString().slice(0, 19);
  const eloDelta = eloByCreatedAt.get(isoKey) ?? null;

  return {
    sessionId: s.sessionId,
    createdAt: s.createdAt,
    durationMs: s.duration,
    modeLabel: `Classic ${fs.players.length}P`,
    totalPlayers: fs.players.length,
    rank: rank > 0 ? rank : fs.players.length,
    isWin: s.winnerId === me.id,
    eloDelta,
    capitalsHeld,
    warWins,
    warLosses,
  };
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeDate(d: Date): string {
  const diff = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return `${Math.max(1, Math.floor(diff / (60 * 60 * 1000)))}h ago`;
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function MatchHistory({ profileId }: Props) {
  const [snapshots, eloHistory] = await Promise.all([
    prisma.matchSnapshot.findMany({
      where: { session: { players: { some: { profileId } } } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        sessionId: true,
        winnerId: true,
        duration: true,
        finalState: true,
        telemetry: true,
        createdAt: true,
      },
    }),
    prisma.eloHistoryEntry.findMany({
      where: { profileId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { delta: true, createdAt: true },
    }),
  ]);
  const eloByCreatedAt = new Map<string, number>();
  for (const e of eloHistory) {
    eloByCreatedAt.set(e.createdAt.toISOString().slice(0, 19), e.delta);
  }
  const rows = snapshots
    .map((s) => buildRow(s, eloByCreatedAt, profileId))
    .filter((r): r is Row => r !== null);

  return (
    <section className="rounded-2xl border border-[#1f2230] bg-[#0d1117]">
      <header className="flex items-center justify-between px-5 py-3 border-b border-[#1f2230]">
        <h2 className="text-xs uppercase tracking-widest font-bold">
          Match history
        </h2>
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest">
          <Tab label="Recent" active />
          <Tab label="Ranked" />
          <Tab label="Tournaments" />
          <Tab label="Replays" />
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 px-5 py-8 text-center">
          No matches yet — hit Play now to start.
        </p>
      ) : (
        <div>
          {rows.map((r) => (
            <Row key={r.sessionId} r={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function Tab({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`relative px-3 py-1 font-bold transition-colors ${
        active ? "text-white" : "text-gray-600 cursor-not-allowed"
      }`}
      title={active ? undefined : "Coming soon"}
    >
      {label}
      {active && (
        <span className="absolute -bottom-3 left-2 right-2 h-[2px] bg-blue-500" />
      )}
    </span>
  );
}

function Row({ r }: { r: Row }) {
  return (
    <div className="grid grid-cols-[auto_1.4fr_repeat(4,_1fr)_auto_auto] items-center gap-4 px-5 py-3 border-t border-[#1f2230] hover:bg-[#101620] transition-colors">
      <span
        className={`text-sm font-black uppercase tracking-widest border-l-4 pl-3 ${
          r.isWin
            ? "border-emerald-500 text-emerald-400"
            : "border-red-500 text-red-400"
        }`}
      >
        {r.isWin ? "W" : "L"}
      </span>
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-xs font-bold uppercase tracking-widest truncate">
          {r.modeLabel}
        </span>
        <span className="text-[10px] text-gray-600 font-mono truncate">
          #{r.sessionId.slice(0, 6)} · {relativeDate(r.createdAt)}
        </span>
      </div>
      <Cell label="Place" value={`${r.rank}/${r.totalPlayers}`} accentWarn />
      <Cell
        label="ELO"
        value={
          r.eloDelta === null
            ? "—"
            : `${r.eloDelta >= 0 ? "+" : ""}${r.eloDelta}`
        }
        accent={
          r.eloDelta === null
            ? undefined
            : r.eloDelta >= 0
              ? "text-emerald-400"
              : "text-red-400"
        }
      />
      <Cell label="Capitals" value={String(r.capitalsHeld)} />
      <Cell label="War W/L" value={`${r.warWins}/${r.warLosses}`} />
      <span className="text-xs text-gray-400 font-mono">
        {formatDuration(r.durationMs)}
      </span>
      <Link
        href={`/profile/`}
        className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-white border border-[#1f2230] hover:border-[#3a3a45] rounded-md px-3 py-1.5 transition-colors"
      >
        Review →
      </Link>
    </div>
  );
}

function Cell({
  label,
  value,
  accent,
  accentWarn,
}: {
  label: string;
  value: string;
  accent?: string;
  accentWarn?: boolean;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <span
        className={`text-sm font-bold font-mono ${
          accent ?? (accentWarn ? "text-amber-300" : "text-white")
        }`}
      >
        {value}
      </span>
    </div>
  );
}
