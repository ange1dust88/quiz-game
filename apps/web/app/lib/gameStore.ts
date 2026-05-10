"use client";

// Bridge between Colyseus and React. One Zustand store per browser session
// holds the room handle and a mirror of the current MatchState. Components
// subscribe via selectors so each rerender is scoped to the slice it cares
// about.

import { create } from "zustand";
import { Client, Room } from "colyseus.js";

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
  turnOrder: number;
  capitalStyle: string;
  connected: boolean;
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
  status: "idle" | "connecting" | "connected" | "error";
  errorMessage: string | null;
  state: GameStateMirror;
  lastResults: { results: RoundResult[]; correctAnswer: number } | null;

  connect: (sessionId: string, jwt: string) => Promise<void>;
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
      turnOrder: p.turnOrder,
      capitalStyle: p.capitalStyle,
      connected: p.connected,
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

export const useGameStore = create<GameStore>((set, get) => ({
  room: null,
  status: "idle",
  errorMessage: null,
  state: emptyState,
  lastResults: null,

  async connect(sessionId, jwt) {
    if (get().status === "connecting" || get().status === "connected") return;
    set({ status: "connecting", errorMessage: null });
    try {
      const client = new Client(SERVER_URL);
      const room = await client.joinOrCreate("match", { sessionId, jwt });

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
        set({ status: "idle", room: null });
      });

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
    set({
      room: null,
      status: "idle",
      state: emptyState,
      lastResults: null,
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
}));

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
