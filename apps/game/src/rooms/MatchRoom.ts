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
import { ArraySchema } from "@colyseus/schema";
import {
  ACHIEVEMENT_BY_CODE,
  applyExperience,
  attackerWonOutcome,
  capitalParamsForChoice,
  coinRewardFor,
  computeEloChanges,
  computePickOrder,
  computeTieResult,
  computeXpEarned,
  EUROPE_TOPOLOGY,
  evaluateAchievements,
  type MatchOutcome,
  playableForCount,
  progressIncrement,
  rankAnswers,
  shuffledPermutation,
  applyPermutation,
  utcDayKey,
  verifyJwt,
  warEndReason,
  winnerByLands,
} from "@quiz/shared";
import {
  ActiveAttack,
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
const WAR_REVEAL_MS = 3_500;
const MAX_WAR_ROUNDS = 5;
const TICK_INTERVAL_MS = 250;
// If only one player is still connected for this long, declare a walkover
// win. Covers the case where opponents close the tab and don't come back
// — otherwise the lone survivor sits forever, watching their opponent's
// turn auto-action through random territories until rounds run out.
//
// We use a short timer when the missing player(s) abandoned explicitly
// (consented leave — no chance of reconnect) and a longer one while the
// 30s reconnect window is still open, so transient disconnects don't
// hand out instant wins.
const WALKOVER_TIMEOUT_MS_CONSENTED = 1_500;
const WALKOVER_TIMEOUT_MS_DISCONNECT = 30_000;

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
  private startedAtMs = 0;
  // Per-session settings hydrated from GameSession at onCreate. Custom
  // lobbies override timers and the question-category pool; ranked
  // matches always pay out ELO/W-L, custom matches skip both.
  private settings = {
    rankedGame: true as boolean,
    capitalsTimerMs: CAPITAL_TIMER_MS,
    expandTimerMs: QUESTION_TIMER_MS,
    warMcTimerMs: WAR_MC_TIMER_MS,
    categories: [] as string[],
  };

  // Counts active client sessions per playerInGameId. A player can have
  // multiple tabs open; we only flip player.connected=false when ALL of
  // their tabs have closed. Refreshing one tab no longer "disconnects"
  // the player from the room's perspective.
  private clientsPerPlayer = new Map<string, number>();
  // Timestamp (ms) when the room first saw "only one player still
  // connected" with everyone else gone. If this persists for
  // WALKOVER_TIMEOUT_MS, tick() calls endGameByWalkover. Cleared back to
  // null whenever someone reconnects or the game ends.
  private walkoverStartedAtMs: number | null = null;

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

  // Per-attack working state for war stage (kept off-state so the correct
  // answer doesn't leak before the reveal).
  private currentAttack: {
    attackerId: string;
    defenderId: string;
    countryId: string; // schema country id
    questionRowId: number;
    correctOption: string;
    mcStartedAtMs: number;
    answers: Map<
      string,
      { option: string; isCorrect: boolean; submittedAtMs: number }
    >;
    tieQuestionRowId?: number;
    tieCorrectAnswer?: number;
    tieStartedAtMs?: number;
    tieAnswers: Map<
      string,
      { value: number; receivedAtMs: number; firstInputAtMs: number | null }
    >;
  } | null = null;

  // Telemetry batched and persisted in the final MatchSnapshot at game_over.
  private telemetry: {
    numericAnswers: Array<{
      playerId: string;
      questionId: number;
      category: string;
      value: number;
      diff: number;
      // Source-of-truth answer for the question, so downstream
      // analytics can derive relative-% closeness (diff/correct)
      // instead of relying on an absolute-units threshold.
      correctAnswer: number;
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
    warAnswers: Array<{
      playerId: string;
      attackId: string;
      questionId: number;
      category: string;
      isCorrect: boolean;
      // Role this player took in the war attack. "attacker" picked
      // the target country; "defender" was being attacked. Lets the
      // profile split MC accuracy by side instead of conflating both.
      role: "attacker" | "defender";
      submittedAtMs: number;
    }>;
    attacks: Array<{
      attackerId: string;
      defenderId: string;
      countryId: string;
      outcome: string;
      auto: boolean;
      // True when this attack ended with the defender's capital
      // falling (their whole empire transfers to the attacker). The
      // daily-mission "capture a capital" check needs this flag.
      capitalFell?: boolean;
    }>;
  } = {
    numericAnswers: [],
    capitalPicks: [],
    territoryPicks: [],
    warAnswers: [],
    attacks: [],
  };

  override async onCreate(options: CreateOptions): Promise<void> {
    this.sessionId = options?.sessionId ?? "";
    if (!this.sessionId) {
      throw new Error("MatchRoom requires a sessionId in create options");
    }
    this.startedAtMs = Date.now();

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

    this.onMessage(
      "attack",
      (client, payload: { svgId: string }) => {
        const auth = client.auth as AuthInfo | undefined;
        if (!auth) return;
        void this.handleAttack(auth.playerInGameId, payload?.svgId, false);
      },
    );

    this.onMessage(
      "war_answer",
      (
        client,
        payload: { option: string; submittedAtMs?: number },
      ) => {
        const auth = client.auth as AuthInfo | undefined;
        if (!auth) return;
        this.handleWarAnswer(auth.playerInGameId, payload);
      },
    );

    this.onMessage(
      "war_tie",
      (
        client,
        payload: { value: number; firstInputAtMs?: number | null },
      ) => {
        const auth = client.auth as AuthInfo | undefined;
        if (!auth) return;
        this.handleWarTie(auth.playerInGameId, payload);
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
      this.clientsPerPlayer.set(
        playerId,
        (this.clientsPerPlayer.get(playerId) ?? 0) + 1,
      );
    }
    console.log(
      `[match ${this.roomId}] ${client.sessionId} joined (player=${playerId ?? "?"})`,
    );
  }

  override async onLeave(
    client: Client,
    consented?: boolean,
  ): Promise<void> {
    const auth = client.auth as AuthInfo | undefined;
    const playerId = auth?.playerInGameId;
    if (!playerId) return;

    // Decrement tab counter. Only flip connected=false when ALL of this
    // player's tabs are gone.
    const remaining = (this.clientsPerPlayer.get(playerId) ?? 1) - 1;
    if (remaining > 0) {
      this.clientsPerPlayer.set(playerId, remaining);
      console.log(
        `[match ${this.roomId}] ${client.sessionId} left (player=${playerId}, ${remaining} tabs remain)`,
      );
      return;
    }
    this.clientsPerPlayer.delete(playerId);
    const player = this.state.players.get(playerId);
    if (player) player.connected = false;

    if (consented) {
      // Player explicitly clicked Leave — skip the reconnect window and
      // hand their lands out right now so the others aren't waiting.
      console.log(
        `[match ${this.roomId}] ${client.sessionId} left consented (player=${playerId})`,
      );
      this.abandonPlayer(playerId);
      return;
    }

    // Hold the slot for 30s — closing the tab / refreshing / brief network
    // blip doesn't kill the match for them. If they come back within the
    // window, allowReconnection resolves and we mark them connected again.
    console.log(
      `[match ${this.roomId}] ${client.sessionId} disconnected (player=${playerId}), holding slot for reconnect`,
    );
    try {
      const reconnected = await this.allowReconnection(client, 30);
      if (reconnected) {
        const p = this.state.players.get(playerId);
        if (p) p.connected = true;
        this.clientsPerPlayer.set(
          playerId,
          (this.clientsPerPlayer.get(playerId) ?? 0) + 1,
        );
        console.log(
          `[match ${this.roomId}] ${client.sessionId} reconnected (player=${playerId})`,
        );
        return;
      }
      // allowReconnection resolved but with no client → abandon.
      this.abandonPlayer(playerId);
    } catch {
      // Window expired or room disposed — treat as abandonment.
      this.abandonPlayer(playerId);
      console.log(
        `[match ${this.roomId}] reconnect window expired for ${playerId}`,
      );
    }
  }

  override async onDispose(): Promise<void> {
    console.log(`[match ${this.roomId}] disposed`);
    // Last-chance status flip — if this room is being torn down without
    // ever reaching game_over (all clients disconnected, app shutdown,
    // crash recovery, etc.), the DB row stays "active" forever and
    // forces a stale "Rejoin match" banner on every screen for everyone
    // who was in it. Convert to "cancelled" so the active-game widget
    // filters it out on the next query.
    try {
      const row = await prisma.gameSession.findUnique({
        where: { id: this.sessionId },
        select: { status: true },
      });
      if (row?.status === "active") {
        await prisma.gameSession.update({
          where: { id: this.sessionId },
          data: { status: "cancelled" },
        });
        console.log(
          `[match ${this.roomId}] marked stale active session as cancelled`,
        );
      }
    } catch (err) {
      console.warn(`[match ${this.roomId}] dispose cleanup failed`, err);
    }
  }

  // --- DB → state hydration ---------------------------------------------

  private async hydrateFromDb(): Promise<void> {
    const session = await prisma.gameSession.findUnique({
      where: { id: this.sessionId },
      include: {
        players: {
          include: {
            profile: {
              select: { nickname: true, avatarUrl: true, language: true },
            },
            choices: { select: { key: true, value: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!session) {
      throw new Error(`session ${this.sessionId} not found in DB`);
    }

    // Lock in lobby settings for this match. They can't change after
    // the host hits Start, so a single snapshot at hydrate time is fine.
    this.settings = {
      rankedGame: session.ranked,
      capitalsTimerMs: session.capitalsTimerSec * 1000,
      expandTimerMs: session.expandTimerSec * 1000,
      warMcTimerMs: session.warTimerSec * 1000,
      // Empty array = all categories (matches the lobby UI's "any
      // empty selection means everything" convention). Storing the
      // explicit list of enums lets the DB query stay simple.
      categories: session.categories.map((c) => String(c)),
    };

    // Players. Turn order = lobby join order (matches old behaviour).
    session.players.forEach((p, idx) => {
      const player = new Player();
      player.id = p.id;
      player.profileId = p.profileId;
      player.nickname = p.profile.nickname;
      player.avatarUrl = p.profile.avatarUrl ?? "";
      player.turnOrder = idx;
      const capChoice = p.choices.find((c) => c.key === "capital_style");
      player.capitalStyle = capChoice?.value ?? "standard";
      player.connected = false;
      // Stamp the language so the client can pick its own translation
      // of each question without an extra round trip.
      player.language = p.profile.language ?? "en";
      this.state.players.set(p.id, player);
    });

    // Countries — picked from the shared playable-set keyed by player
    // count (12 / 15 / 20 for 2P / 3P / 4P). The full 45-country SVG
    // is rendered as background on the client; only entries here are
    // interactive and tracked by the game state.
    const playable = playableForCount(session.players.length);
    // Stable templateId = 1-based index in the playable list. We use
    // the index so neighbour ids are deterministic per match.
    const idBySvg = new Map<string, number>();
    playable.forEach((svgId, idx) => idBySvg.set(svgId, idx + 1));
    playable.forEach((svgId, idx) => {
      const templateId = idx + 1;
      const c = new Country();
      c.id = String(templateId);
      c.svgId = svgId;
      c.templateId = templateId;
      this.state.countries.set(c.id, c);
      // Resolve neighbour svgIds → templateIds, filtering out anyone
      // not in this match's playable set (a 2P match shouldn't see UA
      // as a neighbour of PL, for example).
      const neighbourIds: number[] = [];
      for (const n of EUROPE_TOPOLOGY[svgId] ?? []) {
        const nid = idBySvg.get(n);
        if (nid !== undefined) neighbourIds.push(nid);
      }
      this.templateNeighbors.set(templateId, neighbourIds);
    });

    this.state.stage = "capitals";
    this.state.status = "active";
    this.state.turnIndex = 0;
  }

  // --- Tick (deadline driver) -------------------------------------------

  private tick(): void {
    const now = Date.now();
    this.checkWalkover(now);
    if (this.state.stage === "ended") return;
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
    if (this.state.stage === "war") {
      // No active attack and turn deadline expired → auto-attack.
      if (
        !this.state.activeAttack &&
        this.state.warTurnExpiresAt > 0 &&
        now >= this.state.warTurnExpiresAt
      ) {
        this.state.warTurnExpiresAt = 0;
        this.autoAttack();
      }
      // MC question expired without both answers → resolve with whatever.
      // Skip if we're already in the reveal window (resolveWarMc set
      // expiresAt=0 there, but defensive double-check).
      if (
        this.state.activeAttack &&
        !this.state.activeAttack.tieQuestionId &&
        this.state.activeAttack.resolveRevealEndsAt === 0 &&
        this.state.activeAttack.expiresAt > 0 &&
        now >= this.state.activeAttack.expiresAt
      ) {
        this.resolveWarMc();
      }
      // Tie question expired → resolve with whatever.
      if (
        this.state.activeAttack &&
        this.state.activeAttack.tieQuestionId &&
        this.state.activeAttack.tieResolveRevealEndsAt === 0 &&
        this.state.activeAttack.tieExpiresAt > 0 &&
        now >= this.state.activeAttack.tieExpiresAt
      ) {
        this.resolveWarTie();
      }
      return;
    }
  }

  // --- Capitals stage ---------------------------------------------------

  private startCapitalTurn(): void {
    this.state.capitalExpiresAt = Date.now() + this.settings.capitalsTimerMs;
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

  // Set of country templateIds that border any already-placed capital.
  // Used to forbid stacking two capitals on neighbouring tiles.
  private templateIdsAdjacentToCapital(): Set<number> {
    const out = new Set<number>();
    this.state.countries.forEach((c) => {
      if (!c.isCapital) return;
      const ns = this.templateNeighbors.get(c.templateId);
      if (!ns) return;
      for (const n of ns) out.add(n);
    });
    return out;
  }

  // List all unowned countries — separated into "non-adjacent to any
  // existing capital" (preferred) and "adjacent" (escape valve when the
  // map is too dense to find non-adjacent picks). Returning both lets
  // callers fall back gracefully so the stage never deadlocks.
  private freeCapitalCandidates(): { allowed: Country[]; blocked: Country[] } {
    const adj = this.templateIdsAdjacentToCapital();
    const allowed: Country[] = [];
    const blocked: Country[] = [];
    this.state.countries.forEach((c) => {
      if (c.ownerId) return;
      if (adj.has(c.templateId)) blocked.push(c);
      else allowed.push(c);
    });
    return { allowed, blocked };
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

    // Forbid placing a capital adjacent to another capital — UNLESS the
    // map is so dense that no non-adjacent free tile is left (e.g. last
    // picker on a small map). In that case allow it; better to keep the
    // stage flowing than deadlock the room.
    const adjToCapital = this.templateIdsAdjacentToCapital();
    if (adjToCapital.has(country.templateId)) {
      const { allowed } = this.freeCapitalCandidates();
      if (allowed.length > 0) {
        console.log(
          `[match ${this.roomId}] rejected ${svgId} for ${player.nickname} — adjacent to existing capital`,
        );
        return;
      }
    }

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

    // Prefer a free country that ISN'T touching an existing capital —
    // match the constraint we enforce on manual picks. Only fall back
    // to adjacent tiles when the map is too dense for that to work.
    const { allowed, blocked } = this.freeCapitalCandidates();
    const pool = allowed.length > 0 ? allowed : blocked;
    if (pool.length === 0) {
      this.advanceCapitalTurn();
      return;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    console.log(
      `[match ${this.roomId}] auto-pick: ${player.nickname} → ${pick.svgId}`,
    );
    this.handleClaimCapital(player.id, pick.svgId, true);
  }

  private advanceCapitalTurn(): void {
    // Count seats that still need a capital. Abandoned players never
    // will, so exclude them; otherwise we'd loop forever waiting on a
    // ghost.
    let activeNeedingCapital = 0;
    this.state.players.forEach((p) => {
      if (!p.abandoned && !this.playerHasCapital(p.id)) activeNeedingCapital += 1;
    });
    if (activeNeedingCapital === 0) {
      this.transitionToExpand();
      return;
    }
    this.state.turnIndex = this.nextActiveTurnIndex();
    this.state.capitalExpiresAt = Date.now() + this.settings.capitalsTimerMs;
  }

  private transitionToExpand(): void {
    this.state.stage = "expand";
    this.state.capitalExpiresAt = 0;
    this.state.turnIndex = 0;
    // Schedule the first question after a short delay so the UI has time
    // to render the stage change before the question pops in.
    this.state.nextQuestionAt = Date.now() + PHASE_DELAY_MS;
    void this.syncStageToDb("expand");
    console.log(`[match ${this.roomId}] → stage=expand`);
  }

  // Push the current stage to the GameSession row so the dashboard's
  // "Live matches" feed can read it (Colyseus is the source of truth
  // for stage at runtime; without this the DB column stays stuck at
  // "capitals" until game_over).
  private async syncStageToDb(stage: string): Promise<void> {
    try {
      await prisma.gameSession.update({
        where: { id: this.sessionId },
        data: { stage },
      });
    } catch (err) {
      console.warn(
        `[match ${this.roomId}] failed to sync stage=${stage}:`,
        err,
      );
    }
  }

  // --- Expand stage -----------------------------------------------------

  // Where-clause for question pool filtering. Empty categories list =
  // "all categories" — return undefined so Prisma issues an unfiltered
  // query. Cast to `any` because Prisma's generated input type expects
  // the enum literal union; we already validated the strings at lobby-
  // setting write time.
  private questionWhere(): Record<string, unknown> | undefined {
    if (this.settings.categories.length === 0) return undefined;
    return { category: { in: this.settings.categories as unknown[] } };
  }

  // Resolve a random Question groupKey (using category filter), then
  // pull every language translation of that group. Returns the
  // English-fallback row (or the first row if no en exists) for
  // numeric scoring, plus a packed JSON map of text-by-language for
  // the per-player render path.
  private async pickQuestionGroup(): Promise<{
    main: { id: number; text: string; answer: number; category: string };
    textsJson: string;
  } | null> {
    const where = this.questionWhere() as never;
    const count = await prisma.question.count({ where });
    if (count === 0) {
      console.warn(`[match ${this.roomId}] no Question rows in DB`);
      return null;
    }
    const seed = await prisma.question.findFirst({
      where,
      skip: Math.floor(Math.random() * count),
      select: { groupKey: true },
    });
    if (!seed) return null;

    const rows = await prisma.question.findMany({
      where: { groupKey: seed.groupKey },
      select: {
        id: true,
        text: true,
        answer: true,
        category: true,
        language: true,
      },
    });
    if (rows.length === 0) return null;

    const byLang: Record<string, string> = {};
    for (const r of rows) byLang[String(r.language)] = r.text;
    const textsJson = JSON.stringify(byLang);
    const main = rows.find((r) => String(r.language) === "en") ?? rows[0];
    return {
      main: {
        id: main.id,
        text: main.text,
        answer: main.answer,
        category: String(main.category),
      },
      textsJson,
    };
  }

  // Same pattern as pickQuestionGroup but for the MC war-question
  // pool. Shuffles option order once and applies the SAME permutation
  // to every language's options array — so a single correctIndex
  // validates regardless of which language the answering player saw.
  private async pickWarQuestionGroup(): Promise<{
    main: { id: number; text: string; category: string; options: string[] };
    questionTextsJson: string;
    optionsJson: string;
    correctOption: string;
    correctIndex: number;
  } | null> {
    const where = this.questionWhere() as never;
    const count = await prisma.warQuestion.count({ where });
    if (count === 0) {
      console.warn(`[match ${this.roomId}] no WarQuestion rows`);
      return null;
    }
    const seed = await prisma.warQuestion.findFirst({
      where,
      skip: Math.floor(Math.random() * count),
      select: { groupKey: true },
    });
    if (!seed) return null;

    const rows = await prisma.warQuestion.findMany({
      where: { groupKey: seed.groupKey },
      select: {
        id: true,
        text: true,
        options: true,
        correctIndex: true,
        category: true,
        language: true,
      },
    });
    if (rows.length === 0) return null;

    const en = rows.find((r) => String(r.language) === "en") ?? rows[0];

    // Canonical correctIndex: prefer the new explicit column, fall
    // back to locating the legacy `answer` string in the options array
    // for pre-translation rows that haven't been regenerated yet.
    // Every row now has an explicit correctIndex (0-3). Legacy data
    // with correctIndex=-1 is treated as malformed and skipped — the
    // regenerated pool always sets this column.
    const canonicalCorrectIndex = en.correctIndex;
    if (canonicalCorrectIndex < 0 || canonicalCorrectIndex >= en.options.length) {
      console.warn(
        `[match ${this.roomId}] war question ${en.id} has invalid correctIndex=${canonicalCorrectIndex}`,
      );
      return null;
    }

    const perm = shuffledPermutation(en.options.length);
    const newCorrectIndex = perm.indexOf(canonicalCorrectIndex);

    const textsByLang: Record<string, string> = {};
    const optionsByLang: Record<string, string[]> = {};
    for (const r of rows) {
      const lang = String(r.language);
      textsByLang[lang] = r.text;
      // Skip rows whose options length disagrees with the canonical en
      // row — translator slip-up. Falling back to en for that language
      // is safer than rendering a misaligned set.
      if (r.options.length === en.options.length) {
        optionsByLang[lang] = applyPermutation(r.options, perm);
      }
    }
    const shuffledEnOptions =
      optionsByLang.en ?? applyPermutation(en.options, perm);
    if (!optionsByLang.en) optionsByLang.en = shuffledEnOptions;

    return {
      main: {
        id: en.id,
        text: en.text,
        category: String(en.category),
        options: shuffledEnOptions,
      },
      questionTextsJson: JSON.stringify(textsByLang),
      optionsJson: JSON.stringify(optionsByLang),
      correctOption: shuffledEnOptions[newCorrectIndex] ?? "",
      correctIndex: newCorrectIndex,
    };
  }

  private async startQuestion(): Promise<void> {
    if (this.state.stage !== "expand") return;
    if (this.state.activeQuestion) return;
    if (this.state.pickOrder.length > 0) return;

    const picked = await this.pickQuestionGroup();
    if (!picked) return;
    const { main, textsJson } = picked;

    const aq = new ActiveQuestion();
    aq.id = `${main.id}-${Date.now()}`;
    aq.questionId = main.id;
    aq.text = main.text;
    aq.textsJson = textsJson;
    aq.category = main.category;
    aq.expiresAt = Date.now() + this.settings.expandTimerMs;
    this.state.activeQuestion = aq;
    this.state.nextQuestionAt = 0;

    this.currentQuestion = {
      matchQuestionLocalId: aq.id,
      questionRowId: main.id,
      correctAnswer: main.answer,
      startedAtMs: Date.now(),
      answers: new Map(),
    };

    console.log(
      `[match ${this.roomId}] question ${main.id} (${main.category}): "${main.text}"`,
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
        ? Math.max(0, Math.min(this.settings.expandTimerMs, payload.firstInputAtMs))
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

    // Resolve as soon as everyone still in the match has submitted —
    // abandoned players never will, so we exclude them from the quorum.
    let activeCount = 0;
    this.state.players.forEach((p) => {
      if (!p.abandoned) activeCount += 1;
    });
    if (this.currentQuestion.answers.size >= activeCount) {
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

    // Telemetry — store one row per submitted answer. We also include
    // `correctAnswer` so downstream analysis can compute relative
    // closeness (diff / correct) instead of relying on an absolute
    // threshold like "diff <= 5", which is meaningless when answers
    // range from km of border to millions of population.
    for (const a of cq.answers.values()) {
      this.telemetry.numericAnswers.push({
        playerId: a.playerId,
        questionId: cq.questionRowId,
        category: this.state.activeQuestion?.category ?? "general",
        value: a.value,
        diff: Math.abs(a.value - cq.correctAnswer),
        correctAnswer: cq.correctAnswer,
        timeMs: Math.max(0, a.receivedAtMs - cq.startedAtMs),
        firstInputAtMs: a.firstInputAtMs,
        inputChangeCount: a.inputChangeCount,
      });
    }

    // Push results message — ephemeral; clients render briefly then hide.
    this.broadcast("round_results", { results, correctAnswer: cq.correctAnswer });

    // Clear active question immediately so the input box disappears, but
    // hold the pickOrder closed for the reveal window. Without this delay
    // a fast picker could click a territory while other players are still
    // reading the results banner, which felt like a desync.
    this.state.activeQuestion = null;
    this.state.pickOrder.clear();
    this.state.pickExpiresAt = 0;

    console.log(
      `[match ${this.roomId}] question resolved, picks opening in ${PHASE_DELAY_MS}ms`,
    );

    this.clock.setTimeout(() => {
      // Defensive: stage may have moved on (everyone disconnected, etc).
      if (this.state.stage !== "expand") return;
      pickOrder.forEach((id) => this.state.pickOrder.push(id));
      this.state.pickExpiresAt =
        pickOrder.length > 0 ? Date.now() + PICK_TIMER_MS : 0;
    }, PHASE_DELAY_MS);
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

  // --- War stage --------------------------------------------------------

  private async handleAttack(
    attackerId: string,
    svgId: string | undefined,
    auto: boolean,
  ): Promise<void> {
    if (this.state.stage !== "war") return;
    if (this.state.activeAttack) return;
    if (!svgId) return;
    const attacker = this.state.players.get(attackerId);
    if (!attacker) return;
    if (attacker.turnOrder !== this.state.turnIndex) return;

    let target: Country | undefined;
    this.state.countries.forEach((c) => {
      if (c.svgId === svgId) target = c;
    });
    if (!target) return;
    if (!target.ownerId || target.ownerId === attackerId) return;

    // Must be an enemy neighbor
    const enemyNeighbors = this.enemyNeighborSvgIds(attackerId);
    if (!enemyNeighbors.has(svgId)) return;

    const picked = await this.pickWarQuestionGroup();
    if (!picked) return;

    const aa = new ActiveAttack();
    aa.id = `${picked.main.id}-${Date.now()}`;
    aa.attackerId = attackerId;
    aa.defenderId = target.ownerId;
    aa.countryId = target.id;
    aa.questionId = picked.main.id;
    aa.questionText = picked.main.text;
    aa.questionTextsJson = picked.questionTextsJson;
    aa.options = new ArraySchema<string>(...picked.main.options);
    aa.optionsJson = picked.optionsJson;
    aa.correctIndex = picked.correctIndex;
    aa.category = picked.main.category;
    aa.expiresAt = Date.now() + this.settings.warMcTimerMs;
    this.state.activeAttack = aa;
    this.state.warTurnExpiresAt = 0;

    this.currentAttack = {
      attackerId,
      defenderId: target.ownerId,
      countryId: target.id,
      questionRowId: picked.main.id,
      correctOption: picked.correctOption,
      mcStartedAtMs: Date.now(),
      answers: new Map(),
      tieAnswers: new Map(),
    };

    this.telemetry.attacks.push({
      attackerId,
      defenderId: target.ownerId,
      countryId: target.id,
      outcome: "started",
      auto,
    });

    console.log(
      `[match ${this.roomId}] attack: ${attacker.nickname} → ${target.svgId}${auto ? " (auto)" : ""}`,
    );
  }

  private handleWarAnswer(
    playerId: string,
    payload: { option: string; submittedAtMs?: number },
  ): void {
    const ca = this.currentAttack;
    if (!ca) return;
    if (this.state.activeAttack?.tieQuestionId) return; // in tie phase
    if (playerId !== ca.attackerId && playerId !== ca.defenderId) return;
    if (typeof payload.option !== "string") return;

    const isCorrect = payload.option === ca.correctOption;
    const submittedAtMs = Math.max(
      0,
      Math.min(this.settings.warMcTimerMs, payload.submittedAtMs ?? Date.now() - ca.mcStartedAtMs),
    );
    ca.answers.set(playerId, {
      option: payload.option,
      isCorrect,
      submittedAtMs,
    });

    this.telemetry.warAnswers.push({
      playerId,
      attackId: this.state.activeAttack?.id ?? "",
      questionId: ca.questionRowId,
      category: this.state.activeAttack?.category ?? "general",
      isCorrect,
      role: playerId === ca.attackerId ? "attacker" : "defender",
      submittedAtMs,
    });

    // Both answered? resolve.
    if (ca.answers.size >= 2) {
      this.resolveWarMc();
    }
  }

  private resolveWarMc(): void {
    const ca = this.currentAttack;
    const aa = this.state.activeAttack;
    if (!ca || !aa) return;
    // Idempotency — if the reveal phase is already running, ignore further
    // calls (e.g. timer + last submission both racing in).
    if (aa.resolveRevealEndsAt > 0) return;

    const attackerEntry = ca.answers.get(ca.attackerId);
    const defenderEntry = ca.answers.get(ca.defenderId);
    const attackerCorrect = attackerEntry?.isCorrect ?? false;
    const defenderCorrect = defenderEntry?.isCorrect ?? false;
    aa.lastAttackerCorrect = attackerCorrect;
    aa.lastDefenderCorrect = defenderCorrect;
    aa.attackerOption = attackerEntry?.option ?? "";
    aa.defenderOption = defenderEntry?.option ?? "";
    aa.correctOption = ca.correctOption;
    // Stop ticking the question deadline so the timer doesn't reach 0
    // mid-reveal.
    aa.expiresAt = 0;
    aa.resolveRevealEndsAt = Date.now() + WAR_REVEAL_MS;

    let nextOutcome: "tie" | "attacker_won" | "defender_held" | "no_change";
    if (attackerCorrect && defenderCorrect) nextOutcome = "tie";
    else if (attackerCorrect) nextOutcome = "attacker_won";
    else if (defenderCorrect) nextOutcome = "defender_held";
    else nextOutcome = "no_change";

    this.clock.setTimeout(() => {
      // Could have been replaced/cancelled while we were waiting (e.g. room
      // disposed). Ignore stale callbacks.
      if (this.currentAttack !== ca) return;
      if (nextOutcome === "tie") {
        void this.startTieBreaker();
      } else {
        this.endAttack(nextOutcome);
      }
    }, WAR_REVEAL_MS);
  }

  private async startTieBreaker(): Promise<void> {
    const ca = this.currentAttack;
    const aa = this.state.activeAttack;
    if (!ca || !aa) return;

    const picked = await this.pickQuestionGroup();
    if (!picked) {
      this.endAttack("no_change");
      return;
    }
    const { main: q, textsJson } = picked;

    aa.tieQuestionId = q.id;
    aa.tieQuestionText = q.text;
    aa.tieQuestionTextsJson = textsJson;
    aa.tieExpiresAt = Date.now() + WAR_TIE_TIMER_MS;
    aa.expiresAt = 0;
    aa.resolveRevealEndsAt = 0;
    aa.attackerOption = "";
    aa.defenderOption = "";
    aa.correctOption = "";
    aa.tieResolveRevealEndsAt = 0;
    aa.tieCorrectAnswer = 0;
    aa.tieAttackerAnswer = 0;
    aa.tieDefenderAnswer = 0;
    aa.tieAttackerAnswered = false;
    aa.tieDefenderAnswered = false;
    aa.tieAttackerTimeMs = 0;
    aa.tieDefenderTimeMs = 0;

    ca.tieQuestionRowId = q.id;
    ca.tieCorrectAnswer = q.answer;
    ca.tieStartedAtMs = Date.now();
    ca.tieAnswers = new Map();
  }

  private handleWarTie(
    playerId: string,
    payload: { value: number; firstInputAtMs?: number | null },
  ): void {
    const ca = this.currentAttack;
    const aa = this.state.activeAttack;
    if (!ca || !aa || !aa.tieQuestionId) return;
    if (playerId !== ca.attackerId && playerId !== ca.defenderId) return;

    const value = Number(payload.value);
    if (!Number.isFinite(value)) return;

    ca.tieAnswers.set(playerId, {
      value,
      receivedAtMs: Date.now(),
      firstInputAtMs:
        typeof payload.firstInputAtMs === "number"
          ? Math.max(0, Math.min(WAR_TIE_TIMER_MS, payload.firstInputAtMs))
          : null,
    });

    if (ca.tieAnswers.size >= 2) {
      this.resolveWarTie();
    }
  }

  private resolveWarTie(): void {
    const ca = this.currentAttack;
    const aa = this.state.activeAttack;
    if (!ca || ca.tieCorrectAnswer === undefined || !ca.tieStartedAtMs) return;
    if (!aa) return;
    // Idempotency — once the reveal window is running, ignore stragglers
    // (e.g. the deadline tick firing right after both answers came in).
    if (aa.tieResolveRevealEndsAt > 0) return;

    const att = ca.tieAnswers.get(ca.attackerId);
    const def = ca.tieAnswers.get(ca.defenderId);
    const outcome = computeTieResult(
      ca.tieCorrectAnswer,
      att?.value ?? null,
      def?.value ?? null,
      att ? att.receivedAtMs - ca.tieStartedAtMs : null,
      def ? def.receivedAtMs - ca.tieStartedAtMs : null,
    );

    // Publish reveal info so the client can show "correct: X, you: Y,
    // opponent: Z" for WAR_REVEAL_MS before activeAttack disappears.
    aa.tieCorrectAnswer = ca.tieCorrectAnswer;
    aa.tieAttackerAnswer = att?.value ?? 0;
    aa.tieDefenderAnswer = def?.value ?? 0;
    aa.tieAttackerAnswered = att !== undefined;
    aa.tieDefenderAnswered = def !== undefined;
    aa.tieAttackerTimeMs = att ? att.receivedAtMs - ca.tieStartedAtMs : 0;
    aa.tieDefenderTimeMs = def ? def.receivedAtMs - ca.tieStartedAtMs : 0;
    aa.tieExpiresAt = 0;
    aa.tieResolveRevealEndsAt = Date.now() + WAR_REVEAL_MS;

    this.clock.setTimeout(() => {
      // Defensive: if the room was disposed / replaced while waiting.
      if (this.currentAttack !== ca) return;
      this.endAttack(outcome);
    }, WAR_REVEAL_MS);
  }

  private endAttack(
    outcome: "attacker_won" | "defender_held" | "no_change",
  ): void {
    const ca = this.currentAttack;
    const aa = this.state.activeAttack;
    if (!ca || !aa) return;

    const country = this.state.countries.get(ca.countryId);
    if (!country) {
      this.cleanupAttack();
      return;
    }

    let capitalFell = false;
    if (outcome === "attacker_won") {
      const out = attackerWonOutcome({
        isCapital: country.isCapital,
        armies: country.armies,
      });
      if (out.type === "siege_continues") {
        // Capital damaged, siege keeps going — restart MC phase with a
        // fresh question. Keep the active attack live.
        country.armies = out.remainingHp;
        void this.continueAttack();
        return;
      } else if (out.type === "capital_falls") {
        // Defender's whole empire transfers; captured capital becomes a
        // regular territory but keeps its (1000/1500) point value.
        const defenderId = ca.defenderId;
        const attackerId = ca.attackerId;
        country.ownerId = attackerId;
        country.isCapital = false;
        country.armies = 1;
        this.state.countries.forEach((c) => {
          if (c.ownerId === defenderId) c.ownerId = attackerId;
        });
        capitalFell = true;
      } else {
        country.ownerId = ca.attackerId;
        country.armies = 1;
      }
    } else if (outcome === "defender_held") {
      country.points += 100; // successful defence bonus
    }
    // no_change → no mutation

    this.telemetry.attacks.push({
      attackerId: ca.attackerId,
      defenderId: ca.defenderId,
      countryId: ca.countryId,
      outcome,
      auto: false,
      capitalFell,
    });

    this.cleanupAttack();
    this.advanceWarTurn();
  }

  private async continueAttack(): Promise<void> {
    const ca = this.currentAttack;
    const aa = this.state.activeAttack;
    if (!ca || !aa) return;

    const picked = await this.pickWarQuestionGroup();
    if (!picked) {
      this.cleanupAttack();
      this.advanceWarTurn();
      return;
    }

    // Reset tie state, restart MC with new question.
    aa.questionId = picked.main.id;
    aa.questionText = picked.main.text;
    aa.questionTextsJson = picked.questionTextsJson;
    aa.options = new ArraySchema<string>(...picked.main.options);
    aa.optionsJson = picked.optionsJson;
    aa.correctIndex = picked.correctIndex;
    aa.category = picked.main.category;
    aa.expiresAt = Date.now() + this.settings.warMcTimerMs;
    aa.tieQuestionId = 0;
    aa.tieQuestionText = "";
    aa.tieQuestionTextsJson = "";
    aa.tieExpiresAt = 0;
    aa.lastAttackerCorrect = false;
    aa.lastDefenderCorrect = false;
    aa.attackerOption = "";
    aa.defenderOption = "";
    aa.correctOption = "";
    aa.resolveRevealEndsAt = 0;

    ca.questionRowId = picked.main.id;
    ca.correctOption = picked.correctOption;
    ca.mcStartedAtMs = Date.now();
    ca.answers.clear();
    ca.tieAnswers.clear();
    ca.tieQuestionRowId = undefined;
    ca.tieCorrectAnswer = undefined;
    ca.tieStartedAtMs = undefined;
  }

  private cleanupAttack(): void {
    this.state.activeAttack = null;
    this.currentAttack = null;
  }

  // Permanently take a player out of rotation. Called when they hit Leave
  // in the match UI or burn through the 30s reconnect window. Their lands
  // are split among the surviving players (preferring direct neighbours
  // so empires stay contiguous), their pickOrder slot is dropped, and any
  // attack they were part of is cancelled. Subsequent turn-advance logic
  // skips them — see `nextActiveTurnIndex`.
  private abandonPlayer(playerId: string): void {
    const player = this.state.players.get(playerId);
    if (!player || player.abandoned) return;
    if (this.state.stage === "ended") return;
    player.abandoned = true;
    player.connected = false;
    console.log(
      `[match ${this.roomId}] ${player.nickname} abandoned the match`,
    );

    // Cancel any active attack involving them — easier than retrofitting
    // the new ownerId mid-MC. attackerId+defenderId both relevant.
    const aa = this.state.activeAttack;
    const cancelledAttack = Boolean(
      aa && (aa.attackerId === playerId || aa.defenderId === playerId),
    );
    if (cancelledAttack) {
      this.cleanupAttack();
    }

    // Drop them from pickOrder (head or otherwise).
    if (this.state.pickOrder.length > 0) {
      const filtered: string[] = [];
      this.state.pickOrder.forEach((pid) => {
        if (pid !== playerId) filtered.push(pid);
      });
      this.state.pickOrder.clear();
      filtered.forEach((pid) => this.state.pickOrder.push(pid));
      if (this.state.pickOrder.length === 0) {
        // Queue emptied — schedule the next question like advanceTerritoryPick.
        this.state.pickExpiresAt = 0;
        this.state.nextQuestionAt = Date.now() + PHASE_DELAY_MS;
      }
    }

    // Build the list of live recipients up front so we don't redistribute
    // to a player whose own abandon hasn't propagated yet.
    const aliveIds: string[] = [];
    this.state.players.forEach((p) => {
      if (p.id !== playerId && !p.abandoned) aliveIds.push(p.id);
    });

    if (aliveIds.length > 0) {
      // Index countries by templateId so we can look up neighbours.
      const byTemplateId = new Map<number, Country>();
      this.state.countries.forEach((c) =>
        byTemplateId.set(c.templateId, c),
      );

      const playerCountries: Country[] = [];
      this.state.countries.forEach((c) => {
        if (c.ownerId === playerId) playerCountries.push(c);
      });

      for (const c of playerCountries) {
        const neighbors = this.templateNeighbors.get(c.templateId) ?? [];
        const candidates: string[] = [];
        for (const ntid of neighbors) {
          const nc = byTemplateId.get(ntid);
          if (!nc?.ownerId || nc.ownerId === playerId) continue;
          const ownerPlayer = this.state.players.get(nc.ownerId);
          if (ownerPlayer && !ownerPlayer.abandoned) {
            candidates.push(nc.ownerId);
          }
        }
        const newOwnerId =
          candidates.length > 0
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : aliveIds[Math.floor(Math.random() * aliveIds.length)];
        c.ownerId = newOwnerId;
        c.armies = 1;
        c.isCapital = false;
      }
    }

    // If it was their turn (capitals or war), advance.
    if (
      this.state.stage === "capitals" &&
      player.turnOrder === this.state.turnIndex
    ) {
      this.advanceCapitalTurn();
    } else if (this.state.stage === "war" && !this.state.activeAttack) {
      if (player.turnOrder === this.state.turnIndex) {
        // The current attacker left — move on to the next player.
        this.advanceWarTurn();
      } else if (cancelledAttack && this.state.warTurnExpiresAt === 0) {
        // A non-current player (the defender) abandoned mid-attack. The
        // attack was cancelled, but the attacker's turn deadline was
        // zeroed when the attack began — without re-arming it the tick
        // loop never auto-attacks and the match softlocks. Give the
        // current attacker a fresh deadline to act (or be auto-attacked).
        this.state.warTurnExpiresAt = Date.now() + WAR_TURN_TIMER_MS;
      }
    }

    // If a question is waiting on this player's answer, the
    // "all-answered" check should now be satisfied.
    this.maybeResolveQuestionEarly();
  }

  // If everyone who's still in the game has submitted an answer for the
  // current question, resolve now. Called from abandonPlayer in case the
  // departing player was the last one we were waiting on.
  private maybeResolveQuestionEarly(): void {
    if (this.state.stage !== "expand") return;
    if (!this.currentQuestion) return;
    let activeCount = 0;
    this.state.players.forEach((p) => {
      if (!p.abandoned) activeCount += 1;
    });
    if (this.currentQuestion.answers.size >= activeCount) {
      this.resolveQuestion();
    }
  }

  // Round-robin turnOrder advance that skips players who can't act this
  // stage. Always skips abandoned players; during war, also skips
  // anyone whose last land is gone (they're alive but eliminated — no
  // territory to attack from, so giving them the highlight is just a
  // dead turn). Returns the new turnIndex.
  private nextActiveTurnIndex(): number {
    const size = Math.max(1, this.state.players.size);
    let idx = (this.state.turnIndex + 1) % size;
    const start = idx;
    // War-stage land count: precomputed so the predicate doesn't loop
    // the country map for every candidate.
    const landByPlayer = new Map<string, number>();
    if (this.state.stage === "war") {
      this.state.countries.forEach((c) => {
        if (c.ownerId)
          landByPlayer.set(c.ownerId, (landByPlayer.get(c.ownerId) ?? 0) + 1);
      });
    }
    do {
      const p = this.playerByTurnOrder(idx);
      if (p && !p.abandoned) {
        if (this.state.stage !== "war") return idx;
        if ((landByPlayer.get(p.id) ?? 0) > 0) return idx;
      }
      idx = (idx + 1) % size;
    } while (idx !== start);
    return idx;
  }

  private advanceWarTurn(): void {
    // Increment warTurns. Compute end-of-game first.
    this.state.warTurns += 1;

    const counts = new Map<string, number>();
    const points = new Map<string, number>();
    this.state.countries.forEach((c) => {
      if (c.ownerId) {
        counts.set(c.ownerId, (counts.get(c.ownerId) ?? 0) + 1);
        points.set(c.ownerId, (points.get(c.ownerId) ?? 0) + c.points);
      }
    });
    const playersWithLand = Array.from(counts.values()).filter((n) => n > 0)
      .length;
    const reason = warEndReason(
      this.state.warTurns,
      this.state.players.size,
      MAX_WAR_ROUNDS,
      playersWithLand,
    );

    if (reason !== null) {
      this.endGame(reason, points, counts);
      return;
    }

    // Advance to the next non-abandoned player. nextActiveTurnIndex
    // round-robins past anyone who's left the match.
    this.state.turnIndex = this.nextActiveTurnIndex();
    this.state.warTurnExpiresAt = Date.now() + WAR_TURN_TIMER_MS;
  }

  private autoAttack(): void {
    const player = this.playerByTurnOrder(this.state.turnIndex);
    if (!player) return;
    const enemies = this.enemyNeighborSvgIds(player.id);
    if (enemies.size === 0) {
      // No reachable enemy — skip this turn.
      this.state.warTurnExpiresAt = 0;
      this.advanceWarTurn();
      return;
    }
    const arr = Array.from(enemies);
    const target = arr[Math.floor(Math.random() * arr.length)];
    void this.handleAttack(player.id, target, true);
  }

  // Set of svgIds of enemy-owned countries that border any of the given
  // player's countries.
  private enemyNeighborSvgIds(playerId: string): Set<string> {
    const myTids = new Set<number>();
    this.state.countries.forEach((c) => {
      if (c.ownerId === playerId) myTids.add(c.templateId);
    });
    const neighborTids = new Set<number>();
    for (const tid of myTids) {
      const ns = this.templateNeighbors.get(tid);
      if (ns) ns.forEach((n: number) => neighborTids.add(n));
    }
    const out = new Set<string>();
    this.state.countries.forEach((c) => {
      if (
        c.ownerId &&
        c.ownerId !== playerId &&
        neighborTids.has(c.templateId)
      )
        out.add(c.svgId);
    });
    return out;
  }

  // --- Game end ---------------------------------------------------------

  // Walkover detection — runs every tick. If everyone except one player
  // has dropped, wait a short window (longer if anyone is still inside
  // the 30s reconnect grace, shorter if everyone left explicitly) and
  // hand the win to whoever's still around.
  private checkWalkover(now: number): void {
    if (this.state.stage === "ended") return;
    // "Total seats that started the match" — including abandoned ones.
    // For a 1v1 walkover doesn't make sense, but a 3-player game where
    // two abandoned should still finish on the last one alone.
    let totalSeats = 0;
    this.state.players.forEach(() => (totalSeats += 1));
    if (totalSeats < 2) return;
    let activeCount = 0;
    let lone: Player | null = null;
    // If any non-survivor is "disconnected but not yet abandoned" they
    // might still come back within the 30s reconnect window. In that
    // case we wait longer than for an explicit Leave.
    let anyReconnectable = false;
    this.state.players.forEach((p) => {
      if (p.connected && !p.abandoned) {
        activeCount += 1;
        lone = p;
      } else if (!p.connected && !p.abandoned) {
        anyReconnectable = true;
      }
    });
    if (activeCount === 1 && lone) {
      const survivor = lone as Player;
      const timeoutMs = anyReconnectable
        ? WALKOVER_TIMEOUT_MS_DISCONNECT
        : WALKOVER_TIMEOUT_MS_CONSENTED;
      if (this.walkoverStartedAtMs === null) {
        this.walkoverStartedAtMs = now;
        console.log(
          `[match ${this.roomId}] walkover countdown — ${survivor.nickname} alone (${timeoutMs}ms)`,
        );
      } else if (now - this.walkoverStartedAtMs >= timeoutMs) {
        const winnerId = survivor.id;
        this.walkoverStartedAtMs = null;
        console.log(
          `[match ${this.roomId}] walkover → ${survivor.nickname}`,
        );
        this.endGameByWalkover(winnerId);
      }
    } else {
      // Someone came back (or the room is empty / single-player config).
      this.walkoverStartedAtMs = null;
    }
  }

  private endGameByWalkover(winnerId: string): void {
    // Idempotency guard — both the walkover tick and a natural game-end
    // path (or a late endAttack setTimeout) can race into an end call.
    // persistFinalSnapshot → updatePlayerStats does non-idempotent ELO /
    // W-L / coin increments, so a double-entry would corrupt stats.
    if (this.state.stage === "ended") return;
    this.state.winnerId = winnerId;
    this.state.stage = "ended";
    this.state.status = "completed";
    this.state.warTurnExpiresAt = 0;
    this.state.activeQuestion = null;
    this.state.activeAttack = null;
    void this.persistFinalSnapshot();
  }

  private endGame(
    _reason: "sole_survivor" | "rounds_exhausted",
    points: Map<string, number>,
    counts: Map<string, number>,
  ): void {
    // Idempotency guard — see endGameByWalkover. Prevents a double
    // persist / double ELO write if two end paths fire in one window.
    if (this.state.stage === "ended") return;
    // Winner — most points among alive players (sole_survivor) or among
    // everyone (rounds_exhausted). winnerByLands ranks by counts (we feed
    // it the points map for a tie-friendly ranking).
    const playerArr: Player[] = [];
    this.state.players.forEach((p) => {
      if (
        _reason === "sole_survivor"
          ? (counts.get(p.id) ?? 0) > 0
          : true
      ) {
        playerArr.push(p);
      }
    });
    const winner = winnerByLands(playerArr, points);
    this.state.winnerId = winner?.id ?? "";
    this.state.stage = "ended";
    this.state.status = "completed";
    this.state.warTurnExpiresAt = 0;
    this.state.activeQuestion = null;
    this.state.activeAttack = null;

    console.log(
      `[match ${this.roomId}] game_over (reason=${_reason}, winner=${winner?.nickname ?? "none"})`,
    );

    // MatchSnapshot persistence happens in Phase 3.6 — wired right here.
    void this.persistFinalSnapshot();
  }

  private async persistFinalSnapshot(): Promise<void> {
    const duration = Date.now() - this.startedAtMs;

    // Snapshot a plain-JS view of the schema for storage. Including only
    // analysis-relevant fields keeps the JSON small and decoupled from the
    // exact schema layout (which may evolve).
    const players: Array<{
      id: string;
      profileId: string;
      nickname: string;
      turnOrder: number;
      capitalStyle: string;
      abandoned: boolean;
    }> = [];
    this.state.players.forEach((p) => {
      players.push({
        id: p.id,
        profileId: p.profileId,
        nickname: p.nickname,
        turnOrder: p.turnOrder,
        capitalStyle: p.capitalStyle,
        abandoned: p.abandoned,
      });
    });
    const countries: Array<{
      svgId: string;
      templateId: number;
      ownerId: string | null;
      isCapital: boolean;
      armies: number;
      maxArmies: number;
      points: number;
    }> = [];
    this.state.countries.forEach((c) => {
      countries.push({
        svgId: c.svgId,
        templateId: c.templateId,
        ownerId: c.ownerId || null,
        isCapital: c.isCapital,
        armies: c.armies,
        maxArmies: c.maxArmies,
        points: c.points,
      });
    });
    const finalState = {
      stage: this.state.stage,
      status: this.state.status,
      winnerId: this.state.winnerId || null,
      warTurns: this.state.warTurns,
      players,
      countries,
    };

    try {
      // Flip session.status FIRST so the floating "match in progress"
      // pill on every connected client's dashboard drops within the
      // next poll tick — the snapshot upsert below ships a heavy JSON
      // blob and would otherwise stall the status flip by hundreds of
      // ms. Both writes are independent rows, so order doesn't affect
      // correctness.
      await prisma.gameSession.update({
        where: { id: this.sessionId },
        data: {
          status: "completed",
          stage: "ended",
          winnerId: this.state.winnerId || null,
        },
      });

      await prisma.matchSnapshot.upsert({
        where: { sessionId: this.sessionId },
        create: {
          sessionId: this.sessionId,
          winnerId: this.state.winnerId || null,
          duration,
          finalState,
          telemetry: this.telemetry,
        },
        update: {
          winnerId: this.state.winnerId || null,
          duration,
          telemetry: this.telemetry,
          finalState,
        },
      });

      await this.updatePlayerStats();

      console.log(
        `[match ${this.roomId}] snapshot persisted (duration=${duration}ms)`,
      );
    } catch (err) {
      console.error(`[match ${this.roomId}] snapshot persist failed:`, err);
    }
  }

  private async updatePlayerStats(): Promise<void> {
    const playerArr: Player[] = [];
    this.state.players.forEach((p) => playerArr.push(p));
    if (playerArr.length === 0) return;

    // Pull current ELO so we can do the pairwise update.
    const profiles = await prisma.playerProfile.findMany({
      where: { id: { in: playerArr.map((p) => p.profileId) } },
      select: { id: true, elo: true, level: true, experience: true },
    });
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const winnerProfileId =
      this.state.winnerId
        ? this.state.players.get(this.state.winnerId)?.profileId ?? null
        : null;

    // Aggregate points held per player at end of match (used for XP scaling).
    const pointsByPlayer = new Map<string, number>();
    this.state.countries.forEach((c) => {
      if (c.ownerId)
        pointsByPlayer.set(
          c.ownerId,
          (pointsByPlayer.get(c.ownerId) ?? 0) + c.points,
        );
    });

    // Pre-compute placement (1st, 2nd, …) by points-held so the
    // mission updater has a stable rank for each player.
    const rankedPlayerIds = [...playerArr]
      .sort(
        (a, b) =>
          (pointsByPlayer.get(b.id) ?? 0) - (pointsByPlayer.get(a.id) ?? 0),
      )
      .map((p) => p.id);
    const placeByPlayerId = new Map<string, number>();
    rankedPlayerIds.forEach((id, idx) => placeByPlayerId.set(id, idx + 1));

    // Per-player aggregates derived from this match's telemetry. Used
    // by the daily-mission updater so missions like "capture a capital"
    // or "5 correct war answers" can hit their counters in one pass.
    const capitalsCapturedByPlayer = new Map<string, number>();
    const warCorrectByPlayer = new Map<string, number>();
    for (const a of this.telemetry.attacks) {
      if (a.capitalFell && a.outcome === "attacker_won") {
        capitalsCapturedByPlayer.set(
          a.attackerId,
          (capitalsCapturedByPlayer.get(a.attackerId) ?? 0) + 1,
        );
      }
    }
    for (const w of this.telemetry.warAnswers) {
      if (!w.isCorrect) continue;
      warCorrectByPlayer.set(
        w.playerId,
        (warCorrectByPlayer.get(w.playerId) ?? 0) + 1,
      );
    }

    // Anti-abuse: anyone who walked out mid-match pays an extra penalty
    // on top of the natural loss, so rage-quitting against a stronger
    // opponent never costs less ELO than just losing the match.
    const leavers = new Set<string>();
    for (const p of playerArr) {
      if (p.abandoned && p.profileId !== winnerProfileId) {
        leavers.add(p.profileId);
      }
    }
    const eloDelta = computeEloChanges(
      playerArr.map((p) => ({
        profileId: p.profileId,
        elo: profileById.get(p.profileId)?.elo ?? 1000,
      })),
      winnerProfileId,
      undefined,
      leavers,
    );

    for (const p of playerArr) {
      const profile = profileById.get(p.profileId);
      if (!profile) continue;
      const isWinner = p.id === this.state.winnerId;
      const points = pointsByPlayer.get(p.id) ?? 0;
      const xpEarned = computeXpEarned(isWinner, points);
      const { level, experience } = applyExperience(
        profile.level,
        profile.experience,
        xpEarned,
      );
      const delta = eloDelta.get(p.profileId) ?? 0;

      // Custom matches don't touch ELO or W/L counters — XP / level /
      // coins / achievements still credit so casual lobbies aren't
      // completely dead, but the ranked stats stay clean. See the
      // /lobby settings panel: switching to Custom advertises this in
      // the Reward row.
      const ranked = this.settings.rankedGame;
      await prisma.playerProfile.update({
        where: { id: p.profileId },
        data: {
          gamesPlayed: ranked ? { increment: 1 } : undefined,
          gamesWon: ranked && isWinner ? { increment: 1 } : undefined,
          gamesLost:
            ranked && !isWinner && winnerProfileId !== null
              ? { increment: 1 }
              : undefined,
          experience,
          level,
          ...(ranked ? { elo: { increment: delta } } : {}),
        },
      });

      // Only ranked matches feed the ELO chart — custom games would
      // create misleading "rating dips" on the profile page.
      if (ranked) {
        await prisma.eloHistoryEntry.create({
          data: {
            profileId: p.profileId,
            sessionId: this.sessionId,
            eloAfter: profile.elo + delta,
            delta,
            isWinner,
          },
        });
      }

      // Evaluate achievement unlocks. Anything new gets a row in the
      // Achievement table — no toast notification yet, the user sees it
      // next time they open their profile.
      await this.unlockAchievementsFor(p.profileId);

      // Daily-mission progress + auto-claim. Reads today's PlayerMission
      // rows and increments per `progressIncrement(code, outcome)`.
      // Completion credits coins immediately.
      const outcome: MatchOutcome = {
        isWinner,
        place: placeByPlayerId.get(p.id) ?? playerArr.length,
        totalPlayers: playerArr.length,
        capitalsCaptured: capitalsCapturedByPlayer.get(p.id) ?? 0,
        warCorrect: warCorrectByPlayer.get(p.id) ?? 0,
      };
      await this.progressDailyMissionsFor(p.profileId, outcome);
    }
  }

  // Walk today's PlayerMission rows for this profile, apply progress
  // for the just-finished match, and auto-claim coins for any that
  // just crossed their target. Done in a single update per row so a
  // crash mid-loop never double-pays.
  private async progressDailyMissionsFor(
    profileId: string,
    outcome: MatchOutcome,
  ): Promise<void> {
    try {
      const day = utcDayKey();
      const rows = await prisma.playerMission.findMany({
        where: { profileId, day, completedAt: null },
      });
      if (rows.length === 0) return;
      let coinPayout = 0;
      const claimedCodes: string[] = [];
      for (const row of rows) {
        const inc = progressIncrement(row.missionCode, outcome);
        if (inc <= 0) continue;
        const next = Math.min(row.target, row.current + inc);
        const justCompleted = next >= row.target && row.completedAt === null;
        const now = justCompleted ? new Date() : null;
        await prisma.playerMission.update({
          where: { id: row.id },
          data: {
            current: next,
            ...(justCompleted ? { completedAt: now, claimedAt: now } : {}),
          },
        });
        if (justCompleted) {
          coinPayout += row.reward;
          claimedCodes.push(row.missionCode);
        }
      }
      if (coinPayout > 0) {
        await prisma.playerProfile.update({
          where: { id: profileId },
          data: { coins: { increment: coinPayout } },
        });
        console.log(
          `[match ${this.roomId}] +${coinPayout} coins (missions: ${claimedCodes.join(", ")}) → ${profileId}`,
        );
      }
    } catch (err) {
      console.warn(
        `[match ${this.roomId}] mission progress failed for ${profileId}:`,
        err,
      );
    }
  }

  // Pulls the freshly-updated profile + recent results, runs the pure
  // achievement evaluator, and inserts rows for any codes that just
  // crossed the threshold. The unique constraint on (profileId, code)
  // makes the createMany idempotent even if this runs twice.
  private async unlockAchievementsFor(profileId: string): Promise<void> {
    try {
      const [profile, recent, existing] = await Promise.all([
        prisma.playerProfile.findUnique({
          where: { id: profileId },
          select: {
            gamesPlayed: true,
            gamesWon: true,
            elo: true,
            birthYear: true,
            gender: true,
            education: true,
            occupation: true,
            mbti: true,
          },
        }),
        prisma.eloHistoryEntry.findMany({
          where: { profileId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { isWinner: true },
        }),
        prisma.achievement.findMany({
          where: { profileId },
          select: { code: true },
        }),
      ]);
      if (!profile) return;
      const demographicComplete = Boolean(
        profile.birthYear &&
          profile.gender &&
          profile.education &&
          profile.occupation &&
          profile.mbti,
      );
      const earned = evaluateAchievements({
        gamesPlayed: profile.gamesPlayed,
        gamesWon: profile.gamesWon,
        elo: profile.elo,
        recentWins: recent.map((r) => r.isWinner),
        demographicComplete,
      });
      const have = new Set(existing.map((r) => r.code));
      const fresh = earned.filter((code) => !have.has(code));
      if (fresh.length === 0) return;
      await prisma.achievement.createMany({
        data: fresh.map((code) => ({ profileId, code })),
        skipDuplicates: true,
      });
      // Credit Q-coins for each fresh unlock. Payout per achievement is
      // determined by its rarity tier (see ACHIEVEMENT_COIN_REWARD).
      let coinPayout = 0;
      for (const code of fresh) {
        const def = ACHIEVEMENT_BY_CODE[code];
        if (def) coinPayout += coinRewardFor(def.rarity);
      }
      if (coinPayout > 0) {
        await prisma.playerProfile.update({
          where: { id: profileId },
          data: { coins: { increment: coinPayout } },
        });
        console.log(
          `[match ${this.roomId}] +${coinPayout} coins for ${profileId} (achievements: ${fresh.join(", ")})`,
        );
      }
    } catch (err) {
      console.warn(
        `[match ${this.roomId}] achievement evaluation failed for ${profileId}`,
        err,
      );
    }
  }

  // --- Stage transitions -----------------------------------------------

  private transitionToWar(): void {
    this.state.stage = "war";
    this.state.pickOrder.clear();
    this.state.pickExpiresAt = 0;
    this.state.activeQuestion = null;
    this.state.nextQuestionAt = 0;
    void this.syncStageToDb("war");

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
