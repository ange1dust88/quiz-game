"use server";

import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  applyExperience,
  computeEloChanges,
  computePickOrder,
  computeTieResult,
  computeXpEarned,
  rankAnswers,
  sanitizeHoverTrail,
  territoriesForPlace,
  warEndReason,
  winnerByLands,
} from "./gameLogic";
import { capitalParamsForChoice } from "@/app/lib/matchChoices";
import { MAX_WAR_ROUNDS } from "@/app/lib/constants";

// Reads a player's stored choice for a given key, or null if they haven't
// picked one (defaults are applied by the caller via `capitalParamsForChoice`
// etc.).
async function getPlayerChoice(
  playerInGameId: string,
  key: string,
): Promise<string | null> {
  const choice = await prisma.matchChoice.findUnique({
    where: { playerInGameId_key: { playerInGameId, key } },
  });
  return choice?.value ?? null;
}

const PICK_TIMER_MS = 15000;
const CAPITAL_TIMER_MS = 20000;
const QUESTION_TIMER_MS = 15000;
const PHASE_DELAY_MS = 3500;
const WAR_MC_TIMER_MS = 15000;
const WAR_TIE_TIMER_MS = 15000;
const WAR_TURN_TIMER_MS = 20000;

async function logEvent(
  sessionId: string,
  type: string,
  actorId: string | null,
  payload: Prisma.InputJsonValue,
) {
  await prisma.matchEvent.create({
    data: { gameSessionId: sessionId, type, actorId, payload },
  });
}


// Settle player profile stats at the end of a match. Increments win/loss
// counts, awards XP (with level-up), and adjusts ELO. Called once per match
// from the atomic end-game claim in `advanceTurnAndStage`.
async function updatePlayerStats(sessionId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      players: { include: { profile: true } },
      matchMap: true,
    },
  });
  if (!session || session.players.length === 0) return;

  // Aggregate points held per player at end of match. Used for XP scaling.
  const pointsByPlayer = new Map<string, number>();
  for (const c of session.matchMap) {
    if (!c.ownerId) continue;
    pointsByPlayer.set(
      c.ownerId,
      (pointsByPlayer.get(c.ownerId) ?? 0) + c.points,
    );
  }

  const winner = session.winnerId
    ? session.players.find((p) => p.id === session.winnerId) ?? null
    : null;

  const eloDeltaByProfile = computeEloChanges(
    session.players.map((p) => ({
      profileId: p.profileId,
      elo: p.profile.elo,
    })),
    winner?.profileId ?? null,
  );

  for (const p of session.players) {
    const isWinner = p.id === winner?.id;
    const xpEarned = computeXpEarned(
      isWinner,
      pointsByPlayer.get(p.id) ?? 0,
    );
    const { level, experience } = applyExperience(
      p.profile.level,
      p.profile.experience,
      xpEarned,
    );
    const eloDelta = eloDeltaByProfile.get(p.profileId) ?? 0;

    await prisma.playerProfile.update({
      where: { id: p.profileId },
      data: {
        gamesPlayed: { increment: 1 },
        gamesWon: { increment: isWinner ? 1 : 0 },
        gamesLost: { increment: !isWinner && winner !== null ? 1 : 0 },
        experience,
        level,
        elo: { increment: eloDelta },
      },
    });
  }
}

export async function claimCapital(
  sessionId: string,
  svgId: string,
  playerId: string,
  hoveredBeforeClick: string[] = [],
) {
  if (!sessionId || !playerId || !svgId) return;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session || session.stage !== "capitals") return;
  if (session.players[session.turnIndex]?.id !== playerId) return;

  const template = await prisma.countryTemplate.findFirst({
    where: { svgId },
  });
  if (!template) return;

  const choice = await getPlayerChoice(playerId, "capital_style");
  const capitalParams = capitalParamsForChoice(choice);

  // Atomic claim: only succeeds if this country isn't owned yet.
  const claim = await prisma.matchCountry.updateMany({
    where: {
      gameSessionId: sessionId,
      templateId: template.id,
      ownerId: null,
    },
    data: {
      ownerId: playerId,
      isCapital: true,
      armies: capitalParams.armies,
      maxArmies: capitalParams.armies,
      points: capitalParams.points,
    },
  });
  if (claim.count === 0) return;

  await logEvent(sessionId, "capital", playerId, {
    country: template.name,
    auto: false,
    hovered: sanitizeHoverTrail(hoveredBeforeClick),
    capitalStyle: choice ?? "standard",
  });

  await advanceTurnAndStage(sessionId);
}

export async function claimTerritory(
  sessionId: string,
  svgId: string,
  playerId: string,
  hoveredBeforeClick: string[] = [],
) {
  if (!sessionId || !playerId || !svgId) return;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) return;

  if (session.pickOrder[0] !== playerId) return;

  const template = await prisma.countryTemplate.findFirst({
    where: { svgId },
  });

  if (!template) return;

  const country = await prisma.matchCountry.findUnique({
    where: {
      gameSessionId_templateId: {
        gameSessionId: sessionId,
        templateId: template.id,
      },
    },
  });

  if (!country || country.ownerId) return;

  const freeNeighbors = await getFreeNeighbors(sessionId, playerId);
  const freeNeighborIds = freeNeighbors.map((c) => c.templateId);

  if (freeNeighborIds.length > 0 && !freeNeighborIds.includes(template.id))
    return;

  await capture(country.id, playerId, sessionId, {
    hovered: hoveredBeforeClick,
  });
}

async function capture(
  countryId: string,
  playerId: string,
  sessionId: string,
  opts: { auto?: boolean; hovered?: string[] } = {},
) {
  const country = await prisma.matchCountry.update({
    where: { id: countryId },
    data: { ownerId: playerId },
    include: { template: true },
  });

  await logEvent(sessionId, "territory", playerId, {
    country: country.template.name,
    auto: opts.auto ?? false,
    hovered: sanitizeHoverTrail(opts.hovered),
  });

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  const newPickOrder = session!.pickOrder.slice(1);

  const allCountries = await prisma.matchCountry.findMany({
    where: { gameSessionId: sessionId },
  });
  const allClaimed = allCountries.every((c) => c.ownerId !== null);

  if (allClaimed) {
    // Transition to war — leader (most territories) attacks first
    const sessionWithPlayers = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { players: true },
    });
    const counts = new Map<string, number>();
    for (const c of allCountries) {
      if (c.ownerId) counts.set(c.ownerId, (counts.get(c.ownerId) ?? 0) + 1);
    }
    let leaderIndex = 0;
    let maxLands = -1;
    sessionWithPlayers!.players.forEach((p, i) => {
      const lands = counts.get(p.id) ?? 0;
      if (lands > maxLands) {
        maxLands = lands;
        leaderIndex = i;
      }
    });

    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        pickOrder: [],
        picksRemaining: 0,
        stage: "war",
        pickExpiresAt: null,
        turnIndex: leaderIndex,
        warTurnExpiresAt: new Date(Date.now() + WAR_TURN_TIMER_MS),
        warTurns: 0,
        winnerId: null,
      },
    });
    return;
  }

  if (newPickOrder.length === 0) {
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { pickOrder: [], picksRemaining: 0, pickExpiresAt: null },
    });
    await startQuestion(sessionId);
  } else {
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        pickOrder: newPickOrder,
        picksRemaining: newPickOrder.length,
        pickExpiresAt: new Date(Date.now() + PICK_TIMER_MS),
      },
    });
  }
}

export async function advanceTurnAndStage(sessionId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });

  if (!session) return;
  const totalPlayers = session!.players.length;
  let nextIndex = session!.turnIndex + 1;

  if (nextIndex >= totalPlayers) nextIndex = 0;

  const allCountries = await prisma.matchCountry.findMany({
    where: { gameSessionId: sessionId },
  });

  const totalCountries = allCountries.length;
  const capitalsPlaced = allCountries.filter((c) => c.isCapital).length;
  const claimedCountries = allCountries.filter((c) => c.ownerId).length;

  let newStage = session.stage;
  let shouldStartQuestion = false;

  if (newStage === "capitals" && capitalsPlaced === totalPlayers) {
    newStage = "expand";
    shouldStartQuestion = true;
  }

  if (newStage === "expand" && claimedCountries === totalCountries) {
    newStage = "war";
  }

  // War-end checks: this advance is consuming a war turn.
  if (session.stage === "war") {
    const landsCount = new Map<string, number>();
    const points = new Map<string, number>();
    for (const c of allCountries) {
      if (!c.ownerId) continue;
      landsCount.set(c.ownerId, (landsCount.get(c.ownerId) ?? 0) + 1);
      points.set(c.ownerId, (points.get(c.ownerId) ?? 0) + c.points);
    }
    const playersWithLandCount = session.players.filter(
      (p) => (landsCount.get(p.id) ?? 0) > 0,
    ).length;
    const newWarTurns = (session.warTurns ?? 0) + 1;
    const reason = warEndReason(
      newWarTurns,
      totalPlayers,
      MAX_WAR_ROUNDS,
      playersWithLandCount,
    );

    if (reason !== null) {
      // Winner is the player with most points (alive players only when
      // we're in sole_survivor — there's only one anyway, but keep the same
      // pattern for consistency).
      const winner =
        reason === "sole_survivor"
          ? winnerByLands(
              session.players.filter((p) => (landsCount.get(p.id) ?? 0) > 0),
              points,
            )
          : winnerByLands(session.players, points);

      // Atomic claim — guarantees the end-game block (and the stats update
      // that follows it) runs exactly once even if two callers race here.
      const endClaim = await prisma.gameSession.updateMany({
        where: { id: sessionId, status: { not: "completed" } },
        data: {
          status: "completed",
          stage: "ended",
          winnerId: winner?.id ?? null,
          warTurns: newWarTurns,
          warTurnExpiresAt: null,
          capitalExpiresAt: null,
          pickExpiresAt: null,
          nextQuestionAt: null,
          currentAttackId: null,
        },
      });
      if (endClaim.count === 0) return;

      await logEvent(sessionId, "game_over", winner?.id ?? null, {
        reason,
        pointsByWinner: points.get(winner?.id ?? "") ?? 0,
        landsByWinner: landsCount.get(winner?.id ?? "") ?? 0,
      });
      await updatePlayerStats(sessionId);
      return;
    }

    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        turnIndex: nextIndex,
        warTurns: newWarTurns,
        warTurnExpiresAt: new Date(Date.now() + WAR_TURN_TIMER_MS),
        capitalExpiresAt: null,
      },
    });
    return;
  }

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      turnIndex: nextIndex,
      stage: newStage,
      nextQuestionAt: shouldStartQuestion
        ? new Date(Date.now() + PHASE_DELAY_MS)
        : undefined,
      capitalExpiresAt:
        newStage === "capitals"
          ? new Date(Date.now() + CAPITAL_TIMER_MS)
          : null,
      warTurnExpiresAt:
        newStage === "war"
          ? new Date(Date.now() + WAR_TURN_TIMER_MS)
          : null,
    },
  });
}

export async function forceAutoCapital(sessionId: string) {
  const claim = await prisma.gameSession.updateMany({
    where: {
      id: sessionId,
      stage: "capitals",
      capitalExpiresAt: { not: null, lte: new Date() },
    },
    data: { capitalExpiresAt: null },
  });
  if (claim.count === 0) return;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session || session.stage !== "capitals") return;

  const player = session.players[session.turnIndex];
  if (!player) return;

  const free = await prisma.matchCountry.findMany({
    where: { gameSessionId: sessionId, ownerId: null },
    include: { template: true },
  });
  if (free.length === 0) return;

  const random = free[Math.floor(Math.random() * free.length)];
  const choice = await getPlayerChoice(player.id, "capital_style");
  const capitalParams = capitalParamsForChoice(choice);
  const update = await prisma.matchCountry.updateMany({
    where: { id: random.id, ownerId: null },
    data: {
      ownerId: player.id,
      isCapital: true,
      armies: capitalParams.armies,
      maxArmies: capitalParams.armies,
      points: capitalParams.points,
    },
  });
  if (update.count === 0) return;

  await logEvent(sessionId, "capital", player.id, {
    country: random.template.name,
    auto: true,
    capitalStyle: choice ?? "standard",
  });

  await advanceTurnAndStage(sessionId);
}

export async function forceStartQuestion(sessionId: string) {
  const claim = await prisma.gameSession.updateMany({
    where: {
      id: sessionId,
      nextQuestionAt: { not: null, lte: new Date() },
    },
    data: { nextQuestionAt: null },
  });
  if (claim.count === 0) return;

  const existing = await prisma.matchQuestion.findFirst({
    where: { gameSessionId: sessionId, isActive: true },
  });
  if (existing) return;

  await startQuestion(sessionId);
}

// QUESTIONS

export async function startQuestion(sessionId: string) {
  const count = await prisma.question.count();
  const skip = Math.floor(Math.random() * count);

  const question = await prisma.question.findFirst({ skip });
  if (!question) return;

  await prisma.matchQuestion.create({
    data: {
      gameSessionId: sessionId,
      questionId: question.id,
      isActive: true,
      expiresAt: new Date(Date.now() + QUESTION_TIMER_MS),
    },
  });
}

export async function submitAnswer(
  sessionId: string,
  playerId: string,
  answer: number,
  telemetry?: {
    firstInputAtMs: number | null;
    inputChangeCount: number;
  },
) {
  const activeQuestion = await prisma.matchQuestion.findFirst({
    where: { gameSessionId: sessionId, isActive: true },
  });
  if (!activeQuestion) return;

  // Clamp telemetry into the question window so a wonky client clock can't
  // poison aggregates. Null means "no typing happened" (e.g. auto-submit).
  const firstInputAtMs =
    telemetry && telemetry.firstInputAtMs !== null
      ? Math.max(
          0,
          Math.min(QUESTION_TIMER_MS, Math.round(telemetry.firstInputAtMs)),
        )
      : null;
  const inputChangeCount = Math.max(
    0,
    Math.min(1000, Math.round(telemetry?.inputChangeCount ?? 0)),
  );

  await prisma.playerAnswer.upsert({
    where: {
      matchQuestionId_playerId: {
        matchQuestionId: activeQuestion.id,
        playerId,
      },
    },
    create: {
      matchQuestionId: activeQuestion.id,
      playerId,
      answer,
      firstInputAtMs,
      inputChangeCount,
    },
    // Refresh answeredAt on resubmit so the latest answer's timing wins
    // tiebreaks (matches how the user perceives "submitting" their answer).
    update: { answer, answeredAt: new Date(), firstInputAtMs, inputChangeCount },
  });

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });

  const answers = await prisma.playerAnswer.findMany({
    where: { matchQuestionId: activeQuestion.id },
  });

  if (answers.length === session!.players.length) {
    await resolveQuestion(sessionId, activeQuestion.id);
  }
}

async function resolveQuestion(sessionId: string, matchQuestionId: string) {
  // Atomic claim — only one path (submitAnswer's "all answered" or forceResolveQuestion)
  // gets to compute results. Concurrent calls lose the race and exit cleanly.
  const claim = await prisma.matchQuestion.updateMany({
    where: { id: matchQuestionId, isActive: true },
    data: { isActive: false },
  });
  if (claim.count === 0) return;

  const matchQuestion = await prisma.matchQuestion.findUnique({
    where: { id: matchQuestionId },
    include: {
      question: true,
      answers: { include: { player: { include: { profile: true } } } },
    },
  });
  if (!matchQuestion) return;

  const correctAnswer = matchQuestion.question.answer;
  const questionStartMs =
    matchQuestion.expiresAt.getTime() - QUESTION_TIMER_MS;

  // Rank by closeness, ties broken by who submitted first.
  const sorted = rankAnswers(
    matchQuestion.answers.map((a) => ({
      ...a,
      answeredAtMs: a.answeredAt.getTime(),
    })),
    correctAnswer,
  );

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: { include: { profile: true } } },
  });
  if (!session) return;
  const totalPlayers = session.players.length;

  type ResultEntry = {
    playerId: string;
    nickname: string;
    answer: number | null;
    diff: number;
    place: number;
    territories: number;
    correctAnswer: number;
    timeMs: number | null;
  };
  let pickOrder: string[] = [];
  let results: ResultEntry[] = [];

  if (sorted.length === 0 && totalPlayers > 0) {
    // Nobody answered — randomly pick a "lucky winner" so the game keeps moving.
    const lucky = session.players[Math.floor(Math.random() * totalPlayers)];
    pickOrder = computePickOrder([lucky.id], totalPlayers);
    const others = session.players.filter((p) => p.id !== lucky.id);
    results = [
      {
        playerId: lucky.id,
        nickname: lucky.profile.nickname,
        answer: null,
        diff: 0,
        place: 1,
        territories: territoriesForPlace(1, totalPlayers),
        correctAnswer,
        timeMs: null,
      },
      ...others.map((p, i) => ({
        playerId: p.id,
        nickname: p.profile.nickname,
        answer: null,
        diff: 0,
        place: i + 2,
        territories: 0,
        correctAnswer,
        timeMs: null,
      })),
    ];
  } else {
    pickOrder = computePickOrder(
      sorted.map((a) => a.playerId),
      totalPlayers,
    );

    const ranked = sorted.map((a, i) => ({
      playerId: a.playerId,
      nickname: a.player.profile.nickname,
      answer: a.answer,
      diff: Math.abs(a.answer - correctAnswer),
      place: i + 1,
      territories: territoriesForPlace(i + 1, totalPlayers),
      correctAnswer,
      timeMs: Math.max(0, a.answeredAtMs - questionStartMs),
    }));
    // Append players who never submitted so the reveal screen lists everyone.
    const answered = new Set(ranked.map((r) => r.playerId));
    const missing = session.players
      .filter((p) => !answered.has(p.id))
      .map((p, j) => ({
        playerId: p.id,
        nickname: p.profile.nickname,
        answer: null,
        diff: 0,
        place: ranked.length + j + 1,
        territories: 0,
        correctAnswer,
        timeMs: null,
      }));
    results = [...ranked, ...missing];
  }

  await prisma.matchQuestion.update({
    where: { id: matchQuestionId },
    data: {
      isActive: false,
      results,
    },
  });

  if (results[0]) {
    await logEvent(sessionId, "round", results[0].playerId, {
      noAnswers: sorted.length === 0,
      correctAnswer,
      winnerAnswer: results[0].answer,
    });
  }

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      pickOrder,
      picksRemaining: pickOrder.length,
      pickExpiresAt:
        pickOrder.length > 0 ? new Date(Date.now() + PICK_TIMER_MS) : null,
      nextQuestionAt: null,
    },
  });
}

export async function forceResolveQuestion(sessionId: string) {
  const active = await prisma.matchQuestion.findFirst({
    where: {
      gameSessionId: sessionId,
      isActive: true,
      expiresAt: { lte: new Date() },
    },
  });
  if (!active) return;

  await resolveQuestion(sessionId, active.id);
}

export async function forceAutoPick(sessionId: string) {
  // Atomic claim: only one caller wins the race, even if every client fires.
  const claim = await prisma.gameSession.updateMany({
    where: {
      id: sessionId,
      pickExpiresAt: { not: null, lte: new Date() },
    },
    data: { pickExpiresAt: null },
  });

  if (claim.count === 0) return;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });
  if (!session || session.pickOrder.length === 0) return;

  const playerId = session.pickOrder[0];
  const freeNeighbors = await getFreeNeighbors(sessionId, playerId);
  if (freeNeighbors.length === 0) return;

  const random =
    freeNeighbors[Math.floor(Math.random() * freeNeighbors.length)];
  await capture(random.id, playerId, sessionId, { auto: true });
}

async function getFreeNeighbors(sessionId: string, playerId: string) {
  const myCountries = await prisma.matchCountry.findMany({
    where: { gameSessionId: sessionId, ownerId: playerId },
    select: { templateId: true },
  });

  const myIds = myCountries.map((c) => c.templateId);
  if (myIds.length === 0) return [];

  const templates = await prisma.countryTemplate.findMany({
    where: { id: { in: myIds } },
  });

  const neighborIds = new Set<number>();
  for (const t of templates) {
    t.neighbors.forEach((n) => neighborIds.add(n));
  }

  return prisma.matchCountry.findMany({
    where: {
      gameSessionId: sessionId,
      templateId: { in: [...neighborIds] },
      ownerId: null,
    },
  });
}

// WAR
export async function attackTerritory(
  sessionId: string,
  attackerId: string,
  countryId: string,
  hoveredBeforeClick: string[] = [],
) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session || session.stage !== "war") return;
  if (session.currentAttackId) return;
  if (session.players[session.turnIndex]?.id !== attackerId) return;

  const country = await prisma.matchCountry.findUnique({
    where: { id: countryId },
    include: { template: true },
  });
  if (!country || !country.ownerId || country.ownerId === attackerId) return;

  const enemyNeighbors = await getEnemyNeighbors(sessionId, attackerId);
  if (!enemyNeighbors.some((c) => c.id === countryId)) return;

  const count = await prisma.warQuestion.count();
  if (count === 0) return;
  const question = await prisma.warQuestion.findFirst({
    skip: Math.floor(Math.random() * count),
  });
  if (!question) return;

  const attack = await prisma.warAttack.create({
    data: {
      gameSessionId: sessionId,
      attackerId,
      defenderId: country.ownerId,
      countryId,
      isActive: true,
      questionId: question.id,
      expiresAt: new Date(Date.now() + WAR_MC_TIMER_MS),
    },
  });

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { currentAttackId: attack.id, warTurnExpiresAt: null },
  });

  await logEvent(sessionId, "attack_started", attackerId, {
    country: country.template.name,
    defenderId: country.ownerId,
    hovered: sanitizeHoverTrail(hoveredBeforeClick),
  });
}

export async function submitWarAnswer(
  attackId: string,
  playerId: string,
  isCorrect: boolean,
  telemetry?: { submittedAtMs: number },
) {
  const attack = await prisma.warAttack.findUnique({
    where: { id: attackId },
  });
  if (!attack || !attack.isActive || attack.tieQuestionId) return;
  if (playerId !== attack.attackerId && playerId !== attack.defenderId) return;

  const submittedAtMs =
    telemetry?.submittedAtMs !== undefined
      ? Math.max(
          0,
          Math.min(WAR_MC_TIMER_MS, Math.round(telemetry.submittedAtMs)),
        )
      : null;

  await prisma.warAnswer.upsert({
    where: { attackId_playerId: { attackId, playerId } },
    create: { attackId, playerId, isCorrect, submittedAtMs },
    update: { isCorrect, submittedAtMs },
  });

  const answers = await prisma.warAnswer.findMany({ where: { attackId } });
  if (answers.length === 2) {
    await resolveMcPhase(attackId);
  }
}

export async function submitWarTieBreaker(
  attackId: string,
  playerId: string,
  answer: number,
) {
  const attack = await prisma.warAttack.findUnique({
    where: { id: attackId },
  });
  if (!attack || !attack.isActive || !attack.tieQuestionId) return;
  if (playerId !== attack.attackerId && playerId !== attack.defenderId) return;

  // Time spent on the tie question, in ms since the tie phase started.
  // tieExpiresAt is still set here (resolveTiePhase hasn't atomically cleared
  // it yet), so we can recover the start instant from the deadline.
  const tieStartMs = attack.tieExpiresAt
    ? attack.tieExpiresAt.getTime() - WAR_TIE_TIMER_MS
    : Date.now();
  // Clamp into [0, WAR_TIE_TIMER_MS] so timezone roundtripping or auto-submit
  // edge cases never produce a nonsensical value (e.g. 1.7e12 ms).
  const elapsedMs = Math.max(
    0,
    Math.min(WAR_TIE_TIMER_MS, Date.now() - tieStartMs),
  );

  await prisma.warAttack.update({
    where: { id: attackId },
    data:
      playerId === attack.attackerId
        ? { tieAttackerAnswer: answer, tieAttackerTimeMs: elapsedMs }
        : { tieDefenderAnswer: answer, tieDefenderTimeMs: elapsedMs },
  });

  const fresh = await prisma.warAttack.findUnique({
    where: { id: attackId },
  });
  if (
    fresh?.tieAttackerAnswer !== null &&
    fresh?.tieDefenderAnswer !== null
  ) {
    await resolveTiePhase(attackId);
  }
}

async function resolveMcPhase(attackId: string) {
  // Atomic claim — only one path computes the result
  const claim = await prisma.warAttack.updateMany({
    where: { id: attackId, isActive: true, tieQuestionId: null },
    data: { expiresAt: null },
  });
  if (claim.count === 0) return;

  const attack = await prisma.warAttack.findUnique({
    where: { id: attackId },
    include: { answers: true },
  });
  if (!attack) return;

  const attackerCorrect =
    attack.answers.find((a) => a.playerId === attack.attackerId)?.isCorrect ??
    false;
  const defenderCorrect =
    attack.answers.find((a) => a.playerId === attack.defenderId)?.isCorrect ??
    false;

  // Persist the per-side correctness so the reveal banner on every client
  // can show "X answered correctly" without separately fetching answers.
  await prisma.warAttack.update({
    where: { id: attackId },
    data: {
      lastAttackerCorrect: attackerCorrect,
      lastDefenderCorrect: defenderCorrect,
    },
  });

  if (attackerCorrect && defenderCorrect) {
    await startTieBreaker(attackId);
    return;
  }

  if (attackerCorrect && !defenderCorrect) {
    await endAttack(attack, "attacker_won");
  } else if (!attackerCorrect && defenderCorrect) {
    await endAttack(attack, "defender_held");
  } else {
    await endAttack(attack, "no_change");
  }
}

async function startTieBreaker(attackId: string) {
  const count = await prisma.question.count();
  if (count === 0) {
    // No numeric questions — fall back to no-change.
    const attack = await prisma.warAttack.findUnique({
      where: { id: attackId },
    });
    if (attack) await endAttack(attack, "no_change");
    return;
  }
  const question = await prisma.question.findFirst({
    skip: Math.floor(Math.random() * count),
  });
  if (!question) return;

  await prisma.warAttack.update({
    where: { id: attackId },
    data: {
      tieQuestionId: question.id,
      tieExpiresAt: new Date(Date.now() + WAR_TIE_TIMER_MS),
    },
  });
}

async function resolveTiePhase(attackId: string) {
  // Atomic claim
  const claim = await prisma.warAttack.updateMany({
    where: {
      id: attackId,
      isActive: true,
      tieQuestionId: { not: null },
      tieExpiresAt: { not: null },
    },
    data: { tieExpiresAt: null },
  });
  if (claim.count === 0) return;

  const attack = await prisma.warAttack.findUnique({
    where: { id: attackId },
    include: { tieQuestion: true },
  });
  if (!attack || !attack.tieQuestion) return;

  const outcome = computeTieResult(
    attack.tieQuestion.answer,
    attack.tieAttackerAnswer,
    attack.tieDefenderAnswer,
    attack.tieAttackerTimeMs,
    attack.tieDefenderTimeMs,
  );
  await endAttack(attack, outcome);
}

type AttackOutcome = "attacker_won" | "defender_held" | "no_change";

async function endAttack(
  attack: {
    id: string;
    gameSessionId: string;
    attackerId: string;
    defenderId: string;
    countryId: string;
  },
  outcome: AttackOutcome,
) {
  const country = await prisma.matchCountry.findUnique({
    where: { id: attack.countryId },
    include: { template: true },
  });
  if (!country) return;

  if (outcome === "attacker_won") {
    if (country.isCapital && country.armies > 1) {
      // Capital damaged but still standing — siege continues.
      await prisma.matchCountry.update({
        where: { id: attack.countryId },
        data: { armies: { decrement: 1 } },
      });
      await logEvent(
        attack.gameSessionId,
        "attack_damaged",
        attack.attackerId,
        {
          country: country.template.name,
          defenderId: attack.defenderId,
          remainingHp: country.armies - 1,
          isCapital: true,
        },
      );
      await continueAttack(attack.id);
      return; // Do NOT finalize — attack stays live.
    } else if (country.isCapital) {
      // Capital falls — defender's whole empire transfers.
      const defenderLands = await prisma.matchCountry.findMany({
        where: {
          gameSessionId: attack.gameSessionId,
          ownerId: attack.defenderId,
        },
      });
      // The captured capital becomes a regular territory (HP resets, but
      // its point value stays — capturing a capital is the prize).
      await prisma.matchCountry.update({
        where: { id: attack.countryId },
        data: {
          ownerId: attack.attackerId,
          isCapital: false,
          armies: 1,
        },
      });
      // Remaining defender territories transfer ownership but keep their
      // points (any defence bonuses are tied to the territory, not the player).
      await prisma.matchCountry.updateMany({
        where: {
          gameSessionId: attack.gameSessionId,
          ownerId: attack.defenderId,
        },
        data: { ownerId: attack.attackerId },
      });
      await logEvent(
        attack.gameSessionId,
        "capital_fell",
        attack.attackerId,
        {
          country: country.template.name,
          defenderId: attack.defenderId,
          territoriesTransferred: defenderLands.length,
        },
      );
    } else {
      await prisma.matchCountry.update({
        where: { id: attack.countryId },
        data: { ownerId: attack.attackerId, armies: 1 },
      });
      await logEvent(attack.gameSessionId, "attack_won", attack.attackerId, {
        country: country.template.name,
        defenderId: attack.defenderId,
      });
    }
  } else if (outcome === "defender_held") {
    // Successful defence — territory gains +100 points (HP unchanged).
    const updated = await prisma.matchCountry.update({
      where: { id: attack.countryId },
      data: { points: { increment: 100 } },
    });
    await logEvent(attack.gameSessionId, "attack_held", attack.defenderId, {
      country: country.template.name,
      attackerId: attack.attackerId,
      hp: country.armies,
      newPoints: updated.points,
    });
  } else {
    await logEvent(
      attack.gameSessionId,
      "attack_failed",
      attack.attackerId,
      {
        country: country.template.name,
        defenderId: attack.defenderId,
      },
    );
  }

  await prisma.warAttack.update({
    where: { id: attack.id },
    data: {
      isActive: false,
      expiresAt: null,
      tieExpiresAt: null,
    },
  });

  await prisma.gameSession.update({
    where: { id: attack.gameSessionId },
    data: { currentAttackId: null },
  });

  await advanceTurnAndStage(attack.gameSessionId);
}

async function continueAttack(attackId: string) {
  // Pick a fresh MC question, clear answers + tie state, restart MC phase.
  const count = await prisma.warQuestion.count();
  if (count === 0) return;
  const question = await prisma.warQuestion.findFirst({
    skip: Math.floor(Math.random() * count),
  });
  if (!question) return;

  await prisma.warAnswer.deleteMany({ where: { attackId } });
  await prisma.warAttack.update({
    where: { id: attackId },
    data: {
      questionId: question.id,
      expiresAt: new Date(Date.now() + WAR_MC_TIMER_MS),
      tieQuestionId: null,
      tieExpiresAt: null,
      tieAttackerAnswer: null,
      tieDefenderAnswer: null,
    },
  });
}

export async function forceResolveAttack(sessionId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });
  if (!session?.currentAttackId) return;

  const attack = await prisma.warAttack.findUnique({
    where: { id: session.currentAttackId },
  });
  if (!attack || !attack.isActive) return;

  const nowDate = new Date();
  if (attack.tieQuestionId) {
    if (!attack.tieExpiresAt || attack.tieExpiresAt > nowDate) return;
    await resolveTiePhase(attack.id);
  } else {
    if (!attack.expiresAt || attack.expiresAt > nowDate) return;
    await resolveMcPhase(attack.id);
  }
}

export async function forceAutoAttack(sessionId: string) {
  // Atomic claim: only one client wins, even if all fire simultaneously.
  const claim = await prisma.gameSession.updateMany({
    where: {
      id: sessionId,
      stage: "war",
      currentAttackId: null,
      warTurnExpiresAt: { not: null, lte: new Date() },
    },
    data: { warTurnExpiresAt: null },
  });
  if (claim.count === 0) return;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) return;
  const attacker = session.players[session.turnIndex];
  if (!attacker) return;

  const enemies = await getEnemyNeighbors(sessionId, attacker.id);
  if (enemies.length === 0) {
    // Player has no enemy neighbours — skip turn
    await advanceTurnAndStage(sessionId);
    return;
  }

  const target = enemies[Math.floor(Math.random() * enemies.length)];
  if (!target.ownerId) {
    await advanceTurnAndStage(sessionId);
    return;
  }

  const wqCount = await prisma.warQuestion.count();
  if (wqCount === 0) {
    await advanceTurnAndStage(sessionId);
    return;
  }
  const question = await prisma.warQuestion.findFirst({
    skip: Math.floor(Math.random() * wqCount),
  });
  if (!question) {
    await advanceTurnAndStage(sessionId);
    return;
  }

  const attack = await prisma.warAttack.create({
    data: {
      gameSessionId: sessionId,
      attackerId: attacker.id,
      defenderId: target.ownerId,
      countryId: target.id,
      isActive: true,
      questionId: question.id,
      expiresAt: new Date(Date.now() + WAR_MC_TIMER_MS),
    },
  });

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { currentAttackId: attack.id },
  });

  await logEvent(sessionId, "attack_started", attacker.id, {
    country: target.template.name,
    defenderId: target.ownerId,
    auto: true,
  });
}

async function getEnemyNeighbors(sessionId: string, playerId: string) {
  const myCountries = await prisma.matchCountry.findMany({
    where: { gameSessionId: sessionId, ownerId: playerId },
    select: { templateId: true },
  });

  const myIds = myCountries.map((c) => c.templateId);
  if (myIds.length === 0) return [];

  const templates = await prisma.countryTemplate.findMany({
    where: { id: { in: myIds } },
  });

  const neighborIds = new Set<number>();
  for (const t of templates) {
    t.neighbors.forEach((n) => neighborIds.add(n));
  }

  return prisma.matchCountry.findMany({
    where: {
      gameSessionId: sessionId,
      templateId: { in: [...neighborIds] },
      ownerId: { not: null, notIn: [playerId] },
    },
    include: { template: true },
  });
}

