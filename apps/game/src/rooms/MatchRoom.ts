// Authoritative game room. One instance per active match. Owns the entire
// game state in memory and broadcasts diffs to connected clients via
// @colyseus/schema.
//
// This file currently contains only the skeleton — onCreate/onJoin/onLeave
// + a ping handler so we can verify the server end-to-end before porting
// any real game logic.

import { Room, Client } from "colyseus";
import { MatchState } from "@quiz/shared/schemas";

export class MatchRoom extends Room<MatchState> {
  override async onCreate(): Promise<void> {
    const state = new MatchState();
    state.stage = "capitals";
    state.turnIndex = 0;
    this.setState(state);

    // Cap room size so we never accidentally accept more than 4 players.
    this.maxClients = 4;

    this.onMessage("ping", (client, payload) => {
      client.send("pong", { ts: Date.now(), echo: payload });
    });

    console.log(`[match] room created (id=${this.roomId})`);
  }

  override onJoin(client: Client): void {
    console.log(`[match] ${client.sessionId} joined`);
  }

  override onLeave(client: Client): void {
    console.log(`[match] ${client.sessionId} left`);
  }

  override onDispose(): void {
    console.log(`[match] room disposed (id=${this.roomId})`);
  }
}
