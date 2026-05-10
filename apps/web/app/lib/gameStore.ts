"use client";

// Bridge between Colyseus and React. One Zustand store per browser session
// holds the room handle and a mirror of the current MatchState. Components
// subscribe via selectors so each rerender is scoped to the slice it cares
// about (no whole-tree rerenders on every server tick).

import { create } from "zustand";
import { Client, Room } from "colyseus.js";

const SERVER_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";

// Plain JS mirror of the schema fields we care about. Avoids leaking
// MapSchema / ArraySchema instances into React (which would cause
// reference-equality false positives).
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
  // Counts for now; full Country/Player objects come in later phases.
  playerCount: number;
  countryCount: number;
};

interface GameStore {
  room: Room | null;
  status: "idle" | "connecting" | "connected" | "error";
  errorMessage: string | null;
  state: GameStateMirror;
  lastPong: { ts: number; echo: unknown } | null;

  connect: (sessionId: string, jwt?: string) => Promise<void>;
  disconnect: () => void;
  sendPing: () => void;
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
  playerCount: 0,
  countryCount: 0,
};

// Translate the Colyseus-managed schema into a plain object snapshot.
// Cheap to call; runs on every state change and feeds setState below.
function snapshot(s: any): GameStateMirror {
  return {
    stage: s.stage ?? "capitals",
    status: s.status ?? "active",
    winnerId: s.winnerId ?? null,
    turnIndex: s.turnIndex ?? 0,
    pickOrder: Array.from(s.pickOrder ?? []),
    capitalExpiresAt: s.capitalExpiresAt ?? 0,
    pickExpiresAt: s.pickExpiresAt ?? 0,
    nextQuestionAt: s.nextQuestionAt ?? 0,
    warTurnExpiresAt: s.warTurnExpiresAt ?? 0,
    warTurns: s.warTurns ?? 0,
    playerCount: s.players?.size ?? 0,
    countryCount: s.countries?.size ?? 0,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  room: null,
  status: "idle",
  errorMessage: null,
  state: emptyState,
  lastPong: null,

  async connect(sessionId, jwt) {
    if (get().status === "connecting" || get().status === "connected") return;
    set({ status: "connecting", errorMessage: null });
    try {
      const client = new Client(SERVER_URL);
      const room = await client.joinOrCreate("match", { sessionId, jwt });

      room.onStateChange((s) => set({ state: snapshot(s) }));
      room.onMessage("pong", (msg: { ts: number; echo: unknown }) =>
        set({ lastPong: msg }),
      );
      room.onError((code, message) => {
        console.error("[room] error", code, message);
        set({ status: "error", errorMessage: message ?? `code ${code}` });
      });
      room.onLeave((code) => {
        console.log("[room] left", code);
        set({ status: "idle", room: null });
      });

      // Initial snapshot — onStateChange fires on subsequent updates only.
      set({ room, status: "connected", state: snapshot(room.state) });
    } catch (err) {
      console.error("[room] connect failed", err);
      set({
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  },

  disconnect() {
    const room = get().room;
    if (room) room.leave().catch(() => {});
    set({ room: null, status: "idle", state: emptyState, lastPong: null });
  },

  sendPing() {
    const room = get().room;
    if (room) room.send("ping", { from: "web", at: Date.now() });
  },
}));

// --- Selector helpers (use these in components for narrowest rerenders) ---

export const useRoomStatus = () => useGameStore((s) => s.status);
export const useStage = () => useGameStore((s) => s.state.stage);
export const useTurnIndex = () => useGameStore((s) => s.state.turnIndex);
export const usePlayerCount = () => useGameStore((s) => s.state.playerCount);
