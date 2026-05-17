"use client";

// FACEIT-style post-match summary. Hero strip with winner banner (medal
// accent on the border) + sharp standings table with per-player aggregate
// stats pulled from the event log.

import Link from "next/link";
import { PLAYER_COLORS } from "@/app/lib/constants";
import PanelCard from "@/app/components/ui/PanelCard";
import Slash from "@/app/components/ui/Slash";

type Player = {
  id: string;
  abandoned?: boolean;
  profile: { nickname: string };
};

type Country = {
  id: string;
  ownerId: string | null;
  isCapital: boolean;
  points: number;
};

type EventRow = {
  id: string;
  type: string;
  actorId: string | null;
  payload: Record<string, unknown>;
};

type Props = {
  sessionId: string;
  players: Player[];
  countries: Country[];
  events: EventRow[];
  winnerId: string | null;
  warRound: number;
  maxRounds: number;
  currentPlayerId: string | null;
};

export default function ResultsView({
  sessionId,
  players,
  countries,
  events,
  winnerId,
  warRound,
  maxRounds,
  currentPlayerId,
}: Props) {
  const landsByPlayer = new Map<string, number>();
  const pointsByPlayer = new Map<string, number>();
  for (const c of countries) {
    if (!c.ownerId) continue;
    landsByPlayer.set(c.ownerId, (landsByPlayer.get(c.ownerId) ?? 0) + 1);
    pointsByPlayer.set(
      c.ownerId,
      (pointsByPlayer.get(c.ownerId) ?? 0) + (c.points ?? 0),
    );
  }

  const ranking = [...players]
    .map((p, originalIdx) => ({
      player: p,
      lands: landsByPlayer.get(p.id) ?? 0,
      points: pointsByPlayer.get(p.id) ?? 0,
      color: PLAYER_COLORS[originalIdx % PLAYER_COLORS.length],
    }))
    .sort((a, b) => b.points - a.points);

  const totalPoints = countries.reduce((s, c) => s + (c.points ?? 0), 0);

  const stats = new Map<
    string,
    {
      capitalsTaken: number;
      attacksWon: number;
      defended: number;
      roundsWon: number;
    }
  >();
  for (const p of players) {
    stats.set(p.id, {
      capitalsTaken: 0,
      attacksWon: 0,
      defended: 0,
      roundsWon: 0,
    });
  }
  for (const e of events) {
    if (!e.actorId) continue;
    const s = stats.get(e.actorId);
    if (!s) continue;
    if (e.type === "capital_fell") s.capitalsTaken += 1;
    if (e.type === "attack_won") s.attacksWon += 1;
    if (e.type === "attack_held") s.defended += 1;
    if (e.type === "round") s.roundsWon += 1;
  }

  const winner = winnerId ? players.find((p) => p.id === winnerId) : null;
  const winnerColor = winner
    ? PLAYER_COLORS[
        players.findIndex((p) => p.id === winner.id) % PLAYER_COLORS.length
      ]
    : null;
  const isWinnerMe = winner?.id === currentPlayerId;
  const totalCountries = countries.length;
  const winnerLands = winner ? landsByPlayer.get(winner.id) ?? 0 : 0;
  const winnerPoints = winner ? pointsByPlayer.get(winner.id) ?? 0 : 0;
  const dominationPct =
    totalCountries > 0
      ? Math.round((winnerLands / totalCountries) * 100)
      : 0;

  const heroAccent = isWinnerMe ? "var(--color-win)" : "var(--color-gold)";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-canvas text-white flex flex-col">
      <section
        className="relative overflow-hidden border-b border-stroke bg-gradient-to-br from-surface-hi via-panel to-canvas"
        style={{ borderTop: `3px solid ${heroAccent}` }}
      >
        <div
          className="absolute right-[-80px] top-0 bottom-0 w-[200px] bg-accent/10"
          style={{ transform: "skewX(-12deg)" }}
          aria-hidden
        />
        <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 py-8 flex flex-col items-center text-center gap-3">
          <Slash
            label={isWinnerMe ? "Victory" : "Game over"}
            color={heroAccent}
            dark
          />
          {winner ? (
            <>
              <div
                className="w-16 h-16 flex items-center justify-center text-2xl font-bold text-black border-2"
                style={{
                  backgroundColor: winnerColor ?? "#666",
                  borderColor: heroAccent,
                }}
              >
                {winner.profile.nickname.charAt(0).toUpperCase()}
              </div>
              <h1
                className="font-head text-white leading-none"
                style={{ fontSize: "clamp(36px, 5vw, 56px)" }}
              >
                {isWinnerMe
                  ? `YOU WIN, ${winner.profile.nickname.toUpperCase()}!`
                  : `${winner.profile.nickname.toUpperCase()} WINS`}
              </h1>
              <p className="font-mono text-sm text-mute">
                {winnerPoints.toLocaleString()} points · {dominationPct}% of
                Europe · {winnerLands}{" "}
                {winnerLands === 1 ? "territory" : "territories"}
              </p>
            </>
          ) : (
            <h1 className="font-head text-4xl text-white">MATCH ENDED</h1>
          )}
          <p className="font-mono text-[11px] text-dim mt-2">
            Round {Math.min(warRound, maxRounds)} / {maxRounds} · Match #
            {sessionId.slice(-6)}
          </p>
          <Link
            href="/dashboard"
            className="font-head text-xs text-white bg-accent hover:bg-accent-dim transition-colors px-5 py-2 mt-3"
          >
            Back to dashboard
          </Link>
        </div>
      </section>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6">
        <PanelCard title="Final standings" accent="#1ed3ff" padded={false}>
          <div>
            {ranking.map((row, idx) => {
              const s = stats.get(row.player.id) ?? {
                capitalsTaken: 0,
                attacksWon: 0,
                defended: 0,
                roundsWon: 0,
              };
              const isYou = row.player.id === currentPlayerId;
              const isWinner = row.player.id === winnerId;
              const isLeaver = Boolean(row.player.abandoned);
              const initial = row.player.profile.nickname
                .charAt(0)
                .toUpperCase();
              const lands = row.lands;
              const points = row.points;
              const sharePct =
                totalPoints > 0
                  ? Math.round((points / totalPoints) * 100)
                  : 0;
              const rankColor =
                idx === 0
                  ? "var(--color-gold)"
                  : idx === 1
                    ? "#bdc1c8"
                    : idx === 2
                      ? "#c08458"
                      : "var(--color-mute)";
              return (
                <div
                  key={row.player.id}
                  className="relative flex items-center gap-3 px-4 py-3 border-t border-stroke first:border-t-0"
                  style={{
                    background: isWinner
                      ? "color-mix(in srgb, var(--color-win) 8%, transparent)"
                      : isLeaver
                        ? "color-mix(in srgb, var(--color-lose) 6%, transparent)"
                        : undefined,
                    opacity: isLeaver ? 0.7 : 1,
                  }}
                >
                  {(isWinner || isLeaver) && (
                    <span
                      className="absolute left-0 top-0 bottom-0 w-[3px]"
                      style={{
                        background: isWinner
                          ? "var(--color-win)"
                          : "var(--color-lose)",
                      }}
                      aria-hidden
                    />
                  )}
                  <span
                    className="font-head text-sm w-7 text-center"
                    style={{ color: rankColor }}
                  >
                    #{idx + 1}
                  </span>
                  <div
                    className="w-10 h-10 flex items-center justify-center text-sm font-bold shrink-0 text-black"
                    style={{ backgroundColor: row.color }}
                  >
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <Link
                        href={`/profile/${encodeURIComponent(row.player.profile.nickname)}`}
                        className="font-head text-xs text-white hover:text-accent truncate transition-colors"
                      >
                        {row.player.profile.nickname.toUpperCase()}
                      </Link>
                      {isYou && (
                        <span className="font-head text-[9px] text-accent">
                          YOU
                        </span>
                      )}
                      {isWinner && (
                        <span className="font-head text-[9px] text-win">
                          WINNER
                        </span>
                      )}
                      {isLeaver && (
                        <span className="font-head text-[9px] text-lose">
                          LEAVER
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-dim mt-0.5">
                      {points.toLocaleString()} pts ·{" "}
                      {lands} {lands === 1 ? "land" : "lands"} · {sharePct}%
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-3">
                    <Stat label="Rounds" value={s.roundsWon} />
                    <Stat label="Attacks" value={s.attacksWon} />
                    <Stat label="Defended" value={s.defended} />
                    <Stat label="Capitals" value={s.capitalsTaken} />
                  </div>
                  <div className="w-20 h-1 bg-panel overflow-hidden shrink-0">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(sharePct, 4)}%`,
                        backgroundColor: row.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </PanelCard>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center min-w-[42px]">
      <span className="font-mono text-sm font-bold text-white">{value}</span>
      <span className="font-head text-[9px] text-dim">{label}</span>
    </div>
  );
}
