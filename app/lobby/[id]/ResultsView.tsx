"use client";

import Link from "next/link";
import { PLAYER_COLORS } from "@/app/lib/constants";

type Player = {
  id: string;
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

  // Per-player stats from event log.
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
    ? PLAYER_COLORS[players.findIndex((p) => p.id === winner.id) % PLAYER_COLORS.length]
    : null;
  const isWinnerMe = winner?.id === currentPlayerId;
  const totalCountries = countries.length;
  const winnerLands = winner ? landsByPlayer.get(winner.id) ?? 0 : 0;
  const winnerPoints = winner ? pointsByPlayer.get(winner.id) ?? 0 : 0;
  const dominationPct =
    totalCountries > 0
      ? Math.round((winnerLands / totalCountries) * 100)
      : 0;

  return (
    <div className="min-h-screen text-white flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#1f1f24] bg-[#0a0a0f]/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 via-yellow-300 to-teal-400" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">EuropeQuiz</div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              Match · Final
            </div>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-gray-400 hover:text-white transition-colors px-4 py-2 border border-[#4f4f4f] rounded-lg"
        >
          Back to dashboard
        </Link>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 flex flex-col gap-8">
        {/* Winner banner */}
        <section className="bg-[#14141a] border border-emerald-400/40 rounded-2xl p-8 flex flex-col items-center text-center gap-3">
          <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
            Game over
          </div>
          {winner ? (
            <>
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-black"
                style={{ backgroundColor: winnerColor ?? "#666" }}
              >
                {winner.profile.nickname.charAt(0).toUpperCase()}
              </div>
              <h1 className="text-3xl font-bold leading-tight">
                {isWinnerMe
                  ? `You win, ${winner.profile.nickname}!`
                  : `${winner.profile.nickname} wins`}
              </h1>
              <p className="text-sm text-gray-400">
                {winnerPoints.toLocaleString()} points ·{" "}
                {dominationPct}% of Europe · {winnerLands}{" "}
                {winnerLands === 1 ? "territory" : "territories"}
              </p>
            </>
          ) : (
            <h1 className="text-3xl font-bold leading-tight">Match ended</h1>
          )}
          <p className="text-xs text-gray-500 uppercase tracking-widest mt-2">
            Round {Math.min(warRound, maxRounds)} / {maxRounds} · Match {sessionId.slice(-6)}
          </p>
        </section>

        {/* Standings */}
        <section className="bg-[#14141a] border border-[#1f1f24] rounded-2xl p-6 flex flex-col gap-4">
          <div className="text-xs uppercase tracking-widest text-gray-500">
            Final standings
          </div>
          <div className="flex flex-col gap-2">
            {ranking.map((row, idx) => {
              const s = stats.get(row.player.id) ?? {
                capitalsTaken: 0,
                attacksWon: 0,
                defended: 0,
                roundsWon: 0,
              };
              const isYou = row.player.id === currentPlayerId;
              const isWinner = row.player.id === winnerId;
              const initial = row.player.profile.nickname
                .charAt(0)
                .toUpperCase();
              const lands = row.lands;
              const points = row.points;
              const sharePct =
                totalPoints > 0
                  ? Math.round((points / totalPoints) * 100)
                  : 0;
              return (
                <div
                  key={row.player.id}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors ${
                    isWinner
                      ? "border-emerald-400/40 bg-emerald-400/5"
                      : "border-[#1f1f24] bg-[#1a1a20]"
                  }`}
                >
                  <span className="text-xs text-gray-500 font-mono w-6 text-center">
                    #{idx + 1}
                  </span>
                  <div
                    className="w-10 h-10 rounded-md flex items-center justify-center text-sm font-bold shrink-0 text-black"
                    style={{ backgroundColor: row.color }}
                  >
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold truncate">
                        {row.player.profile.nickname}
                      </span>
                      {isYou && (
                        <span className="text-[10px] text-gray-500">you</span>
                      )}
                      {isWinner && (
                        <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
                          winner
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {points.toLocaleString()} pts ·{" "}
                      {lands} {lands === 1 ? "land" : "lands"} · {sharePct}%
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-[11px] text-gray-400">
                    <Stat label="Rounds" value={s.roundsWon} />
                    <Stat label="Attacks" value={s.attacksWon} />
                    <Stat label="Defended" value={s.defended} />
                    <Stat label="Capitals" value={s.capitalsTaken} />
                  </div>
                  <div className="w-20 h-1 bg-[#1f1f24] rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full rounded-full"
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
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center min-w-[42px]">
      <span className="text-white font-semibold text-sm">{value}</span>
      <span className="text-[9px] uppercase tracking-widest text-gray-600">
        {label}
      </span>
    </div>
  );
}
