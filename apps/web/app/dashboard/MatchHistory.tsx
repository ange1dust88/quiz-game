// Match history table. Used in two places:
//   - dashboard: compact preview with a "View all →" link to the
//     profile's matches tab
//   - profile (matches tab): the full table, no "view all" link
//
// Each row derives the viewer's place + ELO delta + capital count from
// MatchSnapshot.finalState + telemetry. The W/L badge is a sharp
// bordered chip in the FACEIT idiom.

import Link from "next/link";
import { prisma } from "@quiz/db";
import PanelCard from "@/app/components/ui/PanelCard";

type Props = {
  profileId: string;
  // How many rows to render. Dashboard uses ~5, profile uses more.
  limit?: number;
  // When set, a "View all →" footer link is appended pointing at
  // /profile/<nickname>?tab=matches. Pass undefined to suppress.
  viewAllNickname?: string;
};

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
    | { warAnswers?: { playerId: string; isCorrect: boolean }[] }
    | null;
  let warWins = 0;
  let warLosses = 0;
  for (const a of tel?.warAnswers ?? []) {
    if (a.playerId !== me.id) continue;
    if (a.isCorrect) warWins += 1;
    else warLosses += 1;
  }

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
  if (diff < day)
    return `${Math.max(1, Math.floor(diff / (60 * 60 * 1000)))}h ago`;
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function MatchHistory({
  profileId,
  limit = 12,
  viewAllNickname,
}: Props) {
  const [snapshots, eloHistory] = await Promise.all([
    prisma.matchSnapshot.findMany({
      where: { session: { players: { some: { profileId } } } },
      orderBy: { createdAt: "desc" },
      take: limit,
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
      take: Math.max(limit, 12),
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
    <PanelCard title="Match history" accent="#1ed3ff" padded={false}>
      {rows.length === 0 ? (
        <p className="font-body text-sm text-dim px-5 py-8 text-center">
          No matches yet — hit Play now to start.
        </p>
      ) : (
        <div>
          {rows.map((r) => (
            <Row key={r.sessionId} r={r} />
          ))}
        </div>
      )}
      {viewAllNickname && rows.length > 0 && (
        <Link
          href={`/profile/${encodeURIComponent(viewAllNickname)}?tab=matches`}
          className="block text-center font-head text-[10px] text-mute hover:text-white border-t border-stroke py-2.5 transition-colors"
        >
          View all →
        </Link>
      )}
    </PanelCard>
  );
}

function Row({ r }: { r: Row }) {
  return (
    <div className="grid grid-cols-[44px_1fr_70px_80px_70px_80px_60px_auto] items-center gap-3 px-4 py-2.5 border-t border-stroke hover:bg-surface-hi transition-colors">
      <span
        className="w-9 h-9 inline-flex items-center justify-center font-head text-lg font-extrabold"
        style={{
          background: r.isWin
            ? "rgba(63, 207, 108, 0.14)"
            : "rgba(255, 66, 68, 0.14)",
          borderLeft: `3px solid ${
            r.isWin ? "var(--color-win)" : "var(--color-lose)"
          }`,
          color: r.isWin ? "var(--color-win)" : "var(--color-lose)",
        }}
      >
        {r.isWin ? "W" : "L"}
      </span>

      <div className="flex flex-col leading-tight min-w-0">
        <span className="font-head text-xs text-white truncate">
          {r.modeLabel}
        </span>
        <span className="font-mono text-[10px] text-dim truncate mt-0.5">
          #{r.sessionId.slice(0, 6)} · {relativeDate(r.createdAt)}
        </span>
      </div>

      <Cell label="Place">
        <span
          className={`font-mono text-sm font-bold ${
            r.rank === 1 ? "text-gold" : "text-white"
          }`}
        >
          {r.rank}
          <span className="text-dim">/{r.totalPlayers}</span>
        </span>
      </Cell>

      <Cell label="ELO">
        <span
          className="font-mono text-sm font-bold"
          style={{
            color:
              r.eloDelta === null
                ? "var(--color-mute)"
                : r.eloDelta >= 0
                  ? "var(--color-win)"
                  : "var(--color-lose)",
          }}
        >
          {r.eloDelta === null
            ? "—"
            : `${r.eloDelta >= 0 ? "+" : ""}${r.eloDelta}`}
        </span>
      </Cell>

      <Cell label="Capitals">
        <span className="font-mono text-sm text-white">{r.capitalsHeld}</span>
      </Cell>

      <Cell label="War W/L">
        <span className="font-mono text-sm text-white">
          {r.warWins}/{r.warLosses}
        </span>
      </Cell>

      <span className="font-mono text-xs text-mute">
        {formatDuration(r.durationMs)}
      </span>

      <Link
        href={`/lobby/${r.sessionId}`}
        className="font-head text-[10px] text-white border border-stroke hover:border-mute px-3 py-1.5 transition-colors"
      >
        Review →
      </Link>
    </div>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="font-head text-[9px] text-mute">{label}</span>
      <span className="mt-0.5">{children}</span>
    </div>
  );
}
