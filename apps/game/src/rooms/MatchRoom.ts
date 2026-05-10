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
import { verifyJwt } from "@quiz/shared";
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

    this.onMessage("ping", (client, payload) => {
      client.send("pong", { ts: Date.now(), echo: payload });
    });

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

    // Mirror the lifecycle fields from the existing GameSession row so the
    // new room continues from where the old code left off (or from defaults
    // if this is the first run after migration).
    this.state.stage = "capitals";
    this.state.status = "active";
    this.state.turnIndex = 0;
  }
}
