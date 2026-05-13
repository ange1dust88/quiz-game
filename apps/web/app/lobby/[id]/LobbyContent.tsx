"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/client";
import { StartGameButton } from "./StartGameButton";
import { joinGame, leaveLobby } from "./actions";
import { useRouter } from "next/navigation";
import ResultsView from "./ResultsView";
import MatchChoicesPicker from "./MatchChoicesPicker";
import { findChoiceOption, MATCH_CHOICES } from "@quiz/shared/matchChoices";
import { PLAYER_COLORS } from "@/app/lib/constants";

interface Player {
  id: string;
  profileId: string;
  role: string;
  profile: {
    nickname: string;
  };
  choices: { key: string; value: string }[];
}

interface Country {
  id: string;
  ownerId: string | null;
  isCapital: boolean;
  points: number;
}

interface EventRow {
  id: string;
  type: string;
  actorId: string | null;
  payload: Record<string, unknown>;
}

interface GameSession {
  id: string;
  status: string;
  stage: string;
  winnerId: string | null;
  warRound: number;
  maxWarRounds: number;
  players: Player[];
  countries: Country[];
  events: EventRow[];
}

interface Props {
  sessionId: string;
  initialSession: GameSession;
  currentUser: {
    id: string;
    userId: string;
  };
}

export function LobbyContent({
  sessionId,
  initialSession,
  currentUser,
}: Props) {
  const [session, setSession] = useState(initialSession);
  const router = useRouter();

  // Re-sync state when the server-rendered props refresh (e.g. via router.refresh()).
  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  useEffect(() => {
    const supabase = createClient();

    const refetch = async () => {
      const response = await fetch(`/api/sessions/${sessionId}`);
      const freshSession = await response.json();
      setSession((prev) => ({ ...prev, ...freshSession }));
    };

    // Main lobby channel — drives game start, player joins, etc. Kept on
    // tables that are already in the Supabase realtime publication so this
    // flow can never be blocked by a misconfigured new table.
    const main = supabase
      .channel(`room-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "PlayerInGame",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        refetch,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "GameSession",
          filter: `id=eq.${sessionId}`,
        },
        async (payload) => {
          if (payload.new.status === "active") {
            router.push(`/match/${sessionId}`);
          } else if (payload.new.status === "completed") {
            router.refresh();
          } else if (payload.new.status === "cancelled") {
            router.push("/dashboard");
          }
        },
      )
      .subscribe();

    // Separate channel for pre-match choice sync. If `MatchChoice` isn't in
    // the realtime publication yet, only this channel fails — the main lobby
    // flow is unaffected.
    const choices = supabase
      .channel(`room-${sessionId}-choices`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "MatchChoice" },
        refetch,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "MatchChoice" },
        refetch,
      )
      .subscribe();

    return () => {
      main.unsubscribe();
      choices.unsubscribe();
    };
  }, [sessionId, router]);
  const host = session?.players?.find((p) => p.role === "host");
  const players = session?.players ?? [];
  const me = session?.players?.find((p) => p.profileId === currentUser.id);
  const isHost = me?.role === "host";
  const canStart = players.length >= 2;
  // Pre-match colour matches the in-match seat colour: host first, then by
  // joinedAt — which is the order returned by the page-level query.
  const colorForPlayer = (id: string) => {
    const idx = players.findIndex((p) => p.id === id);
    return PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? "#666";
  };
  const requiredChoiceKeys = MATCH_CHOICES.map((c) => c.key);
  const playerReady = (p: Player) =>
    requiredChoiceKeys.every((k) => p.choices.some((c) => c.key === k));

  if (session?.status === "completed") {
    return (
      <ResultsView
        sessionId={sessionId}
        players={players}
        countries={session.countries}
        events={session.events}
        winnerId={session.winnerId}
        warRound={session.warRound}
        maxRounds={session.maxWarRounds}
        currentPlayerId={me?.id ?? null}
      />
    );
  }

  return (
    <div className="min-h-screen text-white px-4 py-10 flex flex-col items-center gap-4">
      <div className="w-full max-w-lg flex">
        <Link
          href="/dashboard"
          className="text-xs text-gray-400 hover:text-white transition-colors px-4 py-2 border border-[#4f4f4f] rounded-lg"
        >
          ← Back to dashboard
        </Link>
      </div>
      <div className="bg-[#0d0d12]/90 backdrop-blur rounded-2xl p-2 w-full max-w-lg shadow-xl border border-[#4f4f4f]">
        <div className="flex gap-4 items-center p-4 justify-between border-b border-[#2a2a2a]">
          <div className="flex gap-3 items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 448 512"
              className="w-6 h-6 text-[#757575]"
              fill="currentColor"
            >
              <path d="M224 248a120 120 0 1 0 0-240 120 120 0 1 0 0 240zm-29.7 56C95.8 304 16 383.8 16 482.3 16 498.7 29.3 512 45.7 512l356.6 0c16.4 0 29.7-13.3 29.7-29.7 0-98.5-79.8-178.3-178.3-178.3l-59.4 0z" />
            </svg>
            <h1 className="text-xl font-bold">
              {host?.profile?.nickname || "Unknown"}'s lobby
            </h1>
          </div>
          <StatusPill status={session?.status ?? "waiting"} />
        </div>

        <div className="bg-[#1a1a1a] p-5 rounded-xl m-4 flex flex-col gap-5">
          <div className="flex justify-between text-sm text-[#9a9a9a]">
            <h2 className="text-lg font-semibold text-white">Players</h2>
            <p>
              Players: <span className="text-white">{players.length}</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {players.length > 0 ? (
              <div className="flex flex-col gap-2">
                {players.map((p) => {
                  const nick = p.profile?.nickname;
                  const capStyle = p.choices.find(
                    (c) => c.key === "capital_style",
                  );
                  const opt = capStyle
                    ? findChoiceOption("capital_style", capStyle.value)
                    : null;
                  const color = colorForPlayer(p.id);
                  const ready = playerReady(p);
                  return (
                    <div
                      key={p.id}
                      className="flex justify-between items-center gap-3 bg-[#242424] px-3 py-2 rounded-lg border-2"
                      style={{ borderColor: `${color}44` }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold text-black shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {(nick ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          {nick ? (
                            <Link
                              href={`/profile/${encodeURIComponent(nick)}`}
                              target="_blank"
                              className="text-sm font-semibold hover:underline truncate"
                              style={{ color }}
                            >
                              {nick}
                            </Link>
                          ) : (
                            <span className="text-sm font-semibold text-gray-400">
                              No name
                            </span>
                          )}
                          {p.role === "host" && (
                            <span
                              className="text-yellow-400 text-xs"
                              title="Host"
                            >
                              👑
                            </span>
                          )}
                          {opt && (
                            <span
                              className="text-[10px] bg-[#1a1a1a] text-gray-300 border border-[#3a3a3a] rounded-full px-2 py-0.5"
                              title={opt.description}
                            >
                              {opt.emoji} {opt.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] uppercase tracking-widest font-semibold shrink-0 ${
                          ready ? "text-emerald-400" : "text-gray-500"
                        }`}
                      >
                        {ready ? "Ready" : "Picking…"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[#888]">No players connected</p>
            )}
          </div>

          {session?.status === "waiting" && me && (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-white">
                Pre-match choices
              </h2>
              <MatchChoicesPicker
                sessionId={session.id}
                initialSelections={Object.fromEntries(
                  me.choices.map((c) => [c.key, c.value]),
                )}
              />
            </div>
          )}

          {session?.status === "waiting" && isHost && (
            <>
              {canStart ? (
                <StartGameButton sessionId={session.id} />
              ) : (
                <div className="flex items-center gap-4">
                  <StartGameButton sessionId={session.id} disabled={true} />
                  <p className="text-red-400 text-sm">
                    Need at least 2 players
                  </p>
                </div>
              )}
            </>
          )}

          {session?.status === "waiting" && !me && (
            <button
              onClick={async () => {
                await joinGame(session.id);
              }}
              className="w-full bg-blue-400 hover:bg-blue-500 transition-colors text-white px-6 py-2 rounded-lg font-medium"
            >
              Join Game
            </button>
          )}

          {session?.status === "active" && (
            <div className="bg-green-900/40 border border-green-700 text-green-300 px-4 py-2 rounded-lg text-sm">
              Game already started
            </div>
          )}

          <div className="pt-2 border-t border-[#2a2a2a] flex flex-col items-start gap-1">
            <p className="text-[#9a9a9a] text-sm">Invite friends</p>
            <InviteRow sessionId={sessionId} />
          </div>

          {session?.status === "waiting" && me && (
            <form action={leaveLobby} className="flex justify-end">
              <input type="hidden" name="sessionId" value={session.id} />
              <button
                type="submit"
                className="text-xs text-red-300 hover:text-red-200 hover:bg-red-500/10 transition-colors border border-red-500/30 hover:border-red-400/60 rounded-lg px-3 py-1.5"
              >
                {isHost ? "Disband lobby" : "Leave lobby"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// Status pill at the top of the lobby card. Coloured by lifecycle:
//   waiting   → blue   (open for joiners)
//   active    → amber  (match in progress, pulsing dot)
//   completed → green  (showing the post-match summary)
function StatusPill({ status }: { status: string }) {
  const styles: Record<string, { cls: string; dot: string; label: string }> = {
    waiting: {
      cls: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      dot: "bg-blue-400",
      label: "Waiting",
    },
    active: {
      cls: "bg-amber-500/15 text-amber-300 border-amber-400/40",
      dot: "bg-amber-400 animate-pulse",
      label: "In match",
    },
    completed: {
      cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
      dot: "bg-emerald-400",
      label: "Finished",
    },
  };
  const s = styles[status] ?? styles.waiting;
  return (
    <span
      className={`text-xs uppercase tracking-wider border rounded-md px-3 py-1 inline-flex items-center gap-2 ${s.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// Copy-to-clipboard for the full invite URL. We construct it on the client
// (window.location.origin) so it works both in dev and against whatever
// origin the production deploy lands on, without needing an env var.
function InviteRow({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/lobby/${sessionId}`
      : `/lobby/${sessionId}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore (e.g. http context with no clipboard API)
    }
  };
  return (
    <div className="flex items-center gap-2 bg-[#242424] px-3 py-2 rounded-lg border border-[#333] w-full">
      <span className="text-xs text-[#ccc] truncate flex-1" title={inviteUrl}>
        {inviteUrl}
      </span>
      <button
        onClick={copy}
        className={`text-xs px-2 py-1 rounded transition-colors shrink-0 ${
          copied
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white"
        }`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
