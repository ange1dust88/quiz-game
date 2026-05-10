// Authoritative game room. One instance per active match. Owns the entire
// game state in memory and broadcasts diffs to connected clients via
// @colyseus/schema.
//
// onAuth verifies the same JWT cookie Next.js issues, then loads the
// player's PlayerInGame row to confirm they're actually a participant
// in this session. Connection is rejected otherwise.
//
// onCreate hydrates MatchState from Postgres: country templates become
// MatchState.countries entries, PlayerInGame rows + their MatchChoice
// rows become MatchState.players entries. After hydration, the in-memory
// state is the authoritative source of truth — no live writes back to
// MatchCountry / MatchEvent / MatchQuestion etc until game_over (which
// will write a single MatchSnapshot row in a later phase).

import { Client, Room } from "colyseus";
import { prisma } from "@quiz/db";
import {
  capitalParamsForChoice,
  computePickOrder,
  rankAnswers,
  verifyJwt,
} from "@quiz/shared";
import {
  ActiveQuestion,
  Country,
  MatchState,
  Player,
} from "@quiz/shared/schemas";

type AuthInfo = {
  userId: string;
  profileId: string;
  playerInGameId: string;
};

type CreateOptions = {
  sessionId: string;
};

type JoinOptions = {
  sessionId: string;
  jwt: string;
};

// Stage timers — keep aligned with the old code so UX feels the same.
const CAPITAL_TIMER_MS = 20_000;
const QUESTION_TIMER_MS = 10_000;
const PICK_TIMER_MS = 15_000;
const PHASE_DELAY_MS = 3_500;
const WAR_TURN_TIMER_MS = 20_000;
const WAR_MC_TIMER_MS = 15_000;
const WAR_TIE_TIMER_MS = 15_000;
const MAX_WAR_ROUNDS = 5;
const TICK_INTERVAL_MS = 250;

// Per-question telemetry collected from clients while the question is live.
// Held outside the synced state so other players can't see opponents'
// answers in flight.
type AnswerEntry = {
  playerId: string;
  value: number;
  receivedAtMs: number;
  firstInputAtMs: number | null;
  inputChangeCount: number;
};

export class MatchRoom extends Room<MatchState> {
  // Set in onCreate. Used by handlers to look up DB rows and write back at
  // game_over.
  private sessionId = "";

  // Cache of CountryTemplate.neighbors so adjacency lookups don't hit the
  // DB during gameplay. Populated once at hydration.
  private templateNeighbors = new Map<number, number[]>();

  // Per-question state held off-state so opponents can't see in-flight
  // answers via the synced schema. Reset between questions.
  private currentQuestion: {
    matchQuestionLocalId: string; // ephemeral id to dedupe stale UPDATE handlers on client
    questionRowId: number;
    correctAnswer: number;
    startedAtMs: number;
    answers: Map<string, AnswerEntry>; // keyed by playerInGameId
  } | null = null;

  // Telemetry batched and persisted in the final MatchSnapshot at game_over.
  private telemetry: {
    numericAnswers: Array<{
      playerId: string;
      questionId: number;
      category: string;
      value: number;
      diff: number;
      timeMs: number;
      firstInputAtMs: number | null;
      inputChangeCount: number;
    }>;
    capitalPicks: Array<{
      playerId: string;
      svgId: string;
      auto: boolean;
      capitalStyle: string;
    }>;
    territoryPicks: Array<{
      playerId: string;
      svgId: string;
      auto: boolean;
    }>;
  } = {
    numericAnswers: [],
    capitalPicks: [],
    territoryPicks: [],
  };

  override async onCreate(options: CreateOptions): Promise<void> {
    this.sessionId = options?.sessionId ?? "";
    if (!this.sessionId) {
      throw new Error("MatchRoom requires a sessionId in create options");
    }

    this.state = new MatchState();
    this.maxClients = 4;
    this.autoDispose = true;

    await this.hydrateFromDb();

    // --- Message handlers ---
    this.onMessage("ping", (client, payload) => {
      client.send("pong", { ts: Date.now(), echo: payload });
    });

    this.onMessage("claim_capital", (client, payload: { svgId: string }) => {
      const auth = client.auth as AuthInfo | undefined;
      if (!auth) return;
      this.handleClaimCapital(auth.playerInGameId, payload?.svgId, false);
    });

    this.onMessage(
      "submit_answer",
      (
        client,
        payload: {
          value: number;
          firstInputAtMs?: number | null;
          inputChangeCount?: number;
        },
      ) => {
        const auth = client.auth as AuthInfo | undefined;
        if (!auth) return;
        this.handleSubmitAnswer(auth.playerInGameId, payload);
      },
    );

    this.onMessage(
      "claim_territory",
      (client, payload: { svgId: string }) => {
        const auth = client.auth as AuthInfo | undefined;
        if (!auth) return;
        this.handleClaimTerritory(auth.playerInGameId, payload?.svgId, false);
      },
    );

    // Single ticker drives all deadline-based transitions. Cheaper than a
    // separate setTimeout per phase, and easy to reason about.
    this.clock.setInterval(() => this.tick(), TICK_INTERVAL_MS);

    // Kick off the capitals phase: first player at turnOrder=0 starts.
    this.startCapitalTurn();

    console.log(
      `[match ${this.roomId}] created for session ${this.sessionId} ` +
        `(${this.state.players.size} players, ${this.state.countries.size} countries)`,
    );
  }

  override async onAuth(
    _client: Client,
    options: JoinOptions,
  ): Promise<AuthInfo> {
    const sessionId = options?.sessionId;
    const jwt = options?.jwt;
    if (!sessionId) throw new Error("missing sessionId");
    if (!jwt) throw new Error("missing jwt");
    if (sessionId !== this.sessionId) {
      throw new Error("session mismatch");
    }

    const verified = await verifyJwt(jwt, process.env.SESSION_SECRET);
    if (!verified) throw new Error("invalid jwt");

    const profile = await prisma.playerProfile.findUnique({
      where: { userId: verified.userId },
    });
    if (!profile) throw new Error("no profile for user");

    const playerInGame = await prisma.playerInGame.findUnique({
      where: {
        gameSessionId_profileId: {
          gameSessionId: sessionId,
          profileId: profile.id,
        },
      },
    });
    if (!playerInGame) throw new Error("not a participant in this match");

    return {
      userId: verified.userId,
      profileId: profile.id,
      playerInGameId: playerInGame.id,
    };
  }

  override onJoin(client: Client): void {
    const auth = client.auth as AuthInfo | undefined;
    const playerId = auth?.playerInGameId;
    if (playerId) {
      const player = this.state.players.get(playerId);
      if (player) player.connected = true;
    }
    console.log(
      `[match ${this.roomId}] ${client.sessionId} joined (player=${playerId ?? "?"})`,
    );
  }

  override onLeave(client: Client): void {
    const auth = client.auth as AuthInfo | undefined;
    const playerId = auth?.playerInGameId;
    if (playerId) {
      const player = this.state.players.get(playerId);
      if (player) player.connected = false;
    }
    console.log(
      `[match ${this.roomId}] ${client.sessionId} left (player=${playerId ?? "?"})`,
    );
  }

  override onDispose(): void {
    console.log(`[match ${this.roomId}] disposed`);
  }

  // --- DB → state hydration ---------------------------------------------

  private async hydrateFromDb(): Promise<void> {
    const session = await prisma.gameSession.findUnique({
      where: { id: this.sessionId },
      include: {
        players: {
          include: {
            profile: { select: { nickname: true } },
            choices: { select: { key: true, value: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!session) {
      throw new Error(`session ${this.sessionId} not found in DB`);
    }

    // Players. Turn order = lobby join order (matches old behaviour).
    session.players.forEach((p, idx) => {
      const player = new Player();
      player.id = p.id;
      player.profileId = p.profileId;
      player.nickname = p.profile.nickname;
      player.turnOrder = idx;
      const capChoice = p.choices.find((c) => c.key === "capital_style");
      player.capitalStyle = capChoice?.value ?? "standard";
      player.connected = false;
      this.state.players.set(p.id, player);
    });

    // Countries — created from CountryTemplate. The Postgres MatchCountry
    // table is no longer the source of truth during the live match; only
    // the final MatchSnapshot will be persisted at game_over.
    const templates = await prisma.countryTemplate.findMany({
      orderBy: { id: "asc" },
    });
    for (const t of templates) {
      const c = new Country();
      c.id = String(t.id);
      c.svgId = t.svgId;
      c.templateId = t.id;
      this.state.countries.set(c.id, c);
      this.templateNeighbors.set(t.id, t.neighbors);
    }

    this.state.stage = "capitals";
    this.state.status = "active";
    this.state.turnIndex = 0;
  }

  // --- Tick (deadline driver) -------------------------------------------

  private tick(): void {
    const now = Date.now();
    if (this.state.stage === "capitals") {
      if (
        this.state.capitalExpiresAt > 0 &&
        now >= this.state.capitalExpiresAt
      ) {
        this.autoPickCapital();
      }
      return;
    }
    if (this.state.stage === "expand") {
      // Time to start the next question?
      if (
        this.state.nextQuestionAt > 0 &&
        now >= this.state.nextQuestionAt &&
        !this.state.activeQuestion &&
        this.state.pickOrder.length === 0
      ) {
        this.state.nextQuestionAt = 0;
        void this.startQuestion();
      }
      // Active question expired → resolve with whatever answers we have.
      if (
        this.state.activeQuestion &&
        now >= this.state.activeQuestion.expiresAt
      ) {
        this.resolveQuestion();
      }
      // Pick window expired → auto-pick for whoever's at head.
      if (
        this.state.pickExpiresAt > 0 &&
        now >= this.state.pickExpiresAt &&
        this.state.pickOrder.length > 0
      ) {
        this.autoPickTerritory();
      }
      return;
    }
  }

  // --- Capitals stage ---------------------------------------------------

  private startCapitalTurn(): void {
    this.state.capitalExpiresAt = Date.now() + CAPITAL_TIMER_MS;
  }

  private playerByTurnOrder(idx: number): Player | undefined {
    let found: Player | undefined;
    this.state.players.forEach((p) => {
      if (p.turnOrder === idx) found = p;
    });
    return found;
  }

  private playerHasCapital(playerId: string): boolean {
    let has = false;
    this.state.countries.forEach((c) => {
      if (c.ownerId === playerId && c.isCapital) has = true;
    });
    return has;
  }

  private capitalsPlaced(): number {
    let n = 0;
    this.state.countries.forEach((c) => {
      if (c.isCapital) n += 1;
    });
    return n;
  }

  /**
   * Apply a capital pick. Validates that:
   *   - we're in the capitals stage
   *   - the requesting player IS the current turn
   *   - the requested country exists and is unowned
   *   - the player doesn't already have a capital (defensive)
   * On success, mutates the country and advances the turn (or transitions
   * to expand if everyone has placed).
   *
   * Called from both the client message handler and the auto-pick path.
   */
  private handleClaimCapital(
    playerId: string,
    svgId: string | undefined,
    auto: boolean,
  ): void {
    if (this.state.stage !== "capitals") return;
    if (!svgId) return;

    const player = this.state.players.get(playerId);
    if (!player) return;
    if (player.turnOrder !== this.state.turnIndex) return;
    if (this.playerHasCapital(playerId)) return;

    let country: Country | undefined;
    this.state.countries.forEach((c) => {
      if (c.svgId === svgId) country = c;
    });
    if (!country || country.ownerId) return;

    const params = capitalParamsForChoice(player.capitalStyle);
    country.ownerId = playerId;
    country.isCapital = true;
    country.armies = params.armies;
    country.maxArmies = params.armies;
    country.points = params.points;

    this.telemetry.capitalPicks.push({
      playerId,
      svgId: country.svgId,
      auto,
      capitalStyle: player.capitalStyle,
    });

    console.log(
      `[match ${this.roomId}] ${player.nickname} → capital ${country.svgId}${auto ? " (auto)" : ""}`,
    );

    this.advanceCapitalTurn();
  }

  private autoPickCapital(): void {
    const player = this.playerByTurnOrder(this.state.turnIndex);
    if (!player) return;
    if (this.playerHasCapital(player.id)) {
      // Shouldn't happen, but defensive: skip ahead.
      this.advanceCapitalTurn();
      return;
    }

    const free: Country[] = [];
    this.state.countries.forEach((c) => {
      if (!c.ownerId) free.push(c);
    });
    if (free.length === 0) {
      this.advanceCapitalTurn();
      return;
    }

    const pick = free[Math.floor(Math.random() * free.length)];
    console.log(
      `[match ${this.roomId}] auto-pick: ${player.nickname} → ${pick.svgId}`,
    );
    this.handleClaimCapital(player.id, pick.svgId, true);
  }

  private advanceCapitalTurn(): void {
    if (this.capitalsPlaced() >= this.state.players.size) {
      this.transitionToExpand();
      return;
    }
    this.state.turnIndex =
      (this.state.turnIndex + 1) % Math.max(1, this.state.players.size);
    this.state.capitalExpiresAt = Date.now() + CAPITAL_TIMER_MS;
  }

  private transitionToExpand(): void {
    this.state.stage = "expand";
    this.state.capitalExpiresAt = 0;
    this.state.turnIndex = 0;
    // Schedule the first question after a short delay so the UI has time
    // to render the stage change before the question pops in.
    this.state.nextQuestionAt = Date.now() + PHASE_DELAY_MS;
    console.log(`[match ${this.roomId}] → stage=expand`);
  }

  // --- Expand stage -----------------------------------------------------

  private async startQuestion(): Promise<void> {
    if (this.state.stage !== "expand") return;
    if (this.state.activeQuestion) return;
    if (this.state.pickOrder.length > 0) return;

    const count = await prisma.question.count();
    if (count === 0) {
      console.warn(`[match ${this.roomId}] no Question rows in DB`);
      return;
    }
    const question = await prisma.question.findFirst({
      skip: Math.floor(Math.random() * count),
    });
    if (!question) return;

    const aq = new ActiveQuestion();
    aq.id = `${question.id}-${Date.now()}`;
    aq.questionId = question.id;
    aq.text = question.text;
    aq.category = question.category;
    aq.expiresAt = Date.now() + QUESTION_TIMER_MS;
    this.state.activeQuestion = aq;
    this.state.nextQuestionAt = 0;

    this.currentQuestion = {
      matchQuestionLocalId: aq.id,
      questionRowId: question.id,
      correctAnswer: question.answer,
      startedAtMs: Date.now(),
      answers: new Map(),
    };

    console.log(
      `[match ${this.roomId}] question ${question.id} (${question.category}): "${question.text}"`,
    );
  }

  private handleSubmitAnswer(
    playerId: string,
    payload: {
      value: number;
      firstInputAtMs?: number | null;
      inputChangeCount?: number;
    },
  ): void {
    if (this.state.stage !== "expand") return;
    if (!this.currentQuestion) return;
    if (!this.state.players.has(playerId)) return;

    const value = Number(payload?.value);
    if (!Number.isFinite(value)) return;

    const firstInputAtMs =
      typeof payload.firstInputAtMs === "number"
        ? Math.max(0, Math.min(QUESTION_TIMER_MS, payload.firstInputAtMs))
        : null;
    const inputChangeCount = Math.max(
      0,
      Math.min(1000, Math.round(payload.inputChangeCount ?? 0)),
    );

    // Upsert — last submission wins (matches old behaviour).
    this.currentQuestion.answers.set(playerId, {
      playerId,
      value,
      receivedAtMs: Date.now(),
      firstInputAtMs,
      inputChangeCount,
    });

    if (this.currentQuestion.answers.size >= this.state.players.size) {
      this.resolveQuestion();
    }
  }

  private resolveQuestion(): void {
    if (!this.currentQuestion) return;
    const cq = this.currentQuestion;
    this.currentQuestion = null;

    const totalPlayers = this.state.players.size;
    const submissions = Array.from(cq.answers.values()).map((a) => ({
      playerId: a.playerId,
      answer: a.value,
      answeredAtMs: a.receivedAtMs,
    }));

    const sorted = rankAnswers(submissions, cq.correctAnswer);
    let pickOrder: string[] = [];

    type Result = {
      playerId: string;
      nickname: string;
      answer: number | null;
      diff: number;
      place: number;
      timeMs: number | null;
    };
    let results: Result[] = [];

    if (sorted.length === 0 && totalPlayers > 0) {
      // Nobody answered — random lucky pick so the game doesn't stall.
      const playerIds: string[] = [];
      this.state.players.forEach((p) => playerIds.push(p.id));
      const lucky = playerIds[Math.floor(Math.random() * playerIds.length)];
      pickOrder = computePickOrder([lucky], totalPlayers);
      results = playerIds.map((pid, i) => {
        const p = this.state.players.get(pid)!;
        return {
          playerId: pid,
          nickname: p.nickname,
          answer: null,
          diff: 0,
          place: pid === lucky ? 1 : i + 2,
          timeMs: null,
        };
      });
    } else {
      pickOrder = computePickOrder(
        sorted.map((s) => s.playerId),
        totalPlayers,
      );

      const ranked: Result[] = sorted.map((s, i) => {
        const p = this.state.players.get(s.playerId)!;
        return {
          playerId: s.playerId,
          nickname: p.nickname,
          answer: s.answer,
          diff: Math.abs(s.answer - cq.correctAnswer),
          place: i + 1,
          timeMs: Math.max(0, s.answeredAtMs - cq.startedAtMs),
        };
      });
      const answeredSet = new Set(ranked.map((r) => r.playerId));
      const missing: Result[] = [];
      this.state.players.forEach((p, pid) => {
        if (!answeredSet.has(pid)) {
          missing.push({
            playerId: pid,
            nickname: p.nickname,
            answer: null,
            diff: 0,
            place: ranked.length + missing.length + 1,
            timeMs: null,
          });
        }
      });
      results = [...ranked, ...missing];
    }

    // Telemetry — store one row per submitted answer.
    for (const a of cq.answers.values()) {
      this.telemetry.numericAnswers.push({
        playerId: a.playerId,
        questionId: cq.questionRowId,
        category: this.state.activeQuestion?.category ?? "general",
        value: a.value,
        diff: Math.abs(a.value - cq.correctAnswer),
        timeMs: Math.max(0, a.receivedAtMs - cq.startedAtMs),
        firstInputAtMs: a.firstInputAtMs,
        inputChangeCount: a.inputChangeCount,
      });
    }

    // Push results message — ephemeral; clients render briefly then hide.
    this.broadcast("round_results", { results, correctAnswer: cq.correctAnswer });

    // Clear active question, install pick queue + deadline.
    this.state.activeQuestion = null;
    this.state.pickOrder.clear();
    pickOrder.forEach((id) => this.state.pickOrder.push(id));
    this.state.pickExpiresAt =
      pickOrder.length > 0 ? Date.now() + PICK_TIMER_MS : 0;

    console.log(
      `[match ${this.roomId}] question resolved, pickOrder=[${pickOrder.length}]`,
    );
  }

  private handleClaimTerritory(
    playerId: string,
    svgId: string | undefined,
    auto: boolean,
  ): void {
    if (this.state.stage !== "expand") return;
    if (!svgId) return;
    if (this.state.pickOrder.length === 0) return;
    if (this.state.pickOrder[0] !== playerId) return;

    let country: Country | undefined;
    this.state.countries.forEach((c) => {
      if (c.svgId === svgId) country = c;
    });
    if (!country || country.ownerId) return;

    // Must be a free neighbor of one of the player's existing countries
    // (matches the old constraint). If the player owns no countries yet
    // (edge case), allow any free country.
    const myTemplateIds = new Set<number>();
    this.state.countries.forEach((c) => {
      if (c.ownerId === playerId) myTemplateIds.add(c.templateId);
    });
    if (myTemplateIds.size > 0) {
      const free = this.freeNeighborSvgIds(playerId);
      if (free.size > 0 && !free.has(svgId)) return;
    }

    country.ownerId = playerId;
    this.telemetry.territoryPicks.push({
      playerId,
      svgId: country.svgId,
      auto,
    });

    const player = this.state.players.get(playerId);
    console.log(
      `[match ${this.roomId}] ${player?.nickname} → territory ${country.svgId}${auto ? " (auto)" : ""}`,
    );

    this.advanceTerritoryPick();
  }

  private advanceTerritoryPick(): void {
    // Pop the head of pickOrder (the one we just consumed).
    if (this.state.pickOrder.length > 0) {
      this.state.pickOrder.shift();
    }

    // Are all countries now owned? → war.
    let allOwned = true;
    this.state.countries.forEach((c) => {
      if (!c.ownerId) allOwned = false;
    });
    if (allOwned) {
      this.transitionToWar();
      return;
    }

    if (this.state.pickOrder.length === 0) {
      // Queue empty — schedule the next question.
      this.state.pickExpiresAt = 0;
      this.state.nextQuestionAt = Date.now() + PHASE_DELAY_MS;
    } else {
      // Refresh deadline for the next picker.
      this.state.pickExpiresAt = Date.now() + PICK_TIMER_MS;
    }
  }

  private autoPickTerritory(): void {
    const playerId = this.state.pickOrder[0];
    if (!playerId) return;
    const free = this.freeNeighborSvgIds(playerId);
    if (free.size === 0) {
      // No reachable free country — pop their slot and move on.
      this.state.pickOrder.shift();
      if (this.state.pickOrder.length === 0) {
        this.state.pickExpiresAt = 0;
        this.state.nextQuestionAt = Date.now() + PHASE_DELAY_MS;
      } else {
        this.state.pickExpiresAt = Date.now() + PICK_TIMER_MS;
      }
      return;
    }
    const arr = Array.from(free);
    const pick = arr[Math.floor(Math.random() * arr.length)];
    this.handleClaimTerritory(playerId, pick, true);
  }

  // Returns set of svgIds of unowned countries that are neighbors of any
  // country the player owns. Uses the templateId neighbor list cached in
  // CountryTemplate (read once at hydration → already in state via Country).
  private freeNeighborSvgIds(playerId: string): Set<string> {
    const myTemplateIds = new Set<number>();
    this.state.countries.forEach((c) => {
      if (c.ownerId === playerId) myTemplateIds.add(c.templateId);
    });
    // Build neighbor template ID set by scanning country templates for owned
    // countries' neighbors. Since we don't keep neighbor data on Country
    // schema, fetch from cached `templateNeighbors` (populated in hydration).
    const neighborIds = new Set<number>();
    for (const tid of myTemplateIds) {
      const ns = this.templateNeighbors.get(tid);
      if (ns) ns.forEach((n: number) => neighborIds.add(n));
    }
    const out = new Set<string>();
    this.state.countries.forEach((c) => {
      if (!c.ownerId && neighborIds.has(c.templateId)) out.add(c.svgId);
    });
    return out;
  }

  // --- Stage transitions -----------------------------------------------

  private transitionToWar(): void {
    this.state.stage = "war";
    this.state.pickOrder.clear();
    this.state.pickExpiresAt = 0;
    this.state.activeQuestion = null;
    this.state.nextQuestionAt = 0;

    // Leader (most lands) attacks first.
    let leader = "";
    let maxLands = -1;
    const counts = new Map<string, number>();
    this.state.countries.forEach((c) => {
      if (c.ownerId) counts.set(c.ownerId, (counts.get(c.ownerId) ?? 0) + 1);
    });
    this.state.players.forEach((p) => {
      const n = counts.get(p.id) ?? 0;
      if (n > maxLands) {
        maxLands = n;
        leader = p.id;
      }
    });
    const leaderPlayer = this.state.players.get(leader);
    if (leaderPlayer) this.state.turnIndex = leaderPlayer.turnOrder;

    this.state.warTurnExpiresAt = Date.now() + WAR_TURN_TIMER_MS;
    this.state.warTurns = 0;
    console.log(`[match ${this.roomId}] → stage=war (leader=${leader})`);
  }
}
