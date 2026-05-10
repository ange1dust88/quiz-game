// Colyseus state schema for an active match. Defined via the functional
// `defineTypes()` API instead of decorators because tsx/esbuild's handling
// of TS legacy decorators is fragile across runtimes.
//
// Schema is mutated in place by the server; @colyseus/schema diffs and
// broadcasts only the changes to all connected clients.

import {
  Schema,
  ArraySchema,
  MapSchema,
  defineTypes,
} from "@colyseus/schema";

export class Country extends Schema {
  id: string = "";
  svgId: string = "";
  ownerId: string | null = null;
  isCapital: boolean = false;
  armies: number = 1;
  maxArmies: number = 1;
  points: number = 200;
  templateId: number = 0;
}
defineTypes(Country, {
  id: "string",
  svgId: "string",
  ownerId: "string",
  isCapital: "boolean",
  armies: "number",
  maxArmies: "number",
  points: "number",
  templateId: "number",
});

export class Player extends Schema {
  id: string = ""; // PlayerInGame.id from DB
  profileId: string = "";
  nickname: string = "";
  turnOrder: number = 0;
  capitalStyle: string = "standard";
  connected: boolean = false;
}
defineTypes(Player, {
  id: "string",
  profileId: "string",
  nickname: "string",
  turnOrder: "number",
  capitalStyle: "string",
  connected: "boolean",
});

export class ActiveQuestion extends Schema {
  id: string = "";
  questionId: number = 0;
  text: string = "";
  category: string = "general";
  expiresAt: number = 0; // ms epoch
}
defineTypes(ActiveQuestion, {
  id: "string",
  questionId: "number",
  text: "string",
  category: "string",
  expiresAt: "number",
});

export class ActiveAttack extends Schema {
  id: string = "";
  attackerId: string = "";
  defenderId: string = "";
  countryId: string = "";
  questionId: number = 0;
  questionText: string = "";
  options: ArraySchema<string> = new ArraySchema<string>();
  category: string = "general";
  expiresAt: number = 0;
  // Tie-breaker fields
  tieQuestionId: number = 0;
  tieQuestionText: string = "";
  tieExpiresAt: number = 0;
  // Reveal flags after MC round resolves
  lastAttackerCorrect: boolean = false;
  lastDefenderCorrect: boolean = false;
}
defineTypes(ActiveAttack, {
  id: "string",
  attackerId: "string",
  defenderId: "string",
  countryId: "string",
  questionId: "number",
  questionText: "string",
  options: ["string"],
  category: "string",
  expiresAt: "number",
  tieQuestionId: "number",
  tieQuestionText: "string",
  tieExpiresAt: "number",
  lastAttackerCorrect: "boolean",
  lastDefenderCorrect: "boolean",
});

export class MatchState extends Schema {
  // Lifecycle
  stage: string = "capitals"; // capitals | expand | war | ended
  status: string = "active"; // active | completed
  winnerId: string | null = null;

  // Turn / pick state
  turnIndex: number = 0;
  pickOrder: ArraySchema<string> = new ArraySchema<string>();

  // Deadlines (ms epoch). 0 = no active deadline.
  capitalExpiresAt: number = 0;
  pickExpiresAt: number = 0;
  nextQuestionAt: number = 0;
  warTurnExpiresAt: number = 0;

  // War round counter
  warTurns: number = 0;

  // Live game data
  players: MapSchema<Player> = new MapSchema<Player>();
  countries: MapSchema<Country> = new MapSchema<Country>();
  activeQuestion: ActiveQuestion | null = null;
  activeAttack: ActiveAttack | null = null;
}
defineTypes(MatchState, {
  stage: "string",
  status: "string",
  winnerId: "string",
  turnIndex: "number",
  pickOrder: ["string"],
  capitalExpiresAt: "number",
  pickExpiresAt: "number",
  nextQuestionAt: "number",
  warTurnExpiresAt: "number",
  warTurns: "number",
  players: { map: Player },
  countries: { map: Country },
  activeQuestion: ActiveQuestion,
  activeAttack: ActiveAttack,
});
