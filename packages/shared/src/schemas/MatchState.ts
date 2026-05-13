// Colyseus state schema for an active match. Defined via the functional
// `defineTypes()` API. Initial values are assigned in constructors instead
// of via class field initializers — class fields run BEFORE the schema's
// generated getters/setters are installed by defineTypes(), so initializer
// values get shadowed and never reach the wire.
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
  declare id: string;
  declare svgId: string;
  declare ownerId: string;
  declare isCapital: boolean;
  declare armies: number;
  declare maxArmies: number;
  declare points: number;
  declare templateId: number;

  constructor() {
    super();
    this.id = "";
    this.svgId = "";
    this.ownerId = "";
    this.isCapital = false;
    this.armies = 1;
    this.maxArmies = 1;
    this.points = 200;
    this.templateId = 0;
  }
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
  declare id: string;
  declare profileId: string;
  declare nickname: string;
  declare turnOrder: number;
  declare capitalStyle: string;
  declare connected: boolean;

  constructor() {
    super();
    this.id = "";
    this.profileId = "";
    this.nickname = "";
    this.turnOrder = 0;
    this.capitalStyle = "standard";
    this.connected = false;
  }
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
  declare id: string;
  declare questionId: number;
  declare text: string;
  declare category: string;
  declare expiresAt: number;

  constructor() {
    super();
    this.id = "";
    this.questionId = 0;
    this.text = "";
    this.category = "general";
    this.expiresAt = 0;
  }
}
defineTypes(ActiveQuestion, {
  id: "string",
  questionId: "number",
  text: "string",
  category: "string",
  expiresAt: "number",
});

export class ActiveAttack extends Schema {
  declare id: string;
  declare attackerId: string;
  declare defenderId: string;
  declare countryId: string;
  declare questionId: number;
  declare questionText: string;
  declare correctOption: string;
  declare options: ArraySchema<string>;
  declare category: string;
  declare expiresAt: number;
  declare tieQuestionId: number;
  declare tieQuestionText: string;
  declare tieExpiresAt: number;
  declare lastAttackerCorrect: boolean;
  declare lastDefenderCorrect: boolean;
  declare attackerOption: string;
  declare defenderOption: string;
  // While > now, server is holding the result on screen so clients can
  // show a "X picked Y, correct was Z" reveal before the next phase.
  declare resolveRevealEndsAt: number;
  // Tie-breaker reveal info. Set after both players have submitted (or the
  // timer expired) so the client can show "correct: 42, attacker: 40,
  // defender: 50" for WAR_REVEAL_MS before the attack closes out.
  declare tieCorrectAnswer: number;
  declare tieAttackerAnswer: number;
  declare tieDefenderAnswer: number;
  declare tieAttackerAnswered: boolean;
  declare tieDefenderAnswered: boolean;
  declare tieResolveRevealEndsAt: number;

  constructor() {
    super();
    this.id = "";
    this.attackerId = "";
    this.defenderId = "";
    this.countryId = "";
    this.questionId = 0;
    this.questionText = "";
    this.correctOption = "";
    this.options = new ArraySchema<string>();
    this.category = "general";
    this.expiresAt = 0;
    this.tieQuestionId = 0;
    this.tieQuestionText = "";
    this.tieExpiresAt = 0;
    this.lastAttackerCorrect = false;
    this.lastDefenderCorrect = false;
    this.attackerOption = "";
    this.defenderOption = "";
    this.resolveRevealEndsAt = 0;
    this.tieCorrectAnswer = 0;
    this.tieAttackerAnswer = 0;
    this.tieDefenderAnswer = 0;
    this.tieAttackerAnswered = false;
    this.tieDefenderAnswered = false;
    this.tieResolveRevealEndsAt = 0;
  }
}
defineTypes(ActiveAttack, {
  id: "string",
  attackerId: "string",
  defenderId: "string",
  countryId: "string",
  questionId: "number",
  questionText: "string",
  correctOption: "string",
  options: ["string"],
  category: "string",
  expiresAt: "number",
  tieQuestionId: "number",
  tieQuestionText: "string",
  tieExpiresAt: "number",
  lastAttackerCorrect: "boolean",
  lastDefenderCorrect: "boolean",
  attackerOption: "string",
  defenderOption: "string",
  resolveRevealEndsAt: "number",
  tieCorrectAnswer: "number",
  tieAttackerAnswer: "number",
  tieDefenderAnswer: "number",
  tieAttackerAnswered: "boolean",
  tieDefenderAnswered: "boolean",
  tieResolveRevealEndsAt: "number",
});

export class MatchState extends Schema {
  declare stage: string;
  declare status: string;
  declare winnerId: string;
  declare turnIndex: number;
  declare pickOrder: ArraySchema<string>;
  declare capitalExpiresAt: number;
  declare pickExpiresAt: number;
  declare nextQuestionAt: number;
  declare warTurnExpiresAt: number;
  declare warTurns: number;
  declare players: MapSchema<Player>;
  declare countries: MapSchema<Country>;
  declare activeQuestion: ActiveQuestion | null;
  declare activeAttack: ActiveAttack | null;

  constructor() {
    super();
    this.stage = "capitals";
    this.status = "active";
    this.winnerId = "";
    this.turnIndex = 0;
    this.pickOrder = new ArraySchema<string>();
    this.capitalExpiresAt = 0;
    this.pickExpiresAt = 0;
    this.nextQuestionAt = 0;
    this.warTurnExpiresAt = 0;
    this.warTurns = 0;
    this.players = new MapSchema<Player>();
    this.countries = new MapSchema<Country>();
    this.activeQuestion = null;
    this.activeAttack = null;
  }
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
