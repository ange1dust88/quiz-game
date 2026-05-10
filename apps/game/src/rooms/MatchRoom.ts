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
import { capitalParamsForChoice, verifyJwt } from "@quiz/shared";
import { Country, MatchState, Player } from "@quiz/shared/schemas";

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
const TICK_INTERVAL_MS = 250;

export class MatchRoom extends Room<MatchState> {
  // Set in onCreate. Used by handlers to look up DB rows and write back at
  // game_over.
  private sessionId = "";

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
      this.handleClaimCapital(auth.playerInGameId, payload?.svgId);
    });

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
    }

    this.state.stage = "capitals";
    this.state.status = "active";
    this.state.turnIndex = 0;
  }

  // --- Tick (deadline driver) -------------------------------------------

  private tick(): void {
    if (
      this.state.stage === "capitals" &&
      this.state.capitalExpiresAt > 0 &&
      Date.now() >= this.state.capitalExpiresAt
    ) {
      this.autoPickCapital();
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
  private handleClaimCapital(playerId: string, svgId: string | undefined): void {
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

    console.log(
      `[match ${this.roomId}] ${player.nickname} → capital ${country.svgId}`,
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
    this.handleClaimCapital(player.id, pick.svgId);
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
    // Question scheduling happens in Phase 3.4. For now the state just
    // settles in expand with no active question — clients see the new
    // stage but no UI-driven actions until 3.4 is wired up.
    console.log(`[match ${this.roomId}] → stage=expand`);
  }
}
