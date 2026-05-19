"use client";

// FACEIT-style lobby. Header strip with match label + ready counter +
// invite link + leave/start. Three-column body:
//   - left   : match settings (mostly hardcoded; capital_style is the
//              only real interactive choice today)
//   - centre : 4 player slots (real data) + map preview (visual only)
//   - right  : lobby chat (visual stub — no real chat backend yet)
//
// Realtime sync, join/leave/start actions, and match-choice writes stay
// exactly as they were — only the UI shell is new.

import { useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/supabase/client";
import { joinGame, leaveLobby, setMatchChoice, startGame } from "./actions";
import { inviteFriendToLobby } from "./inviteActions";
import ResultsView from "./ResultsView";
import { MATCH_CHOICES, findChoiceOption } from "@quiz/shared/matchChoices";
import { PLAYER_COLORS } from "@/app/lib/constants";
import { EUROPE_PATHS } from "@/app/lib/europeSvg";
import PanelCard from "@/app/components/ui/PanelCard";
import PillTab from "@/app/components/ui/PillTab";
import Slash from "@/app/components/ui/Slash";
import Hexagon from "@/app/components/ui/Hexagon";
import Avatar from "@/app/components/ui/Avatar";
import FlagTag from "@/app/components/ui/FlagTag";
import Spinner from "@/app/components/ui/Spinner";

interface Player {
  id: string;
  profileId: string;
  role: string;
  // True when the player abandoned (left mid-match) — set from the
  // MatchSnapshot's finalState by the lobby server component when the
  // session has reached "completed". Empty otherwise.
  abandoned?: boolean;
  profile: {
    nickname: string;
    avatarUrl?: string | null;
    level: number;
    elo: number;
    country: string | null;
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

export interface InviteCandidate {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  level: number;
  elo: number;
  country: string | null;
}

interface Props {
  sessionId: string;
  initialSession: GameSession;
  currentUser: {
    id: string;
    userId: string;
  };
  friends: InviteCandidate[];
  invitedIds: string[];
}

const SLOT_COUNT = 4;

export function LobbyContent({
  sessionId,
  initialSession,
  currentUser,
  friends,
  invitedIds,
}: Props) {
  const [session, setSession] = useState(initialSession);
  const router = useRouter();

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

  const players = session?.players ?? [];
  const host = players.find((p) => p.role === "host");
  const me = players.find((p) => p.profileId === currentUser.id);
  const isHost = me?.role === "host";
  const canStart = players.length >= 2;

  const requiredChoiceKeys = MATCH_CHOICES.map((c) => c.key);
  const playerReady = (p: Player) =>
    requiredChoiceKeys.every((k) => p.choices.some((c) => c.key === k));
  const readyCount = players.filter(playerReady).length;

  const colorForPlayer = (id: string) => {
    const idx = players.findIndex((p) => p.id === id);
    return PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? "#666";
  };

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

  // Build a 4-slot array — fill from real players, then pad with nulls.
  const slots: (Player | null)[] = Array.from({ length: SLOT_COUNT }, (_, i) =>
    players[i] ?? null,
  );

  const mySelections: Record<string, string> = Object.fromEntries(
    me?.choices?.map((c) => [c.key, c.value]) ?? [],
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] text-white bg-canvas flex flex-col">
      <LobbyHeaderStrip
        sessionId={sessionId}
        hostNickname={host?.profile?.nickname ?? "Unknown"}
        players={players.length}
        ready={readyCount}
        status={session.status}
        isHost={isHost}
        canStart={canStart}
        isMember={Boolean(me)}
      />

      <div className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <MatchSettingsPanel
            sessionId={sessionId}
            mySelections={mySelections}
            isMember={Boolean(me)}
          />
          {me && session.status === "waiting" && (
            <InviteFriendsPanel
              sessionId={sessionId}
              friends={friends}
              invitedIds={invitedIds}
            />
          )}
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {slots.map((p, i) =>
              p ? (
                <PlayerSlotCard
                  key={p.id}
                  player={p}
                  color={colorForPlayer(p.id)}
                  ready={playerReady(p)}
                  isMe={p.profileId === currentUser.id}
                />
              ) : (
                <EmptySlotCard key={`empty-${i}`} slot={i + 1} />
              ),
            )}
          </div>

          <MapPreviewPanel />
        </div>

        <LobbyChatPanel />
      </div>

      {!me && session.status === "waiting" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
          <JoinPrompt sessionId={sessionId} />
        </div>
      )}
    </div>
  );
}

// ---- Header strip ---------------------------------------------------------

function LobbyHeaderStrip({
  sessionId,
  hostNickname,
  players,
  ready,
  status,
  isHost,
  canStart,
  isMember,
}: {
  sessionId: string;
  hostNickname: string;
  players: number;
  ready: number;
  status: string;
  isHost: boolean;
  canStart: boolean;
  isMember: boolean;
}) {
  const statusLabel =
    status === "active"
      ? "In match"
      : status === "completed"
        ? "Finished"
        : "Waiting";
  const statusColor =
    status === "active"
      ? "var(--color-gold)"
      : status === "completed"
        ? "var(--color-win)"
        : "var(--color-accent)";

  return (
    <div className="border-b border-stroke bg-panel">
      <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap min-w-0">
          <Slash label="Lobby" color="#1ed3ff" />
          <h1 className="font-head text-2xl text-white truncate">
            {hostNickname}'s lobby
          </h1>
          <span className="font-mono text-[11px] text-mute">
            Match #{sessionId.slice(0, 8)}
          </span>
          <div className="hidden sm:block w-px h-5 bg-stroke" />
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
              aria-hidden
            />
            <span
              className="font-head text-[11px]"
              style={{ color: statusColor }}
            >
              {ready} / {players} ready · {statusLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <InviteRow sessionId={sessionId} />
          {isMember && status === "waiting" && (
            <LeaveButtonForm sessionId={sessionId} isHost={isHost} />
          )}
          {isHost && status === "waiting" && (
            <StartButton sessionId={sessionId} disabled={!canStart} />
          )}
        </div>
      </div>
    </div>
  );
}

function InviteRow({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);
  // Server-rendered URL is the absolute path (no origin). After mount we
  // swap in the full origin-qualified URL so the copied value works when
  // pasted into another browser. Storing in state keeps the first client
  // render in sync with the server's, so React never sees a mismatch.
  const [inviteUrl, setInviteUrl] = useState(`/lobby/${sessionId}`);
  useEffect(() => {
    setInviteUrl(`${window.location.origin}/lobby/${sessionId}`);
  }, [sessionId]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore (no clipboard API in some browsers / contexts)
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-2 bg-canvas border border-stroke px-3 py-2 hover:border-mute transition-colors max-w-[280px]"
      title={inviteUrl}
    >
      <span className="font-head text-[10px] text-dim">Invite</span>
      <span className="font-mono text-[11px] text-accent truncate">
        {inviteUrl.replace(/^https?:\/\//, "")}
      </span>
      <span className="font-mono text-[11px] text-mute shrink-0">
        {copied ? "✓" : "⧉"}
      </span>
    </button>
  );
}

function LeaveButtonForm({
  sessionId,
  isHost,
}: {
  sessionId: string;
  isHost: boolean;
}) {
  return (
    <form action={leaveLobby}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <LeaveButton isHost={isHost} />
    </form>
  );
}

function LeaveButton({ isHost }: { isHost: boolean }) {
  const { pending } = useFormStatus();
  const label = pending
    ? isHost
      ? "Disbanding…"
      : "Leaving…"
    : isHost
      ? "Disband"
      : "Leave";
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-1.5 font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute disabled:opacity-60 disabled:cursor-wait transition-colors px-4 py-2"
    >
      {pending && <Spinner size={10} />}
      {label}
    </button>
  );
}

function StartButton({
  sessionId,
  disabled,
}: {
  sessionId: string;
  disabled: boolean;
}) {
  return (
    <form action={startGame}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <button
        type="submit"
        disabled={disabled}
        title={disabled ? "Need at least 2 players" : "Start the match"}
        className="font-head text-sm font-extrabold text-white bg-accent hover:bg-accent-dim disabled:bg-dim disabled:cursor-not-allowed transition-colors px-6 py-2"
        style={{ transform: "skewX(-10deg)" }}
      >
        <span className="inline-block" style={{ transform: "skewX(10deg)" }}>
          Start ▶
        </span>
      </button>
    </form>
  );
}

function JoinPrompt({ sessionId }: { sessionId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="bg-surface border border-stroke px-4 py-3 flex items-center gap-3 shadow-xl shadow-black/40">
      <span className="font-body text-sm text-mute">
        You're not in the lobby yet — join to play.
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => joinGame(sessionId))}
        className="font-head text-xs font-extrabold text-white bg-accent hover:bg-accent-dim disabled:opacity-60 transition-colors px-5 py-2"
        style={{ transform: "skewX(-10deg)" }}
      >
        <span className="inline-block" style={{ transform: "skewX(10deg)" }}>
          {pending ? "Joining…" : "Join lobby"}
        </span>
      </button>
    </div>
  );
}

// ---- Settings panel -------------------------------------------------------

const HARDCODED_SETTINGS: { label: string; value: string; locked: boolean }[] = [
  { label: "Game mode", value: "Classic 4P", locked: true },
  { label: "Map", value: "Europe (full)", locked: true },
  { label: "Question pool", value: "Geography · Hard", locked: true },
  { label: "Capitals timer", value: "30s", locked: true },
  { label: "Expand timer", value: "10s + 15s pick", locked: true },
  { label: "War timer", value: "8s", locked: true },
  { label: "Starting armies", value: "3", locked: true },
  { label: "ELO range", value: "±200", locked: true },
];

function MatchSettingsPanel({
  sessionId,
  mySelections,
  isMember,
}: {
  sessionId: string;
  mySelections: Record<string, string>;
  isMember: boolean;
}) {
  return (
    <PanelCard title="Match settings" accent="#1ed3ff" padded={false}>
      <div className="flex flex-col">
        {HARDCODED_SETTINGS.map((s) => (
          <SettingRow key={s.label} {...s} />
        ))}
      </div>

      {isMember && (
        <div className="border-t border-stroke px-4 py-3 flex flex-col gap-2.5">
          <span className="font-head text-[10px] text-dim">Your picks</span>
          {MATCH_CHOICES.map((card) => (
            <ChoiceRow
              key={card.key}
              sessionId={sessionId}
              cardKey={card.key}
              title={card.title}
              options={card.options}
              selected={mySelections[card.key] ?? null}
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

function SettingRow({
  label,
  value,
  locked,
}: {
  label: string;
  value: string;
  locked: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-stroke first:border-t-0">
      <span className="font-head text-[10px] text-mute">{label}</span>
      <span className="flex items-center gap-1 font-mono text-[11px] text-mute">
        {value}
        <span className="text-dim text-[10px]">{locked ? "🔒" : "▾"}</span>
      </span>
    </div>
  );
}

function ChoiceRow({
  sessionId,
  cardKey,
  title,
  options,
  selected,
}: {
  sessionId: string;
  cardKey: string;
  title: string;
  options: { value: string; emoji: string; label: string; description: string }[];
  selected: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(selected);

  useEffect(() => {
    setOptimistic(selected);
  }, [selected]);

  const handlePick = (value: string) => {
    if (optimistic === value) return;
    setOptimistic(value);
    startTransition(() => {
      setMatchChoice(sessionId, cardKey, value);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-head text-[10px] text-mute">{title}</span>
        {pending && (
          <span className="font-mono text-[10px] text-dim italic">saving…</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const isPicked = optimistic === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handlePick(opt.value)}
              className="text-left px-2 py-1.5 border transition-colors"
              style={{
                borderColor: isPicked
                  ? "var(--color-accent)"
                  : "var(--color-stroke)",
                background: isPicked
                  ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                  : "transparent",
              }}
              title={opt.description}
            >
              <span className="font-head text-[11px] text-white flex items-center gap-1.5">
                <span aria-hidden>{opt.emoji}</span>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Player slots ---------------------------------------------------------

function PlayerSlotCard({
  player,
  color,
  ready,
  isMe,
}: {
  player: Player;
  color: string;
  ready: boolean;
  isMe: boolean;
}) {
  const choice = player.choices.find((c) => c.key === "capital_style");
  const choiceOpt = choice ? findChoiceOption("capital_style", choice.value) : null;
  const isHost = player.role === "host";

  return (
    <div
      className="relative bg-surface border flex flex-col overflow-hidden"
      style={{ borderColor: ready ? "var(--color-win)" : "var(--color-stroke)" }}
    >
      <span
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: color }}
        aria-hidden
      />

      <div className="px-3 pt-5 pb-3 flex flex-col items-center gap-1.5 border-b border-stroke text-center">
        <div className="relative inline-block">
          <Avatar
            nickname={player.profile.nickname}
            avatarUrl={player.profile.avatarUrl ?? null}
            size={64}
            shape="square"
            color={color}
          />
          <div className="absolute -right-2 -bottom-2">
            <Hexagon
              value={player.profile.level}
              size={28}
              color="#1ed3ff"
              textColor="#ffffff"
            />
          </div>
        </div>
        <Link
          href={`/profile/${encodeURIComponent(player.profile.nickname)}`}
          target="_blank"
          className="font-head text-sm text-white hover:text-accent transition-colors mt-1 truncate max-w-full"
        >
          {player.profile.nickname.toUpperCase()}
          {isMe && (
            <span className="font-mono text-[10px] text-dim ml-1">(you)</span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          <FlagTag code={player.profile.country} />
          <span className="font-mono text-[11px] text-accent font-bold">
            {player.profile.elo.toLocaleString()} ELO
          </span>
        </div>
        {isHost && (
          <div className="mt-1">
            <Slash label="Host" color="#ffc24a" dark />
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 flex flex-col gap-1">
        <span className="font-head text-[9px] text-dim">Capital</span>
        <span className="font-mono text-[11px] text-mute">
          {choiceOpt ? `${choiceOpt.emoji} ${choiceOpt.label}` : "Not picked"}
        </span>
      </div>

      <div
        className="font-head text-[11px] text-center py-2 mt-auto border-t border-stroke"
        style={{
          background: ready
            ? "color-mix(in srgb, var(--color-win) 15%, transparent)"
            : "var(--color-panel)",
          color: ready ? "var(--color-win)" : "var(--color-mute)",
        }}
      >
        {ready ? "✓ Ready" : "Picking…"}
      </div>
    </div>
  );
}

function EmptySlotCard({ slot }: { slot: number }) {
  return (
    <div className="bg-panel border border-dashed border-stroke flex flex-col items-center justify-center gap-3 py-8 text-center">
      <Hexagon
        value="?"
        size={36}
        variant="outlined"
        color="var(--color-dim)"
        textColor="var(--color-dim)"
      />
      <span className="font-head text-[11px] text-dim">Slot {slot}</span>
      <span className="font-mono text-[10px] text-dim">Waiting for player…</span>
    </div>
  );
}

// ---- Map preview ----------------------------------------------------------

function MapPreviewPanel() {
  return (
    <PanelCard
      title="Map preview · Europe"
      accent="#7c8aff"
      padded={false}
      right={
        <span className="font-mono text-[10px] text-dim">
          12 countries · 4 starting capitals
        </span>
      }
    >
      <div className="relative bg-panel h-[220px] px-3 py-3">
        <svg
          viewBox="320 320 400 310"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
        >
          {EUROPE_PATHS.map((c) => (
            <path
              key={c.svgId}
              d={c.d}
              fill="var(--color-surface-hi)"
              stroke="var(--color-canvas)"
              strokeWidth="0.4"
            />
          ))}
        </svg>
        <div className="absolute left-4 bottom-3 font-mono text-[10px] text-dim">
          Capitals will be auto-assigned by ELO order
        </div>
      </div>
    </PanelCard>
  );
}

// ---- Chat panel (visual stub — no backend yet) ----------------------------

const STUB_CHAT: { who: string; text: string; time: string; system?: boolean }[] = [
  { who: "System", text: "Lobby created — waiting for players.", time: "--:--", system: true },
  { who: "System", text: "Real chat is coming with the friends release.", time: "--:--", system: true },
];

function LobbyChatPanel() {
  return (
    <PanelCard
      title="Lobby chat"
      accent="#3fcf6c"
      padded={false}
      right={
        <div className="flex">
          <PillTab label="Chat" active />
          <PillTab label="Team" dim />
        </div>
      }
    >
      <div className="flex flex-col h-[520px]">
        <div className="flex-1 px-3 py-3 flex flex-col gap-2 overflow-auto">
          {STUB_CHAT.map((msg, i) => (
            <div key={i} className="font-body text-xs leading-snug">
              {msg.system ? (
                <div className="text-center text-dim font-mono text-[11px]">
                  — {msg.text} —
                </div>
              ) : (
                <>
                  <span className="font-head text-[10px] text-accent">
                    {msg.who.toUpperCase()}
                  </span>
                  <span className="font-mono text-[10px] text-dim ml-2">
                    {msg.time}
                  </span>
                  <div className="text-white mt-0.5">{msg.text}</div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-stroke px-2 py-2 flex gap-1.5">
          <input
            type="text"
            placeholder="Say something…"
            disabled
            className="flex-1 bg-canvas border border-stroke px-2.5 py-1.5 font-body text-xs text-mute placeholder:text-dim outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            disabled
            className="font-head text-[11px] text-mute bg-stroke px-3 py-1.5 cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </PanelCard>
  );
}

// ---- Invite friends panel ------------------------------------------------

function InviteFriendsPanel({
  sessionId,
  friends,
  invitedIds,
}: {
  sessionId: string;
  friends: InviteCandidate[];
  invitedIds: string[];
}) {
  // Track who we've invited in this session (server set + optimistic local).
  const [invited, setInvited] = useState<Set<string>>(
    () => new Set(invitedIds),
  );
  return (
    <PanelCard
      title={`Invite friends · ${friends.length}`}
      accent="#3fcf6c"
      padded={false}
    >
      {friends.length === 0 ? (
        <p className="font-body text-xs text-dim text-center py-6 px-4">
          No friends to invite — add some on the friends page.
        </p>
      ) : (
        <div>
          {friends.map((f) => (
            <InviteFriendRow
              key={f.id}
              sessionId={sessionId}
              friend={f}
              alreadyInvited={invited.has(f.id)}
              onInvited={() =>
                setInvited((prev) => new Set(prev).add(f.id))
              }
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

function InviteFriendRow({
  sessionId,
  friend,
  alreadyInvited,
  onInvited,
}: {
  sessionId: string;
  friend: InviteCandidate;
  alreadyInvited: boolean;
  onInvited: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const invite = () => {
    startTransition(async () => {
      const r = await inviteFriendToLobby(friend.id, sessionId);
      if (r.ok) {
        onInvited();
        setError(null);
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <div className="grid grid-cols-[28px_1fr_auto] gap-2.5 items-center px-3 py-2 border-t border-stroke first:border-t-0">
      <Hexagon
        value={friend.level}
        size={26}
        variant="outlined"
        color="var(--color-accent)"
        textColor="var(--color-accent)"
      />
      <div className="flex items-center gap-2 min-w-0">
        <Avatar
          nickname={friend.nickname}
          avatarUrl={friend.avatarUrl}
          size={26}
          shape="square"
        />
        <div className="min-w-0 flex flex-col leading-tight">
          <Link
            href={`/profile/${encodeURIComponent(friend.nickname)}`}
            target="_blank"
            className="font-head text-[11px] text-white hover:text-accent truncate transition-colors"
          >
            {friend.nickname.toUpperCase()}
          </Link>
          <div className="flex items-center gap-2">
            <FlagTag code={friend.country} />
            <span className="font-mono text-[10px] text-dim">
              {friend.elo.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
      {alreadyInvited ? (
        <span className="font-head text-[10px] text-win">SENT ✓</span>
      ) : (
        <button
          type="button"
          onClick={invite}
          disabled={pending}
          title={error ?? "Invite to this lobby"}
          className="font-head text-[10px] font-extrabold text-accent-fg bg-accent hover:bg-accent-dim disabled:opacity-60 transition-colors px-3 py-1.5"
        >
          {pending ? "…" : "Invite"}
        </button>
      )}
    </div>
  );
}
