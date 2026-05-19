"use client";

// Bridge between Colyseus and React. One Zustand store per browser session
// holds the room handle and a mirror of the current MatchState. Components
// subscribe via selectors so each rerender is scoped to the slice it cares
// about.

import { create } from "zustand";
import { Client, Room } from "colyseus.js";
import { claimGameRoomId, getGameRoomId } from "@/app/lobby/[id]/actions";

const SERVER_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";

export type CountryMirror = {
  id: string;
  svgId: string;
  templateId: number;
  ownerId: string | null;
  isCapital: boolean;
  armies: number;
  maxArmies: number;
  points: number;
};

export type PlayerMirror = {
  id: string;
  profileId: string;
  nickname: string;
  avatarUrl: string | null;
  turnOrder: number;
  capitalStyle: string;
  connected: boolean;
  abandoned: boolean;
};

export type ActiveQuestionMirror = {
  id: string;
  questionId: number;
  text: string;
  category: string;
  expiresAt: number;
};

export type ActiveAttackMirror = {
  id: string;
  attackerId: string;
  defenderId: string;
  countryId: string;
  questionId: number;
  questionText: string;
  options: string[];
  category: string;
  expiresAt: number;
  tieQuestionId: number;
  tieQuestionText: string;
  tieExpiresAt: number;
  lastAttackerCorrect: boolean;
  lastDefenderCorrect: boolean;
  attackerOption: string;
  defenderOption: string;
  correctOption: string;
  resolveRevealEndsAt: number;
  tieCorrectAnswer: number;
  tieAttackerAnswer: number;
  tieDefenderAnswer: number;
  tieAttackerAnswered: boolean;
  tieDefenderAnswered: boolean;
  tieAttackerTimeMs: number;
  tieDefenderTimeMs: number;
  tieResolveRevealEndsAt: number;
};

export type RoundResult = {
  playerId: string;
  nickname: string;
  answer: number | null;
  diff: number;
  place: number;
  timeMs: number | null;
};

export type GameStateMirror = {
  stage: string;
  status: string;
  winnerId: string | null;
  turnIndex: number;
  pickOrder: string[];
  capitalExpiresAt: number;
  pickExpiresAt: number;
  nextQuestionAt: number;
  warTurnExpiresAt: number;
  warTurns: number;
  players: PlayerMirror[];
  countries: CountryMirror[];
  activeQuestion: ActiveQuestionMirror | null;
  activeAttack: ActiveAttackMirror | null;
};

interface GameStore {
  room: Room | null;
  status:
    | "idle"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "waiting-host"
    | "error";
  errorMessage: string | null;
  state: GameStateMirror;
  lastResults: { results: RoundResult[]; correctAnswer: number } | null;
  reconnectAttempt: number;

  connect: (
    sessionId: string,
    jwt: string,
    opts: { role: string; initialRoomId: string | null },
  ) => Promise<void>;
  disconnect: () => void;

  claimCapital: (svgId: string) => void;
  claimTerritory: (svgId: string) => void;
  attack: (svgId: string) => void;
  submitAnswer: (
    value: number,
    telemetry?: { firstInputAtMs: number | null; inputChangeCount: number },
  ) => void;
  submitWarAnswer: (option: string, submittedAtMs: number) => void;
  submitWarTie: (
    value: number,
    telemetry?: { firstInputAtMs: number | null },
  ) => void;
  clearResults: () => void;
}

const emptyState: GameStateMirror = {
  stage: "capitals",
  status: "active",
  winnerId: null,
  turnIndex: 0,
  pickOrder: [],
  capitalExpiresAt: 0,
  pickExpiresAt: 0,
  nextQuestionAt: 0,
  warTurnExpiresAt: 0,
  warTurns: 0,
  players: [],
  countries: [],
  activeQuestion: null,
  activeAttack: null,
};

function snapshot(s: any): GameStateMirror {
  const players: PlayerMirror[] = [];
  s.players?.forEach((p: any) => {
    players.push({
      id: p.id,
      profileId: p.profileId,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl ? p.avatarUrl : null,
      turnOrder: p.turnOrder,
      capitalStyle: p.capitalStyle,
      connected: p.connected,
      abandoned: p.abandoned ?? false,
    });
  });

  const countries: CountryMirror[] = [];
  s.countries?.forEach((c: any) => {
    countries.push({
      id: c.id,
      svgId: c.svgId,
      templateId: c.templateId,
      ownerId: c.ownerId || null,
      isCapital: c.isCapital,
      armies: c.armies,
      maxArmies: c.maxArmies,
      points: c.points,
    });
  });

  const aq = s.activeQuestion;
  const activeQuestion: ActiveQuestionMirror | null =
    aq && aq.id
      ? {
          id: aq.id,
          questionId: aq.questionId,
          text: aq.text,
          category: aq.category,
          expiresAt: aq.expiresAt,
        }
      : null;

  const aa = s.activeAttack;
  const activeAttack: ActiveAttackMirror | null =
    aa && aa.id
      ? {
          id: aa.id,
          attackerId: aa.attackerId,
          defenderId: aa.defenderId,
          countryId: aa.countryId,
          questionId: aa.questionId,
          questionText: aa.questionText,
          options: Array.from(aa.options ?? []),
          category: aa.category,
          expiresAt: aa.expiresAt,
          tieQuestionId: aa.tieQuestionId,
          tieQuestionText: aa.tieQuestionText,
          tieExpiresAt: aa.tieExpiresAt,
          lastAttackerCorrect: aa.lastAttackerCorrect,
          lastDefenderCorrect: aa.lastDefenderCorrect,
          attackerOption: aa.attackerOption ?? "",
          defenderOption: aa.defenderOption ?? "",
          correctOption: aa.correctOption ?? "",
          resolveRevealEndsAt: aa.resolveRevealEndsAt ?? 0,
          tieCorrectAnswer: aa.tieCorrectAnswer ?? 0,
          tieAttackerAnswer: aa.tieAttackerAnswer ?? 0,
          tieDefenderAnswer: aa.tieDefenderAnswer ?? 0,
          tieAttackerAnswered: aa.tieAttackerAnswered ?? false,
          tieDefenderAnswered: aa.tieDefenderAnswered ?? false,
          tieAttackerTimeMs: aa.tieAttackerTimeMs ?? 0,
          tieDefenderTimeMs: aa.tieDefenderTimeMs ?? 0,
          tieResolveRevealEndsAt: aa.tieResolveRevealEndsAt ?? 0,
        }
      : null;

  return {
    stage: s.stage ?? "capitals",
    status: s.status ?? "active",
    winnerId: s.winnerId || null,
    turnIndex: s.turnIndex ?? 0,
    pickOrder: Array.from(s.pickOrder ?? []),
    capitalExpiresAt: s.capitalExpiresAt ?? 0,
    pickExpiresAt: s.pickExpiresAt ?? 0,
    nextQuestionAt: s.nextQuestionAt ?? 0,
    warTurnExpiresAt: s.warTurnExpiresAt ?? 0,
    warTurns: s.warTurns ?? 0,
    players,
    countries,
    activeQuestion,
    activeAttack,
  };
}

// Outside the store so the reconnection path can read them across closures.
// Manual disconnect (component unmount, user clicks Leave) sets
// `manualDisconnect = true` so the onLeave handler doesn't kick off a retry.
let manualDisconnect = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let savedReconnectionToken: string | null = null;
let savedSessionId: string | null = null;
let savedJwt: string | null = null;
let savedRoomId: string | null = null;
const MAX_RECONNECT_ATTEMPTS = 8;
// Poll interval guests use while waiting for the host to publish the room
// id to the DB. Host's first joinOrCreate usually completes within a few
// hundred ms; if it takes longer, this keeps the guest checking.
const GUEST_ROOM_POLL_MS = 500;
// Outer wall-clock budget for a guest waiting for the host's room id —
// gives up after ~30s with an error.
const GUEST_ROOM_WAIT_MS = 30_000;

function describeConnectError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "type" in err &&
    (err as { type: unknown }).type === "error"
  ) {
    return "WebSocket error (server unreachable or wrong URL)";
  }
  return String(err);
}

export const useGameStore = create<GameStore>((set, get) => {
  // Wire the lifecycle listeners on a freshly-joined room and stash its
  // reconnection token so we can resume if the socket flakes. Used by
  // both the initial connect() and the reconnect retry path.
  const wireRoom = (room: Room) => {
    savedReconnectionToken =
      (room as unknown as { reconnectionToken?: string }).reconnectionToken ??
      null;

    room.onStateChange((s) => set({ state: snapshot(s) }));
    room.onMessage(
      "round_results",
      (msg: { results: RoundResult[]; correctAnswer: number }) => {
        set({ lastResults: msg });
      },
    );
    room.onError((code, message) => {
      console.error("[room] error", code, message);
      set({ status: "error", errorMessage: message ?? `code ${code}` });
    });
    room.onLeave((code) => {
      console.log("[room] left", code);
      if (manualDisconnect) {
        set({ status: "idle", room: null, reconnectAttempt: 0 });
        return;
      }
      // Unexpected disconnect — server keeps the slot alive for ~30s via
      // allowReconnection, so try to slip back in.
      set({ status: "reconnecting", room: null, reconnectAttempt: 0 });
      scheduleReconnect();
    });
  };

  const scheduleReconnect = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (manualDisconnect) return;
    const attempt = get().reconnectAttempt + 1;
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      set({
        status: "error",
        errorMessage:
          "Lost connection to the game server. Refresh to try again.",
      });
      return;
    }
    const delay = Math.min(8000, Math.round(700 * Math.pow(1.6, attempt - 1)));
    reconnectTimer = setTimeout(async () => {
      if (manualDisconnect) return;
      set({ reconnectAttempt: attempt });
      try {
        if (!savedSessionId || !savedJwt) throw new Error("no saved session");
        const client = new Client(SERVER_URL);
        let room: Room;
        if (savedReconnectionToken) {
          try {
            room = await client.reconnect(savedReconnectionToken);
          } catch {
            // Token expired — try the canonical room id we know about.
            const canonical =
              savedRoomId ?? (await getGameRoomId(savedSessionId));
            room = canonical
              ? await client.joinById(canonical, {
                  sessionId: savedSessionId,
                  jwt: savedJwt,
                })
              : await client.joinOrCreate("match", {
                  sessionId: savedSessionId,
                  jwt: savedJwt,
                });
          }
        } else {
          const canonical =
            savedRoomId ?? (await getGameRoomId(savedSessionId));
          room = canonical
            ? await client.joinById(canonical, {
                sessionId: savedSessionId,
                jwt: savedJwt,
              })
            : await client.joinOrCreate("match", {
                sessionId: savedSessionId,
                jwt: savedJwt,
              });
        }
        savedRoomId = room.roomId;
        wireRoom(room);
        set({
          room,
          status: "connected",
          state: snapshot(room.state),
          reconnectAttempt: 0,
        });
      } catch (err) {
        console.warn("[room] reconnect attempt failed", err);
        scheduleReconnect();
      }
    }, delay);
  };

  // The host's branch: race to create the room, then publish the resulting
  // roomId to the DB. If a guest snuck in first and claimed the column,
  // dispose this room and hop into the canonical one — so we never end up
  // with two players in two rooms.
  const connectAsHost = async (sessionId: string, jwt: string) => {
    const client = new Client(SERVER_URL);
    const room = await client.joinOrCreate("match", { sessionId, jwt });
    const claim = await claimGameRoomId(sessionId, room.roomId);
    if (!claim.ok && claim.canonicalRoomId && claim.canonicalRoomId !== room.roomId) {
      // Lost the race — abandon our orphan and use the canonical room.
      try {
        await room.leave();
      } catch {
        // ignore
      }
      const canonical = await client.joinById(claim.canonicalRoomId, {
        sessionId,
        jwt,
      });
      return canonical;
    }
    return room;
  };

  // The guest's branch: poll the DB until the host publishes a roomId,
  // then joinById. Bounded by GUEST_ROOM_WAIT_MS.
  const connectAsGuest = async (sessionId: string, jwt: string) => {
    set({ status: "waiting-host" });
    const deadline = Date.now() + GUEST_ROOM_WAIT_MS;
    let roomId: string | null = null;
    while (Date.now() < deadline) {
      if (manualDisconnect) throw new Error("disconnected");
      roomId = await getGameRoomId(sessionId);
      if (roomId) break;
      await new Promise((r) => setTimeout(r, GUEST_ROOM_POLL_MS));
    }
    if (!roomId) {
      throw new Error("Host did not open the room in time");
    }
    const client = new Client(SERVER_URL);
    return client.joinById(roomId, { sessionId, jwt });
  };

  return {
    room: null,
    status: "idle",
    errorMessage: null,
    state: emptyState,
    lastResults: null,
    reconnectAttempt: 0,

    async connect(sessionId, jwt, opts) {
      if (get().status === "connecting" || get().status === "connected") return;
      manualDisconnect = false;
      savedSessionId = sessionId;
      savedJwt = jwt;
      savedRoomId = opts.initialRoomId;
      set({ status: "connecting", errorMessage: null, reconnectAttempt: 0 });
      try {
        const client = new Client(SERVER_URL);
        let room: Room;
        if (opts.initialRoomId) {
          // Room already exists for this session — just hop in.
          room = await client.joinById(opts.initialRoomId, { sessionId, jwt });
        } else if (opts.role === "host") {
          // First boot of the match. Host creates + publishes.
          room = await connectAsHost(sessionId, jwt);
        } else {
          // Guest arrived before host published the roomId — wait.
          room = await connectAsGuest(sessionId, jwt);
        }
        savedRoomId = room.roomId;
        wireRoom(room);
        set({ room, status: "connected", state: snapshot(room.state) });
      } catch (err) {
        const msg = `${describeConnectError(err)} — server: ${SERVER_URL}`;
        console.error("[room] connect failed", err, "url:", SERVER_URL);
        set({ status: "error", errorMessage: msg });
      }
    },

    disconnect() {
      manualDisconnect = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const room = get().room;
      if (room) room.leave().catch(() => {});
      savedReconnectionToken = null;
      savedSessionId = null;
      savedJwt = null;
      savedRoomId = null;
      set({
        room: null,
        status: "idle",
        state: emptyState,
        lastResults: null,
        reconnectAttempt: 0,
      });
    },

    claimCapital(svgId) {
      get().room?.send("claim_capital", { svgId });
    },
    claimTerritory(svgId) {
      get().room?.send("claim_territory", { svgId });
    },
    attack(svgId) {
      get().room?.send("attack", { svgId });
    },
    submitAnswer(value, telemetry) {
      get().room?.send("submit_answer", {
        value,
        firstInputAtMs: telemetry?.firstInputAtMs ?? null,
        inputChangeCount: telemetry?.inputChangeCount ?? 0,
      });
    },
    submitWarAnswer(option, submittedAtMs) {
      get().room?.send("war_answer", { option, submittedAtMs });
    },
    submitWarTie(value, telemetry) {
      get().room?.send("war_tie", {
        value,
        firstInputAtMs: telemetry?.firstInputAtMs ?? null,
      });
    },
    clearResults() {
      set({ lastResults: null });
    },
  };
});

// --- Selector helpers (use these in components for narrowest rerenders) --

export const useRoomStatus = () => useGameStore((s) => s.status);
export const useStage = () => useGameStore((s) => s.state.stage);
export const useTurnIndex = () => useGameStore((s) => s.state.turnIndex);
export const usePlayers = () => useGameStore((s) => s.state.players);
export const useCountries = () => useGameStore((s) => s.state.countries);
export const usePickOrder = () => useGameStore((s) => s.state.pickOrder);
export const useActiveQuestion = () =>
  useGameStore((s) => s.state.activeQuestion);
export const useActiveAttack = () => useGameStore((s) => s.state.activeAttack);
export const useWinnerId = () => useGameStore((s) => s.state.winnerId);
export const useLastResults = () => useGameStore((s) => s.lastResults);

// Returns the playerInGameId of whoever's turn it is RIGHT NOW based on
// stage rules.
export const useActivePlayerId = () =>
  useGameStore((s) => {
    const { stage, turnIndex, pickOrder, players } = s.state;
    if (stage === "expand" && pickOrder.length > 0) return pickOrder[0];
    const p = players.find((pl) => pl.turnOrder === turnIndex);
    return p?.id ?? null;
  });
