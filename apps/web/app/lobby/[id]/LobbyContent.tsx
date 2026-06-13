"use client";

// FACEIT-style lobby. Header strip with match label + ready counter +
// copyable lobby code + leave/start. Three-column body:
//   - left   : match settings (mostly hardcoded; capital_style is the
//              only real interactive choice today)
//   - centre : N player slots (real data) + map preview. Empty slots
//              are buttons that open a friends-invite modal.
//   - right  : lobby chat — real, backed by LobbyChatMessage rows
//              with Supabase Realtime INSERT triggers
//
// Realtime sync, join/leave/start actions, and match-choice writes stay
// exactly as they were — only the UI shell is new.

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/supabase/client";
import {
  joinGame,
  kickFromLobby,
  leaveLobby,
  sendLobbyMessage,
  setLobbyCategories,
  setLobbyRanked,
  setLobbyTimers,
  setMatchChoice,
  startGame,
} from "./actions";
import {
  CAPITALS_TIMER_PRESETS,
  CATEGORY_LABEL,
  EXPAND_TIMER_PRESETS,
  QUESTION_CATEGORIES,
  WAR_TIMER_PRESETS,
  type QuestionCategoryKey,
} from "@quiz/shared/lobbySettings";
import { cancelLobbyInvite, inviteFriendToLobby } from "./inviteActions";
import ResultsView from "./ResultsView";
import { MATCH_CHOICES, findChoiceOption } from "@quiz/shared/matchChoices";
import { PLAYER_COLORS } from "@/app/lib/constants";
import { EUROPE_PATHS } from "@/app/lib/europeSvg";
import PanelCard from "@/app/components/ui/PanelCard";
import Slash from "@/app/components/ui/Slash";
import Hexagon from "@/app/components/ui/Hexagon";
import Avatar from "@/app/components/ui/Avatar";
import FlagTag from "@/app/components/ui/FlagTag";
import Spinner from "@/app/components/ui/Spinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark, faPaperPlane } from "@fortawesome/free-solid-svg-icons";

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
  maxPlayers: number;
  ranked: boolean;
  capitalsTimerSec: number;
  expandTimerSec: number;
  warTimerSec: number;
  categories: string[];
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

export interface PendingInvite {
  inviteId: string;
  profile: InviteCandidate;
  expiresAt: string;
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
  pendingInvites: PendingInvite[];
}


export function LobbyContent({
  sessionId,
  initialSession,
  currentUser,
  friends,
  invitedIds,
  pendingInvites,
}: Props) {
  const [session, setSession] = useState(initialSession);
  const [invited, setInvited] = useState<Set<string>>(
    () => new Set(invitedIds),
  );
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const router = useRouter();

  // playerInGame ids currently in THIS lobby. MatchChoice realtime rows
  // only carry playerInGameId (no gameSessionId column), so we can't
  // scope the Supabase subscription server-side — instead we filter
  // incoming choice events against this set so a choice change in some
  // other lobby doesn't trigger a refetch here. Kept in a ref so the
  // long-lived subscription closure always reads the current set.
  const lobbyPlayerIdsRef = useRef<Set<string>>(
    new Set(initialSession.players.map((p) => p.id)),
  );

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  useEffect(() => {
    lobbyPlayerIdsRef.current = new Set(session.players.map((p) => p.id));
  }, [session.players]);

  useEffect(() => {
    const supabase = createClient();

    const refetch = async () => {
      const response = await fetch(`/api/sessions/${sessionId}`);
      const freshSession = await response.json();
      setSession((prev) => ({ ...prev, ...freshSession }));
    };

    // Only refetch for a MatchChoice change that belongs to a player in
    // this lobby. An unknown id is either another lobby (ignore) or a
    // brand-new player whose join INSERT will refetch us anyway.
    const refetchIfMine = (payload: { new?: { playerInGameId?: string } }) => {
      const pigId = payload.new?.playerInGameId;
      if (pigId && lobbyPlayerIdsRef.current.has(pigId)) refetch();
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
          event: "DELETE",
          schema: "public",
          table: "PlayerInGame",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        async (payload) => {
          // If the deleted row was the current viewer's seat (host
          // kicked us), drop back to the dashboard. Otherwise pull a
          // fresh roster so the empty slot reappears.
          const oldProfileId =
            (payload.old as { profileId?: string } | null)?.profileId;
          if (oldProfileId === currentUser.id) {
            router.push("/dashboard");
            return;
          }
          refetch();
        },
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
            return;
          }
          if (payload.new.status === "completed") {
            router.refresh();
            return;
          }
          if (payload.new.status === "cancelled") {
            router.push("/dashboard");
            return;
          }
          // Settings change (ranked toggle, timers, categories) —
          // pull fresh fields so the panel reflects the host's edit
          // without a hard reload.
          refetch();
        },
      )
      .subscribe();

    const choices = supabase
      .channel(`room-${sessionId}-choices`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "MatchChoice" },
        refetchIfMine,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "MatchChoice" },
        refetchIfMine,
      )
      .subscribe();

    // LobbyInvite is rendered out-of-band (initial fetch in page.tsx),
    // so live updates have to bubble through the RSC tree —
    // router.refresh() repulls pendingInvites without doing a hard
    // navigation.
    const invites = supabase
      .channel(`room-${sessionId}-invites`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "LobbyInvite",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      main.unsubscribe();
      choices.unsubscribe();
      invites.unsubscribe();
    };
  }, [sessionId, router, currentUser.id]);

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

  // Build the slot array: real players first, then any active invites
  // (each invite reserves a slot so it visually fills a card with a
  // pending state), then empty slots padding out to maxPlayers. Capped
  // at maxPlayers so an over-booked DB row can't blow the layout.
  type Slot =
    | { kind: "player"; player: Player }
    | { kind: "invite"; invite: PendingInvite }
    | { kind: "empty" };
  const slots: Slot[] = [];
  for (const p of players) slots.push({ kind: "player", player: p });
  for (const inv of pendingInvites) {
    if (slots.length >= session.maxPlayers) break;
    if (players.some((p) => p.profileId === inv.profile.id)) continue;
    slots.push({ kind: "invite", invite: inv });
  }
  while (slots.length < session.maxPlayers) slots.push({ kind: "empty" });

  const mySelections: Record<string, string> = Object.fromEntries(
    me?.choices?.map((c) => [c.key, c.value]) ?? [],
  );

  return (
    <div className="h-[calc(100vh-4rem)] text-white bg-canvas flex flex-col overflow-hidden">
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

      <div className="flex-1 min-h-0 max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-3 grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-3 overflow-hidden">
        <div className="min-h-0 overflow-auto">
          <MatchSettingsPanel
            sessionId={sessionId}
            session={session}
            isHost={isHost}
          />
        </div>

        <div className="flex flex-col gap-3 min-w-0 min-h-0 overflow-auto">
          {me && session.status === "waiting" && (
            <CapitalStylePrompt
              sessionId={sessionId}
              selected={mySelections.capital_style ?? null}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {slots.map((s, i) => {
              if (s.kind === "player") {
                return (
                  <PlayerSlotCard
                    key={s.player.id}
                    sessionId={sessionId}
                    player={s.player}
                    color={colorForPlayer(s.player.id)}
                    ready={playerReady(s.player)}
                    isMe={s.player.profileId === currentUser.id}
                    canKick={
                      isHost &&
                      session.status === "waiting" &&
                      s.player.role !== "host"
                    }
                  />
                );
              }
              if (s.kind === "invite") {
                return (
                  <InvitedSlotCard
                    key={s.invite.inviteId}
                    invite={s.invite}
                    canCancel={isHost && session.status === "waiting"}
                  />
                );
              }
              return (
                <EmptySlotCard
                  key={`empty-${i}`}
                  slot={i + 1}
                  canInvite={Boolean(me) && session.status === "waiting"}
                  onInvite={() => setInviteModalOpen(true)}
                />
              );
            })}
          </div>

          <MapPreviewPanel />
        </div>

        <LobbyChatPanel
          sessionId={sessionId}
          currentProfileId={currentUser.id}
          isMember={Boolean(me)}
        />
      </div>

      {!me && session.status === "waiting" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
          <JoinPrompt sessionId={sessionId} />
        </div>
      )}

      {inviteModalOpen && (
        <InviteFriendsModal
          sessionId={sessionId}
          friends={friends}
          invited={invited}
          onClose={() => setInviteModalOpen(false)}
          onInvited={(id) =>
            setInvited((prev) => new Set(prev).add(id))
          }
        />
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
  // While waiting we surface "need more players" the moment the lobby
  // is below the 2-player floor — that's a stronger signal than the
  // ready counter, which reads as "all ready" when the host is alone.
  const needsMorePlayers = status === "waiting" && players < 2;
  const statusLabel =
    status === "active"
      ? "In match"
      : status === "completed"
        ? "Finished"
        : needsMorePlayers
          ? "Need 2+ players"
          : "Waiting";
  const statusColor =
    status === "active"
      ? "var(--color-gold)"
      : status === "completed"
        ? "var(--color-win)"
        : needsMorePlayers
          ? "var(--color-gold)"
          : "var(--color-accent)";

  return (
    <div className="border-b border-stroke bg-panel">
      <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap min-w-0">
          <Slash label="Lobby" color="#1ed3ff" />
          <h1 className="font-head text-2xl text-white truncate">
            {hostNickname}&apos;s lobby
          </h1>
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
              {needsMorePlayers
                ? statusLabel
                : `${ready} / ${players} ready · ${statusLabel}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <InviteCode sessionId={sessionId} />
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

function InviteCode({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
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
      className="flex items-center gap-2 bg-canvas border border-stroke px-3 py-2 hover:border-mute transition-colors"
      title="Click to copy the lobby code"
    >
      <span className="font-head text-[10px] text-dim">Code</span>
      <span className="font-mono text-[11px] text-accent">
        {sessionId.slice(0, 8)}
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
  const [confirming, setConfirming] = useState(false);
  // Guests just leave — they aren't the host so disbanding the lobby
  // isn't their decision. Disband for the host needs an explicit
  // "are you sure" because it kicks every guest out at once.
  if (!isHost) {
    return (
      <form action={leaveLobby}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <LeaveButton isHost={false} />
      </form>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-4 py-2"
      >
        Disband
      </button>
      {confirming && (
        <DisbandConfirmModal
          sessionId={sessionId}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

function DisbandConfirmModal({
  sessionId,
  onCancel,
}: {
  sessionId: string;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);
  if (!mounted) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disband-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <style>{`
        @keyframes disband-modal-in {
          0%   { opacity: 0; transform: scale(0.94) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .disband-modal-card { animation: disband-modal-in 0.2s ease-out forwards; }
      `}</style>
      <div
        className="disband-modal-card w-full max-w-md bg-surface border border-stroke shadow-2xl shadow-black/80 flex flex-col"
        style={{ borderTop: "4px solid var(--color-lose)" }}
      >
        <div className="px-6 py-5 border-b border-stroke">
          <span className="font-head text-xs text-lose">Confirm</span>
          <h2
            id="disband-modal-title"
            className="font-head text-3xl text-white leading-tight mt-1"
          >
            DISBAND LOBBY?
          </h2>
        </div>
        <div className="px-6 py-5 font-body text-base text-mute leading-relaxed">
          Every guest will be kicked back to their dashboard and the
          lobby will close. This can&apos;t be undone.
        </div>
        <div className="flex border-t border-stroke">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 font-head text-sm text-mute hover:text-white hover:bg-surface-hi px-5 py-4 transition-colors"
          >
            Cancel
          </button>
          <form action={leaveLobby} className="flex-1 border-l border-stroke">
            <input type="hidden" name="sessionId" value={sessionId} />
            <DisbandSubmit />
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DisbandSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full font-head text-sm font-extrabold text-white bg-lose hover:opacity-90 disabled:opacity-70 px-5 py-4 transition-opacity flex items-center justify-center gap-2"
    >
      {pending && <Spinner size={12} />}
      {pending ? "Disbanding…" : "Disband"}
    </button>
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
        You&apos;re not in the lobby yet — join to play.
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

function MatchSettingsPanel({
  sessionId,
  session,
  isHost,
}: {
  sessionId: string;
  session: GameSession;
  isHost: boolean;
}) {
  const router = useRouter();
  const ranked = session.ranked;
  // Active categories: empty array = all enabled.
  const activeCategories = new Set<string>(
    session.categories.length > 0
      ? session.categories
      : (QUESTION_CATEGORIES as readonly string[]),
  );
  const hostEditable = isHost && session.status === "waiting" && !ranked;
  const switchMode = async (next: boolean) => {
    if (!isHost || session.status !== "waiting") return;
    if (next === ranked) return;
    await setLobbyRanked(sessionId, next);
    // Refetch fresh server state — covers the case where the realtime
    // publication for GameSession isn't enabled for the host's own
    // edit (Supabase echoes UPDATEs to all subscribers, but only when
    // the table is in supabase_realtime).
    router.refresh();
  };

  return (
    <PanelCard title="Match settings" accent="#1ed3ff" padded={false}>
      <div className="flex border-b border-stroke">
        <ModeTab
          label="Ranked"
          active={ranked}
          interactive={isHost && session.status === "waiting"}
          onClick={() => switchMode(true)}
        />
        <ModeTab
          label="Custom"
          active={!ranked}
          interactive={isHost && session.status === "waiting"}
          onClick={() => switchMode(false)}
        />
      </div>

      <div className="flex flex-col">
        <SettingRow
          label="Reward"
          value={ranked ? "ELO + XP + coins" : "XP + coins"}
        />
      </div>

      <div className="border-t border-stroke px-4 py-3 flex items-center justify-between">
        <span className="font-head text-[10px] text-mute">Timers</span>
        {!hostEditable && (
          <span className="font-mono text-[10px] text-dim">read-only</span>
        )}
      </div>
      <div className="flex flex-col border-t border-stroke">
        <TimerRow
          sessionId={sessionId}
          label="Capitals"
          value={session.capitalsTimerSec}
          presets={CAPITALS_TIMER_PRESETS}
          editable={hostEditable}
          field="capitalsTimerSec"
        />
        <TimerRow
          sessionId={sessionId}
          label="Expand"
          value={session.expandTimerSec}
          presets={EXPAND_TIMER_PRESETS}
          editable={hostEditable}
          field="expandTimerSec"
        />
        <TimerRow
          sessionId={sessionId}
          label="War"
          value={session.warTimerSec}
          presets={WAR_TIMER_PRESETS}
          editable={hostEditable}
          field="warTimerSec"
        />
      </div>

      <div className="border-t border-stroke px-4 py-3 flex items-center justify-between">
        <span className="font-head text-[10px] text-mute">Categories</span>
        <span className="font-mono text-[10px] text-dim">
          {activeCategories.size} / {QUESTION_CATEGORIES.length}
        </span>
      </div>
      <CategoriesEditor
        sessionId={sessionId}
        active={activeCategories}
        editable={hostEditable}
      />
    </PanelCard>
  );
}

function ModeTab({
  label,
  active,
  interactive,
  onClick,
}: {
  label: string;
  active: boolean;
  interactive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className="flex-1 font-head text-[11px] py-2.5 transition-colors disabled:cursor-default"
      style={{
        color: active ? "var(--color-white)" : "var(--color-mute)",
        background: active
          ? "color-mix(in srgb, var(--color-accent) 16%, transparent)"
          : "transparent",
        borderBottom: active
          ? "2px solid var(--color-accent)"
          : "2px solid transparent",
      }}
    >
      {label.toUpperCase()}
    </button>
  );
}

function SettingRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-stroke first:border-t-0">
      <span className="font-head text-[10px] text-mute">{label}</span>
      <span className="font-mono text-[11px] text-white">{value}</span>
    </div>
  );
}

function TimerRow({
  sessionId,
  label,
  value,
  presets,
  editable,
  field,
}: {
  sessionId: string;
  label: string;
  value: number;
  presets: readonly number[];
  editable: boolean;
  field: "capitalsTimerSec" | "expandTimerSec" | "warTimerSec";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // pendingValue overrides the server `value` prop until the
  // server-confirmed timer catches up — same race-avoidance trick as
  // CapitalStylePrompt: useTransition's pending flips false the moment
  // the action resolves, but the realtime refetch chain hasn't yet
  // refreshed `value`, so a naive sync would flicker the chip back.
  const [pendingValue, setPendingValue] = useState<number | null>(null);
  useEffect(() => {
    if (pendingValue !== null && value === pendingValue) {
      setPendingValue(null);
    }
  }, [value, pendingValue]);
  const display = pendingValue ?? value;
  const pick = (v: number) => {
    if (v === display) return;
    setPendingValue(v);
    startTransition(async () => {
      await setLobbyTimers(sessionId, { [field]: v });
      router.refresh();
    });
  };
  if (!editable) {
    return (
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-stroke first:border-t-0">
        <span className="font-head text-[10px] text-mute">{label}</span>
        <span className="font-mono text-[11px] text-white">{display}s</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 px-4 py-2.5 border-t border-stroke first:border-t-0">
      <div className="flex items-center justify-between">
        <span className="font-head text-[10px] text-mute">{label}</span>
        {pending && (
          <span className="font-mono text-[10px] text-dim italic">saving…</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => {
          const isPicked = display === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => pick(p)}
              disabled={pending}
              className="font-mono text-[10px] px-2 py-1 border transition-colors disabled:opacity-70"
              style={{
                borderColor: isPicked
                  ? "var(--color-accent)"
                  : "var(--color-stroke)",
                background: isPicked
                  ? "color-mix(in srgb, var(--color-accent) 14%, transparent)"
                  : "transparent",
                color: isPicked ? "var(--color-white)" : "var(--color-mute)",
              }}
            >
              {p}s
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoriesEditor({
  sessionId,
  active,
  editable,
}: {
  sessionId: string;
  active: Set<string>;
  editable: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // pendingSet wins over the server `active` prop until the server-
  // confirmed set catches up — same trick as CapitalStylePrompt /
  // TimerRow. useTransition's `pending` flips false the moment the
  // action's promise resolves, but Supabase realtime + refetch may
  // still be in flight; without this guard the checkbox would briefly
  // flicker back to its old value before the new state lands.
  const [pendingSet, setPendingSet] = useState<Set<string> | null>(null);
  const activeKey = [...active].sort().join(",");
  useEffect(() => {
    if (pendingSet === null) return;
    const pendingKey = [...pendingSet].sort().join(",");
    if (pendingKey === activeKey) setPendingSet(null);
  }, [activeKey, pendingSet]);
  const display = pendingSet ?? active;

  const toggle = (cat: QuestionCategoryKey) => {
    if (!editable) return;
    const next = new Set(display);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    if (next.size === 0) {
      setError("Pick at least one category.");
      return;
    }
    setError(null);
    setPendingSet(next);
    startTransition(async () => {
      const r = await setLobbyCategories(sessionId, [...next]);
      if (!r.ok) {
        setError(r.error);
        setPendingSet(null);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="border-t border-stroke px-4 py-3 flex flex-col gap-1.5">
      {error && (
        <span className="font-mono text-[10px] text-lose">{error}</span>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {QUESTION_CATEGORIES.map((cat) => {
          const checked = display.has(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggle(cat)}
              disabled={!editable}
              className="flex items-center gap-2 text-left px-2 py-1.5 border transition-colors disabled:cursor-default"
              style={{
                borderColor: checked
                  ? "var(--color-accent)"
                  : "var(--color-stroke)",
                background: checked
                  ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                  : "transparent",
              }}
            >
              <span
                className="w-3 h-3 border inline-flex items-center justify-center shrink-0"
                style={{
                  borderColor: checked
                    ? "var(--color-accent)"
                    : "var(--color-stroke)",
                  background: checked
                    ? "var(--color-accent)"
                    : "transparent",
                }}
                aria-hidden
              >
                {checked && (
                  <span className="font-head text-[8px] text-white">✓</span>
                )}
              </span>
              <span
                className="font-head text-[10px]"
                style={{
                  color: checked
                    ? "var(--color-white)"
                    : "var(--color-mute)",
                }}
              >
                {CATEGORY_LABEL[cat]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


// ---- Capital style prompt (shown above slots until player picks) ---------

function CapitalStylePrompt({
  sessionId,
  selected,
}: {
  sessionId: string;
  selected: string | null;
}) {
  const card = MATCH_CHOICES.find((c) => c.key === "capital_style");
  const [pending, startTransition] = useTransition();
  // pendingPick wins over the server `selected` prop until the
  // server-confirmed value catches up. This avoids the classic race
  // where useTransition's `pending` flips to false the moment the
  // action's promise resolves, but the realtime + refetch chain
  // hasn't repopulated `selected` yet — so a naive sync useEffect
  // briefly reverts the choice before the new value lands.
  const [pendingPick, setPendingPick] = useState<string | null>(null);
  useEffect(() => {
    if (pendingPick !== null && selected === pendingPick) {
      setPendingPick(null);
    }
  }, [selected, pendingPick]);
  const display = pendingPick ?? selected;
  if (!card) return null;

  const pick = (value: string) => {
    if (display === value) return;
    setPendingPick(value);
    startTransition(async () => {
      await setMatchChoice(sessionId, "capital_style", value);
    });
  };

  const accent = display ? "var(--color-win)" : "var(--color-gold)";
  const glow = display
    ? "rgba(63,207,108,0.30)"
    : "rgba(255,194,74,0.35)";
  return (
    <section
      className="relative bg-gradient-to-br from-surface-hi via-surface to-surface border border-stroke overflow-hidden transition-colors"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-20 transition-opacity"
        style={{
          background: `radial-gradient(circle at 80% 0%, ${glow}, transparent 55%)`,
        }}
        aria-hidden
      />
      <div className="relative p-3 sm:p-3.5 flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-head text-sm text-white leading-tight">
            CHOOSE YOUR CAPITAL STYLE
          </h2>
          <span
            className="font-head text-[10px]"
            style={{
              color: display
                ? "var(--color-win)"
                : "var(--color-gold)",
            }}
          >
            {display ? "✓ Ready" : "Required to be ready"}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {card.options.map((opt) => {
            const isPicked = display === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => pick(opt.value)}
                disabled={pending}
                className="text-left px-3 py-2 border transition-colors disabled:opacity-70"
                style={{
                  borderColor: isPicked
                    ? "var(--color-accent)"
                    : "var(--color-stroke)",
                  background: isPicked
                    ? "color-mix(in srgb, var(--color-accent) 14%, transparent)"
                    : "var(--color-panel)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base" aria-hidden>{opt.emoji}</span>
                  <span className="font-head text-xs text-white">
                    {opt.label.toUpperCase()}
                  </span>
                </div>
                <p className="font-mono text-[10px] text-dim mt-1 leading-snug">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---- Player slots ---------------------------------------------------------

function PlayerSlotCard({
  sessionId,
  player,
  color,
  ready,
  isMe,
  canKick,
}: {
  sessionId: string;
  player: Player;
  color: string;
  ready: boolean;
  isMe: boolean;
  canKick: boolean;
}) {
  const choice = player.choices.find((c) => c.key === "capital_style");
  const choiceOpt = choice ? findChoiceOption("capital_style", choice.value) : null;
  const isHost = player.role === "host";
  const [kickModal, setKickModal] = useState(false);

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

      {canKick && (
        <button
          type="button"
          onClick={() => setKickModal(true)}
          aria-label={`Kick ${player.profile.nickname}`}
          title="Kick player"
          className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center text-mute hover:text-lose border border-stroke hover:border-lose transition-colors z-10"
        >
          <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
        </button>
      )}

      {kickModal && (
        <KickConfirmModal
          sessionId={sessionId}
          playerInGameId={player.id}
          nickname={player.profile.nickname}
          onClose={() => setKickModal(false)}
        />
      )}

      <div className="px-3 pt-4 pb-2 flex flex-col items-center gap-1 border-b border-stroke text-center">
        <div className="relative inline-block">
          <Avatar
            nickname={player.profile.nickname}
            avatarUrl={player.profile.avatarUrl ?? null}
            size={52}
            shape="square"
            color={color}
          />
          <div className="absolute -right-2 -bottom-2">
            <Hexagon
              value={player.profile.level}
              size={24}
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

function KickConfirmModal({
  sessionId,
  playerInGameId,
  nickname,
  onClose,
}: {
  sessionId: string;
  playerInGameId: string;
  nickname: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (!mounted) return null;

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const r = await kickFromLobby(sessionId, playerInGameId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kick-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes kick-modal-in {
          0%   { opacity: 0; transform: scale(0.94) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .kick-modal-card { animation: kick-modal-in 0.2s ease-out forwards; }
      `}</style>
      <div
        className="kick-modal-card w-full max-w-md bg-surface border border-stroke shadow-2xl shadow-black/80 flex flex-col"
        style={{ borderTop: "4px solid var(--color-lose)" }}
      >
        <div className="px-6 py-5 border-b border-stroke">
          <span className="font-head text-xs text-lose">Confirm</span>
          <h2
            id="kick-modal-title"
            className="font-head text-3xl text-white leading-tight mt-1"
          >
            KICK PLAYER?
          </h2>
        </div>
        <div className="px-6 py-5 font-body text-base text-mute leading-relaxed">
          <span className="text-white font-semibold">
            {nickname.toUpperCase()}
          </span>{" "}
          will be removed from the lobby. You can re-invite them after.
        </div>
        {error && (
          <div className="px-6 -mt-2 pb-3 font-mono text-[11px] text-lose">
            {error}
          </div>
        )}
        <div className="flex border-t border-stroke">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 font-head text-sm text-mute hover:text-white hover:bg-surface-hi px-5 py-4 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="flex-1 font-head text-sm font-extrabold text-white bg-lose hover:opacity-90 disabled:opacity-70 border-l border-stroke px-5 py-4 transition-opacity flex items-center justify-center gap-2"
          >
            {pending && <Spinner size={12} />}
            {pending ? "Kicking…" : "Kick"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// "Invite pending" slot — same footprint as a real player card so the
// grid doesn't reshuffle when an invite is sent. Greyscale styling +
// pulsing border-top stripe so the host can read the lobby at a
// glance ("X confirmed, Y still pending").
function InvitedSlotCard({
  invite,
  canCancel,
}: {
  invite: PendingInvite;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Countdown — recomputed on a 1s tick so the host sees the invite
  // ageing toward expiry without a full router.refresh().
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remainingSec = Math.max(
    0,
    Math.floor((new Date(invite.expiresAt).getTime() - now) / 1000),
  );
  // When the local countdown hits 0 we re-pull the RSC tree exactly
  // once — page.tsx's sweep deletes the expired row and pendingInvites
  // drops it, freeing the slot. The ref guard stops the effect from
  // hammering router.refresh() on every tick after expiry.
  const expiredRefreshSent = useRef(false);
  useEffect(() => {
    if (remainingSec === 0 && !expiredRefreshSent.current) {
      expiredRefreshSent.current = true;
      router.refresh();
    }
  }, [remainingSec, router]);
  const mm = Math.floor(remainingSec / 60);
  const ss = (remainingSec % 60).toString().padStart(2, "0");

  const cancel = () => {
    setError(null);
    startTransition(async () => {
      const r = await cancelLobbyInvite(invite.inviteId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="relative bg-panel border border-dashed border-stroke flex flex-col overflow-hidden">
      <span
        className="absolute top-0 left-0 right-0 h-[3px] animate-pulse"
        style={{ background: "var(--color-gold)" }}
        aria-hidden
      />

      {canCancel && (
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          aria-label={`Cancel invite to ${invite.profile.nickname}`}
          title="Cancel invite"
          className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center text-mute hover:text-lose border border-stroke hover:border-lose transition-colors z-10 disabled:opacity-60"
        >
          <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
        </button>
      )}

      <div className="px-3 pt-4 pb-2 flex flex-col items-center gap-1 border-b border-stroke text-center opacity-70">
        <div className="relative inline-block grayscale">
          <Avatar
            nickname={invite.profile.nickname}
            avatarUrl={invite.profile.avatarUrl}
            size={52}
            shape="square"
            color="var(--color-mute)"
          />
          <div className="absolute -right-2 -bottom-2">
            <Hexagon
              value={invite.profile.level}
              size={24}
              color="var(--color-mute)"
              textColor="var(--color-white)"
            />
          </div>
        </div>
        <span className="font-head text-sm text-mute mt-1 truncate max-w-full">
          {invite.profile.nickname.toUpperCase()}
        </span>
        <div className="flex items-center gap-2">
          <FlagTag code={invite.profile.country} />
          <span className="font-mono text-[11px] text-mute">
            {invite.profile.elo.toLocaleString()} ELO
          </span>
        </div>
      </div>

      <div className="px-3 py-2.5 flex flex-col gap-1 flex-1">
        <span className="font-head text-[9px] text-dim">Status</span>
        <span className="font-mono text-[11px] text-gold">
          Awaiting accept…
        </span>
        {error && (
          <span className="font-mono text-[10px] text-lose mt-1">{error}</span>
        )}
      </div>

      <div
        className="font-head text-[11px] text-center py-2 border-t border-stroke"
        style={{
          background: "var(--color-canvas)",
          color: "var(--color-gold)",
        }}
      >
        Expires in {mm}:{ss}
      </div>
    </div>
  );
}

function EmptySlotCard({
  slot,
  canInvite,
  onInvite,
}: {
  slot: number;
  canInvite: boolean;
  onInvite: () => void;
}) {
  if (!canInvite) {
    return (
      <div className="bg-panel border border-dashed border-stroke flex flex-col items-center justify-center gap-2 py-5 text-center">
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
  return (
    <button
      type="button"
      onClick={onInvite}
      className="group bg-panel border border-dashed border-stroke hover:border-accent hover:bg-surface-hi transition-colors flex flex-col items-center justify-center gap-2 py-5 text-center cursor-pointer"
    >
      <span
        className="w-9 h-9 flex items-center justify-center border border-dim group-hover:border-accent transition-colors"
        aria-hidden
      >
        <FontAwesomeIcon
          icon={faPlus}
          className="w-4 h-4 text-dim group-hover:text-accent transition-colors"
        />
      </span>
      <span className="font-head text-[11px] text-dim group-hover:text-white transition-colors">
        Slot {slot}
      </span>
      <span className="font-mono text-[10px] text-dim group-hover:text-mute transition-colors">
        Invite a friend
      </span>
    </button>
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
      <div className="relative bg-panel h-[160px] px-3 py-3">
        <svg
          viewBox="0 0 1000 684"
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

// ---- Chat panel ----------------------------------------------------------

type ChatMessage = {
  id: string;
  authorId: string;
  nickname: string;
  text: string;
  createdAt: string;
};

function LobbyChatPanel({
  sessionId,
  currentProfileId,
  isMember,
}: {
  sessionId: string;
  currentProfileId: string;
  isMember: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // useRef so refetch can be called from submit() after a successful
  // send without waiting on the realtime channel / poll tick.
  const refetchRef = useRef<() => Promise<void>>(async () => {});

  // Initial fetch + realtime subscription. Refetch on every INSERT —
  // simpler than reconstructing the joined nickname client-side and
  // chat volume in a lobby is tiny.
  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    const refetch = async () => {
      try {
        const r = await fetch(`/api/lobby/${sessionId}/chat`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const data = (await r.json()) as { messages: ChatMessage[] };
        if (!cancelled) {
          setMessages(data.messages);
          setLoaded(true);
        }
      } catch {
        /* network blip — next INSERT will retry */
      }
    };
    refetchRef.current = refetch;
    refetch();

    const supabase = createClient();
    const channel = supabase
      .channel(`lobby-chat-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "LobbyChatMessage",
          filter: `gameSessionId=eq.${sessionId}`,
        },
        refetch,
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
    };
  }, [sessionId, isMember]);

  // Smart auto-scroll: only follow the bottom when the user is
  // already pinned within 80px of it. If they scrolled up to read
  // history, a new message lands silently and they can scroll on
  // their own time — same convention as Discord / Slack.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setError(null);
    startTransition(async () => {
      const r = await sendLobbyMessage(sessionId, text);
      if (!r.ok) {
        setError(r.error);
        setDraft(text);
        return;
      }
      // Refetch immediately so the sender sees their own message
      // without waiting on realtime / 3s poll.
      await refetchRef.current();
    });
  };

  return (
    <PanelCard title="Lobby chat" accent="#3fcf6c" padded={false} fill>
      <div className="flex flex-col h-full min-h-[280px]">
        <div
          ref={scrollRef}
          className="flex-1 px-3 py-3 flex flex-col gap-2 overflow-auto"
        >
          {!loaded && isMember ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner size={20} />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-dim font-mono text-[11px] mt-4">
              — {isMember
                ? "No messages yet — say hi."
                : "Join the lobby to read and post."} —
            </div>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              // Group consecutive messages from the same author: only
              // the first message in a run shows the nickname header,
              // the rest just show their text body with a small inline
              // timestamp — same convention as Discord / Slack.
              const isFirstInGroup =
                !prev || prev.authorId !== m.authorId;
              return (
                <ChatBubble
                  key={m.id}
                  message={m}
                  isMe={m.authorId === currentProfileId}
                  isFirstInGroup={isFirstInGroup}
                />
              );
            })
          )}
        </div>
        <div className="border-t border-stroke px-2 py-2 flex flex-col gap-1">
          {error && (
            <span className="font-mono text-[10px] text-lose px-1">
              {error}
            </span>
          )}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              maxLength={500}
              placeholder={
                isMember ? "Say something…" : "Join the lobby to chat"
              }
              disabled={!isMember || pending}
              className="flex-1 bg-canvas border border-stroke px-2.5 py-1.5 font-body text-xs text-white placeholder:text-dim outline-none focus:border-mute disabled:cursor-not-allowed transition-colors"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!isMember || pending || draft.trim().length === 0}
              className="font-head text-[11px] text-white bg-accent hover:bg-accent-dim disabled:bg-stroke disabled:text-mute disabled:cursor-not-allowed px-3 py-1.5 transition-colors flex items-center gap-1.5"
            >
              <FontAwesomeIcon icon={faPaperPlane} className="w-3 h-3" />
              Send
            </button>
          </div>
        </div>
      </div>
    </PanelCard>
  );
}

function ChatBubble({
  message,
  isMe,
  isFirstInGroup,
}: {
  message: ChatMessage;
  isMe: boolean;
  isFirstInGroup: boolean;
}) {
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!isFirstInGroup) {
    // Continuation of the same author's run — drop the nickname,
    // keep the text and show the timestamp tucked to the right so
    // it's still recoverable without dominating the bubble. The
    // negative top margin tightens spacing against the gap-2 of the
    // parent flex column.
    return (
      <div className="font-body text-xs leading-snug -mt-1 flex items-baseline gap-2">
        <span className="text-white break-words flex-1 min-w-0">
          {message.text}
        </span>
        <span className="font-mono text-[10px] text-dim shrink-0">
          {time}
        </span>
      </div>
    );
  }
  return (
    <div className="font-body text-xs leading-snug">
      <div className="flex items-baseline gap-2">
        <span
          className="font-head text-[10px]"
          style={{
            color: isMe ? "var(--color-accent)" : "var(--color-win)",
          }}
        >
          {message.nickname.toUpperCase()}
          {isMe && (
            <span className="font-mono text-dim ml-1">(you)</span>
          )}
        </span>
        <span className="font-mono text-[10px] text-dim">{time}</span>
      </div>
      <div className="text-white mt-0.5 break-words">{message.text}</div>
    </div>
  );
}

// ---- Invite friends modal -------------------------------------------------

function InviteFriendsModal({
  sessionId,
  friends,
  invited,
  onClose,
  onInvited,
}: {
  sessionId: string;
  friends: InviteCandidate[];
  invited: Set<string>;
  onClose: () => void;
  onInvited: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes invite-modal-in {
          0%   { opacity: 0; transform: scale(0.94) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .invite-modal-card { animation: invite-modal-in 0.22s ease-out forwards; }
      `}</style>
      <div
        className="invite-modal-card w-full max-w-md bg-surface border border-stroke shadow-2xl shadow-black/80 flex flex-col"
        style={{ borderTop: "4px solid var(--color-accent)" }}
      >
        <header className="px-5 py-4 border-b border-stroke flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-head text-[10px] text-accent">
              Lobby invite
            </span>
            <h2
              id="invite-modal-title"
              className="font-head text-lg text-white leading-tight mt-0.5"
            >
              INVITE A FRIEND
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-mute hover:text-white border border-stroke hover:border-mute transition-colors"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3.5 h-3.5" />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-auto">
          {friends.length === 0 ? (
            <p className="font-body text-xs text-dim text-center py-10 px-6 leading-relaxed">
              No friends to invite yet — add some on the friends page first.
            </p>
          ) : (
            <div>
              {friends.map((f) => (
                <InviteFriendRow
                  key={f.id}
                  sessionId={sessionId}
                  friend={f}
                  alreadyInvited={invited.has(f.id)}
                  onInvited={() => onInvited(f.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const invite = () => {
    startTransition(async () => {
      const r = await inviteFriendToLobby(friend.id, sessionId);
      if (r.ok) {
        onInvited();
        setError(null);
        // Pull the fresh pendingInvites array from the RSC tree so
        // the new "Awaiting…" slot card appears immediately, even
        // when the Supabase Realtime publication for LobbyInvite
        // isn't configured.
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <div className="grid grid-cols-[28px_1fr_auto] gap-2.5 items-center px-4 py-2.5 border-t border-stroke first:border-t-0">
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
