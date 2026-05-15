"use client";

// Top-level client component for the new Colyseus-backed match flow.
// Connects on mount, renders three panels: map, action panel, players.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useActivePlayerId,
  useActiveQuestion,
  useCountries,
  useGameStore,
  usePlayers,
  useRoomStatus,
  useStage,
  useWinnerId,
} from "@/app/lib/gameStore";
import { PLAYER_COLORS } from "@/app/lib/constants";
import { isMuted, setMuted, sounds } from "@/app/lib/sounds";
import Spinner from "@/app/components/ui/Spinner";
import MapPanel from "./MapPanel";
import ActionPanel from "./ActionPanel";
import PlayerPanel from "./PlayerPanel";
import { abandonMatch } from "./actions";

type Props = {
  sessionId: string;
  jwt: string;
  myPlayerId: string;
  myRole: string;
  initialGameRoomId: string | null;
};

export default function MatchClient({
  sessionId,
  jwt,
  myPlayerId,
  myRole,
  initialGameRoomId,
}: Props) {
  const status = useRoomStatus();
  const errorMessage = useGameStore((s) => s.errorMessage);
  const reconnectAttempt = useGameStore((s) => s.reconnectAttempt);
  const stage = useStage();
  const connect = useGameStore((s) => s.connect);
  const disconnect = useGameStore((s) => s.disconnect);

  useEffect(() => {
    connect(sessionId, jwt, { role: myRole, initialRoomId: initialGameRoomId });
    return () => disconnect();
  }, [connect, disconnect, sessionId, jwt, myRole, initialGameRoomId]);

  useMatchSounds(myPlayerId);
  useTurnTabAlert(myPlayerId);

  // After the server flips stage → "ended", keep the match view visible
  // for a few seconds so players can read the final map state (last
  // captures, capital HP, etc.) before the results modal pops over it.
  const [showEndModal, setShowEndModal] = useState(false);
  useEffect(() => {
    if (stage !== "ended") {
      setShowEndModal(false);
      return;
    }
    const t = setTimeout(() => setShowEndModal(true), 5000);
    return () => clearTimeout(t);
  }, [stage]);

  if (status === "connecting" || status === "idle") {
    return (
      <div className="min-h-screen text-white flex flex-col items-center justify-center gap-4">
        <Spinner />
        <span className="text-sm text-gray-400">Connecting to game…</span>
      </div>
    );
  }

  if (status === "waiting-host") {
    return (
      <div className="min-h-screen text-white flex flex-col items-center justify-center gap-4">
        <Spinner />
        <span className="text-sm text-gray-400">
          Waiting for host to open the room…
        </span>
      </div>
    );
  }

  if (status === "error") {
    const isRoomGone =
      errorMessage?.includes("not found") ||
      errorMessage?.includes("room") ||
      false;
    return (
      <div className="min-h-screen text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center flex flex-col gap-4">
          <h1 className="text-xl font-bold">Couldn&apos;t join match</h1>
          <p className="text-sm text-red-300">{errorMessage}</p>
          {isRoomGone && (
            <p className="text-xs text-gray-400">
              Looks like the server lost this match (likely a restart).
              You can discard it from your profile.
            </p>
          )}
          <div className="flex gap-2 justify-center">
            {isRoomGone && (
              <form action={abandonMatch}>
                <input type="hidden" name="sessionId" value={sessionId} />
                <button
                  type="submit"
                  className="text-sm border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors px-4 py-2 rounded-lg"
                >
                  Discard match
                </button>
              </form>
            )}
            <Link
              href="/dashboard"
              className="text-sm bg-blue-400 hover:bg-blue-500 transition-colors text-white px-4 py-2 rounded-lg"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col text-white overflow-hidden">
      <header className="flex items-center gap-3 px-3 sm:px-6 py-3 border-b border-[#1f1f24] bg-[#0a0a0f]/80 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 via-yellow-300 to-teal-400 shrink-0" />
          <div className="text-sm font-semibold hidden sm:block">
            EuropeQuiz
          </div>
        </div>
        <div className="flex-1 flex justify-center min-w-0">
          <StageTracker stage={stage} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MuteToggle />
          <Link
            href="/dashboard"
            className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1"
          >
            Leave
          </Link>
        </div>
      </header>

      <StageTransitionOverlay />
      {status === "reconnecting" && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs bg-amber-500/10 border-b border-amber-400/30 text-amber-200">
          <Spinner size={12} />
          <span>
            Reconnecting to game server…
            {reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : ""}
          </span>
        </div>
      )}
      {stage === "ended" && !showEndModal && (
        <div className="px-4 py-1.5 text-xs bg-emerald-500/10 border-b border-emerald-400/30 text-emerald-200 text-center uppercase tracking-widest font-semibold">
          Game over — final standings coming up…
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <main className="relative bg-[#0a0a0f] overflow-hidden h-[45vh] shrink-0 lg:h-auto lg:flex-1 lg:shrink">
          <MapPanel myPlayerId={myPlayerId} />
        </main>
        <aside className="flex-1 lg:flex-none w-full lg:w-[360px] flex flex-col gap-3 p-3 sm:p-4 border-t lg:border-t-0 lg:border-l border-[#1f1f24] bg-[#0a0a0f]/80 overflow-y-auto">
          <ActionPanel myPlayerId={myPlayerId} />
          <PlayerPanel myPlayerId={myPlayerId} />
        </aside>
      </div>
      {stage === "ended" && showEndModal && (
        <EndScreen sessionId={sessionId} myPlayerId={myPlayerId} />
      )}
    </div>
  );
}

// --- Stage tracker -----------------------------------------------------
//
// Pill-style segmented indicator in the header. Active segment gets a
// white background + emerald dot, inactive ones stay dim. Replaces the
// older "Match · expand" text label.

const STAGES: { id: string; label: string }[] = [
  { id: "capitals", label: "Capitals" },
  { id: "expand", label: "Expand" },
  { id: "war", label: "War" },
];

function StageTracker({ stage }: { stage: string }) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-[#0a0a0f] border border-[#1f1f24] rounded-full p-1">
      {STAGES.map((s) => {
        const active = stage === s.id;
        return (
          <div
            key={s.id}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full transition-colors ${
              active ? "bg-white text-black" : "text-gray-500"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                active ? "bg-emerald-500" : "bg-gray-700"
              }`}
            />
            <span className="text-[11px] sm:text-sm font-semibold">
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Mute toggle -------------------------------------------------------
//
// Tiny speaker icon in the header. State is persisted in localStorage by
// the sounds module so it survives reloads. The button is also the user
// gesture that unlocks the AudioContext on autoplay-restricted browsers.

function MuteToggle() {
  const [muted, setMutedState] = useState(false);
  useEffect(() => {
    setMutedState(isMuted());
  }, []);
  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) sounds.yourTurn();
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? "Unmute" : "Mute"}
      className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 border border-[#2a2a32] rounded-md"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

// --- Stage transition overlay ------------------------------------------
//
// Brief full-screen banner that fades in/out when the match stage changes
// (capitals → expand → war). Without it the only signal of a stage change
// is a small "Match · expand" label in the header, which players miss.

const STAGE_HEADLINES: Record<
  string,
  { title: string; subtitle: string; tone: string }
> = {
  capitals: {
    title: "Place your capital",
    subtitle: "Pick a country to start your empire.",
    tone: "text-emerald-300",
  },
  expand: {
    title: "Expand phase",
    subtitle: "Answer questions, pick territories.",
    tone: "text-sky-300",
  },
  war: {
    title: "War begins!",
    subtitle: "Attack enemy neighbours to take their land.",
    tone: "text-red-400",
  },
};

function StageTransitionOverlay() {
  const stage = useStage();
  const [visible, setVisible] = useState<{
    title: string;
    subtitle: string;
    tone: string;
  } | null>(null);
  const lastStageRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastStageRef.current === null) {
      // First render — don't flash, just record where we started.
      lastStageRef.current = stage;
      return;
    }
    if (lastStageRef.current === stage) return;
    lastStageRef.current = stage;
    const info = STAGE_HEADLINES[stage];
    if (!info) return;
    setVisible(info);
    const t = setTimeout(() => setVisible(null), 1800);
    return () => clearTimeout(t);
  }, [stage]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-stage-overlay">
      <style>{`
        @keyframes stage-overlay-in {
          0%   { opacity: 0; transform: scale(0.94); }
          18%  { opacity: 1; transform: scale(1); }
          82%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.02); }
        }
        .animate-stage-overlay { animation: stage-overlay-in 1.8s ease-out forwards; }
      `}</style>
      <div className="text-center flex flex-col gap-2 px-8">
        <div
          className={`text-[10px] uppercase tracking-[0.4em] font-semibold ${visible.tone}`}
        >
          New phase
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight">
          {visible.title}
        </h1>
        <p className="text-sm text-gray-300">{visible.subtitle}</p>
      </div>
    </div>
  );
}

// --- Tab title alert ---------------------------------------------------
//
// When it's my turn AND the tab is in the background (user switched away),
// flash the document title so they notice. Restored as soon as the tab
// is visible again or my turn ends.

function useTurnTabAlert(myPlayerId: string) {
  const activePlayerId = useActivePlayerId();
  const stage = useStage();
  const activeQuestion = useActiveQuestion();

  useEffect(() => {
    const original = "EuropeQuiz";
    if (stage === "ended") {
      document.title = original;
      return;
    }
    // I need to act if it's literally my turn OR a numeric question is up
    // (expand phase questions need every player to answer).
    const needsMe =
      activePlayerId === myPlayerId || activeQuestion !== null;
    if (!needsMe) {
      document.title = original;
      return;
    }

    const apply = () => {
      document.title = document.hidden
        ? `(!) Your turn — ${original}`
        : original;
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => {
      document.removeEventListener("visibilitychange", apply);
      document.title = original;
    };
  }, [activePlayerId, myPlayerId, stage, activeQuestion]);
}

// --- Sound effect coordinator -----------------------------------------
//
// Watches store slices and fires the appropriate sound on transitions:
//   - new active question                 → questionUp
//   - active player becomes ME            → yourTurn
//   - a country I now own (was someone    → capture
//     else's / nobody's)
//   - a country I lost (mine → someone)   → countryLost
//   - stage transitions to "ended"        → victory or defeat
//
// We keep prev refs locally so the diff only fires on actual transitions.

function useMatchSounds(myPlayerId: string) {
  const stage = useStage();
  const winnerId = useWinnerId();
  const activePlayerId = useActivePlayerId();
  const activeQuestion = useActiveQuestion();
  const countries = useCountries();

  const prevOwnersRef = useRef<Record<string, string | null>>({});
  const initOwnersRef = useRef(false);
  const prevActiveRef = useRef<string | null>(null);
  const prevQuestionIdRef = useRef<string | null>(null);
  const prevStageRef = useRef<string | null>(null);

  useEffect(() => {
    const next: Record<string, string | null> = {};
    let captures = 0;
    let losses = 0;
    for (const c of countries) {
      const newOwner = c.ownerId ?? null;
      next[c.svgId] = newOwner;
      if (!initOwnersRef.current) continue;
      const prev = prevOwnersRef.current[c.svgId] ?? null;
      if (prev === newOwner) continue;
      if (newOwner === myPlayerId) captures++;
      else if (prev === myPlayerId) losses++;
    }
    prevOwnersRef.current = next;
    if (!initOwnersRef.current) {
      initOwnersRef.current = true;
      return;
    }
    if (captures > 0) sounds.capture();
    else if (losses > 0) sounds.countryLost();
  }, [countries, myPlayerId]);

  useEffect(() => {
    if (
      activePlayerId &&
      activePlayerId === myPlayerId &&
      prevActiveRef.current !== myPlayerId &&
      stage !== "ended"
    ) {
      sounds.yourTurn();
    }
    prevActiveRef.current = activePlayerId ?? null;
  }, [activePlayerId, myPlayerId, stage]);

  useEffect(() => {
    const qid = activeQuestion?.id ?? null;
    if (qid && qid !== prevQuestionIdRef.current) {
      sounds.questionUp();
    }
    prevQuestionIdRef.current = qid;
  }, [activeQuestion]);

  useEffect(() => {
    if (stage === "ended" && prevStageRef.current !== "ended") {
      if (winnerId === myPlayerId) sounds.victory();
      else sounds.defeat();
    }
    prevStageRef.current = stage;
  }, [stage, winnerId, myPlayerId]);
}

// --- Game over screen ---------------------------------------------------

function EndScreen({
  sessionId,
  myPlayerId,
}: {
  sessionId: string;
  myPlayerId: string;
}) {
  const winnerId = useWinnerId();
  const players = usePlayers();
  const countries = useCountries();

  const winner = players.find((p) => p.id === winnerId);
  const winnerColor = winner
    ? PLAYER_COLORS[winner.turnOrder % PLAYER_COLORS.length]
    : null;
  const isMe = winnerId === myPlayerId;

  // Per-player aggregates so the screen shows the actual final standings.
  const lands = new Map<string, number>();
  const points = new Map<string, number>();
  for (const c of countries) {
    if (!c.ownerId) continue;
    lands.set(c.ownerId, (lands.get(c.ownerId) ?? 0) + 1);
    points.set(c.ownerId, (points.get(c.ownerId) ?? 0) + c.points);
  }
  const ranked = [...players].sort(
    (a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0),
  );
  const totalPoints = countries.reduce((s, c) => s + c.points, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 text-white flex items-center justify-center px-6 py-10 overflow-y-auto bg-black/70 backdrop-blur-sm animate-end-modal"
    >
      <style>{`
        @keyframes end-modal-in {
          0%   { opacity: 0; transform: scale(0.96); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-end-modal { animation: end-modal-in 0.35s ease-out forwards; }
      `}</style>
      <div className="max-w-lg w-full flex flex-col gap-6">
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
                {winner.nickname.charAt(0).toUpperCase()}
              </div>
              <h1 className="text-3xl font-bold leading-tight">
                {isMe ? `You win, ${winner.nickname}!` : `${winner.nickname} wins`}
              </h1>
              <p className="text-sm text-gray-400">
                {(points.get(winner.id) ?? 0).toLocaleString()} points ·{" "}
                {lands.get(winner.id) ?? 0} territories
              </p>
            </>
          ) : (
            <h1 className="text-3xl font-bold leading-tight">Match ended</h1>
          )}
        </section>

        <section className="bg-[#14141a] border border-[#1f1f24] rounded-2xl p-6 flex flex-col gap-3">
          <div className="text-xs uppercase tracking-widest text-gray-500">
            Final standings
          </div>
          {ranked.map((p, idx) => {
            const pts = points.get(p.id) ?? 0;
            const ld = lands.get(p.id) ?? 0;
            const share =
              totalPoints > 0 ? Math.round((pts / totalPoints) * 100) : 0;
            const color = PLAYER_COLORS[p.turnOrder % PLAYER_COLORS.length];
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                  p.id === winnerId
                    ? "border border-emerald-400/40 bg-emerald-400/5"
                    : "bg-[#1a1a20]"
                }`}
              >
                <span className="text-xs text-gray-500 font-mono w-5 text-center">
                  #{idx + 1}
                </span>
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center text-sm font-bold shrink-0 text-black"
                  style={{ backgroundColor: color }}
                >
                  {p.nickname.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold truncate">
                      {p.nickname}
                    </span>
                    {p.id === myPlayerId && (
                      <span className="text-[10px] text-gray-500">you</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {pts.toLocaleString()} pts · {ld} lands · {share}%
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <div className="flex justify-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm bg-blue-400 hover:bg-blue-500 transition-colors text-white px-5 py-2 rounded-lg"
          >
            Dashboard
          </Link>
          <Link
            href={`/lobby/${sessionId}`}
            className="text-sm border border-[#4f4f4f] bg-[#1a1a1a] hover:bg-[#292929] transition-colors px-5 py-2 rounded-lg"
          >
            See full results
          </Link>
        </div>
      </div>
    </div>
  );
}
