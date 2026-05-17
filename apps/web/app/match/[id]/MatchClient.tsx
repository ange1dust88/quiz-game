"use client";

// Top-level client component for the new Colyseus-backed match flow.
// Connects on mount, renders three panels: map, action panel, players.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import Avatar from "@/app/components/ui/Avatar";
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
      <div className="min-h-screen bg-canvas text-white flex flex-col items-center justify-center gap-4">
        <Spinner />
        <span className="font-mono text-sm text-mute">Connecting to game…</span>
      </div>
    );
  }

  if (status === "waiting-host") {
    return (
      <div className="min-h-screen bg-canvas text-white flex flex-col items-center justify-center gap-4">
        <Spinner />
        <span className="font-mono text-sm text-mute">
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
      <div className="min-h-screen bg-canvas text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center flex flex-col gap-4 border border-stroke bg-surface p-8">
          <h1 className="font-head text-2xl text-white">
            Couldn&apos;t join match
          </h1>
          <p className="font-body text-sm text-lose">{errorMessage}</p>
          {isRoomGone && (
            <p className="font-body text-xs text-mute">
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
                  className="font-head text-xs text-lose border border-lose/40 hover:bg-lose/10 transition-colors px-4 py-2"
                >
                  Discard match
                </button>
              </form>
            )}
            <Link
              href="/dashboard"
              className="font-head text-xs text-white bg-accent hover:bg-accent-dim transition-colors px-4 py-2"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col text-white overflow-hidden bg-canvas">
      <header className="flex items-center gap-3 px-3 sm:px-6 h-14 border-b border-stroke bg-panel">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <HexLogo />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="font-head text-xs text-white">EUROPEQUIZ</span>
            <span className="font-mono text-[9px] text-dim uppercase tracking-widest">
              Live match
            </span>
          </div>
        </div>
        <div className="flex-1 flex justify-center min-w-0">
          <StageTracker stage={stage} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MuteToggle />
          <LeaveButton />
        </div>
      </header>

      <StageTransitionOverlay />
      {status === "reconnecting" && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 font-mono text-[11px] bg-gold/10 border-b border-gold/30 text-gold">
          <Spinner size={12} />
          <span>
            Reconnecting to game server…
            {reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : ""}
          </span>
        </div>
      )}
      {stage === "ended" && !showEndModal && (
        <div className="px-4 py-1.5 font-head text-[11px] bg-win/10 border-b border-win/30 text-win text-center">
          Game over — final standings coming up…
        </div>
      )}
      {stage !== "ended" && <DisconnectBanner />}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <main className="relative bg-canvas overflow-hidden h-[45vh] shrink-0 lg:h-auto lg:flex-1 lg:shrink">
          <MapPanel myPlayerId={myPlayerId} />
        </main>
        <aside className="flex-1 lg:flex-none w-full lg:w-[380px] flex flex-col gap-3 p-3 sm:p-4 border-t lg:border-t-0 lg:border-l border-stroke bg-panel overflow-y-auto">
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

// Banner surfaces transient disconnects so the survivor knows the
// match is paused for a reconnect window, not just frozen. Server keeps
// disconnected (but not yet abandoned) players in state for ~30s; we
// track when each player first went offline locally so we can show a
// per-player countdown to the forfeit deadline.
const RECONNECT_GRACE_MS = 30_000;

function DisconnectBanner() {
  const players = usePlayers();
  const offline = players.filter((p) => !p.connected && !p.abandoned);

  // Per-player local "went offline at" timestamps. Survives renders so
  // the countdown continues across re-renders triggered by other state.
  const startedAtRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const now = Date.now();
    const seen = new Set<string>();
    for (const p of offline) {
      if (!startedAtRef.current.has(p.id)) {
        startedAtRef.current.set(p.id, now);
      }
      seen.add(p.id);
    }
    for (const id of Array.from(startedAtRef.current.keys())) {
      if (!seen.has(id)) startedAtRef.current.delete(id);
    }
  }, [offline]);

  // Re-render once a second while the banner is up so the countdown
  // animates. Stops when nobody is offline.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (offline.length === 0) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [offline.length]);

  if (offline.length === 0) return null;

  const now = Date.now();
  const remaining = offline.map((p) => {
    const startedAt = startedAtRef.current.get(p.id) ?? now;
    const ms = Math.max(0, RECONNECT_GRACE_MS - (now - startedAt));
    return { name: p.nickname, secs: Math.ceil(ms / 1000) };
  });
  const soonest = Math.min(...remaining.map((r) => r.secs));
  const labelNames =
    remaining.length === 1
      ? remaining[0].name
      : `${remaining.length} players`;

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-1.5 font-head text-[11px] bg-gold/10 border-b border-gold/30 text-gold">
      <Spinner size={12} />
      <span>
        {soonest > 0
          ? `Waiting for ${labelNames} · ${soonest}s until forfeit`
          : `${labelNames} did not return — forfeiting…`}
      </span>
    </div>
  );
}

// Leave is destructive — server treats it as a consented disconnect and
// immediately frees the seat (no reconnect). One confirm() prompt stops
// accidental clicks during a live match.
function LeaveButton() {
  const router = useRouter();
  const onClick = () => {
    if (
      window.confirm(
        "Leave the match? You won't be able to rejoin — your seat will be given up.",
      )
    ) {
      router.push("/dashboard");
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-head text-[11px] text-mute hover:text-lose border border-stroke hover:border-lose transition-colors px-3 py-1.5"
    >
      Leave
    </button>
  );
}

function HexLogo() {
  return (
    <svg width="28" height="32" viewBox="0 0 32 36" aria-hidden="true">
      <polygon
        points="16,1 31,9 31,27 16,35 1,27 1,9"
        fill="#121822"
        stroke="#1ed3ff"
        strokeWidth="1.5"
      />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="#1ed3ff"
        fontSize="11"
        fontWeight="800"
        fontFamily="var(--font-geist-sans), system-ui"
      >
        EQ
      </text>
    </svg>
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
    <div className="inline-flex items-stretch border border-stroke bg-canvas">
      {STAGES.map((s) => {
        const active = stage === s.id;
        return (
          <div
            key={s.id}
            className="relative flex items-center gap-1.5 px-3 sm:px-4 py-1.5 border-r border-stroke last:border-r-0 transition-colors"
            style={{
              background: active ? "var(--color-surface-hi)" : "transparent",
            }}
          >
            <span
              className="w-1.5 h-1.5"
              style={{
                background: active ? "var(--color-accent)" : "var(--color-dim)",
              }}
            />
            <span
              className="font-head text-[10px] sm:text-[11px]"
              style={{
                color: active ? "var(--color-white)" : "var(--color-dim)",
              }}
            >
              {s.label}
            </span>
            {active && (
              <span
                className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{ background: "var(--color-accent)" }}
              />
            )}
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
      className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-3 py-1.5"
    >
      {muted ? "Sound off" : "Sound on"}
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
    tone: "text-accent",
  },
  expand: {
    title: "Expand phase",
    subtitle: "Answer questions, pick territories.",
    tone: "text-blue2",
  },
  war: {
    title: "War begins!",
    subtitle: "Attack enemy neighbours to take their land.",
    tone: "text-lose",
  },
};

function StageTransitionOverlay() {
  const stage = useStage();
  const status = useRoomStatus();
  const [visible, setVisible] = useState<{
    title: string;
    subtitle: string;
    tone: string;
  } | null>(null);
  const lastStageRef = useRef<string | null>(null);

  useEffect(() => {
    // Wait until we're actually connected before tracking transitions
    // — otherwise a page refresh in mid-match would flash the "Capitals"
    // overlay as the store snaps from emptyState.stage → real stage.
    if (status !== "connected") return;
    if (lastStageRef.current === null) {
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
  }, [stage, status]);

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
          className={`font-head text-[10px] tracking-[0.4em] ${visible.tone}`}
        >
          New phase
        </div>
        <h1 className="font-head text-4xl sm:text-5xl leading-tight text-white">
          {visible.title}
        </h1>
        <p className="font-body text-sm text-mute">{visible.subtitle}</p>
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
      <div className="max-w-lg w-full flex flex-col gap-4">
        <section
          className="bg-surface border p-8 flex flex-col items-center text-center gap-3"
          style={{ borderTop: `3px solid ${isMe ? "var(--color-win)" : "var(--color-gold)"}`, borderColor: "var(--color-stroke)" }}
        >
          <div
            className="font-head text-[11px] tracking-widest"
            style={{ color: isMe ? "var(--color-win)" : "var(--color-gold)" }}
          >
            Game over
          </div>
          {winner ? (
            <>
              <Avatar
                nickname={winner.nickname}
                avatarUrl={winner.avatarUrl}
                size={64}
                shape="square"
                color={winnerColor ?? "#666"}
              />
              <h1 className="font-head text-3xl text-white leading-tight">
                {isMe ? `You win, ${winner.nickname}!` : `${winner.nickname} wins`}
              </h1>
              <p className="font-mono text-sm text-mute">
                {(points.get(winner.id) ?? 0).toLocaleString()} points ·{" "}
                {lands.get(winner.id) ?? 0} territories
              </p>
            </>
          ) : (
            <h1 className="font-head text-3xl text-white leading-tight">
              Match ended
            </h1>
          )}
        </section>

        <section className="bg-surface border border-stroke p-5 flex flex-col gap-2">
          <div className="font-head text-[10px] text-dim mb-1">
            Final standings
          </div>
          {ranked.map((p, idx) => {
            const pts = points.get(p.id) ?? 0;
            const ld = lands.get(p.id) ?? 0;
            const share =
              totalPoints > 0 ? Math.round((pts / totalPoints) * 100) : 0;
            const color = PLAYER_COLORS[p.turnOrder % PLAYER_COLORS.length];
            const isWinnerRow = p.id === winnerId;
            const isLeaver = p.abandoned;
            return (
              <div
                key={p.id}
                className="relative flex items-center gap-3 px-3 py-2 border"
                style={{
                  borderColor: isWinnerRow
                    ? "var(--color-win)"
                    : isLeaver
                      ? "color-mix(in srgb, var(--color-lose) 40%, var(--color-stroke))"
                      : "var(--color-stroke)",
                  background: isWinnerRow
                    ? "color-mix(in srgb, var(--color-win) 8%, transparent)"
                    : isLeaver
                      ? "color-mix(in srgb, var(--color-lose) 6%, transparent)"
                      : "var(--color-panel)",
                  opacity: isLeaver ? 0.7 : 1,
                }}
              >
                <span className="font-head text-xs text-dim w-5 text-center">
                  #{idx + 1}
                </span>
                <Avatar
                  nickname={p.nickname}
                  avatarUrl={p.avatarUrl}
                  size={36}
                  shape="square"
                  color={color}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-head text-xs text-white truncate">
                      {p.nickname.toUpperCase()}
                    </span>
                    {p.id === myPlayerId && (
                      <span className="font-head text-[9px] text-accent">YOU</span>
                    )}
                    {isLeaver && (
                      <span className="font-head text-[9px] text-lose">
                        LEAVER
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-dim">
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
            className="font-head text-xs text-white bg-accent hover:bg-accent-dim transition-colors px-5 py-2"
          >
            Dashboard
          </Link>
          <Link
            href={`/lobby/${sessionId}`}
            className="font-head text-xs text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-5 py-2"
          >
            See full results
          </Link>
        </div>
      </div>
    </div>
  );
}
