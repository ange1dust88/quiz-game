"use server";

import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

const PICK_TIMER_MS = 15000;
const CAPITAL_TIMER_MS = 20000;
const PHASE_DELAY_MS = 3500;
const WAR_MC_TIMER_MS = 15000;
const WAR_TIE_TIMER_MS = 10000;

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

export async function claimCapital(
  sessionId: string,
  svgId: string,
  playerId: string,
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

  // Atomic claim: only succeeds if this country isn't owned yet.
  const claim = await prisma.matchCountry.updateMany({
    where: {
      gameSessionId: sessionId,
      templateId: template.id,
      ownerId: null,
    },
    data: { ownerId: playerId, isCapital: true, armies: 3 },
  });
  if (claim.count === 0) return;

  await logEvent(sessionId, "capital", playerId, {
    country: template.name,
    auto: false,
  });

  await advanceTurnAndStage(sessionId);
}

export async function claimTerritory(
  sessionId: string,
  svgId: string,
  playerId: string,
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

  await capture(country.id, playerId, sessionId);
}

async function capture(
  countryId: string,
  playerId: string,
  sessionId: string,
  opts: { auto?: boolean } = {},
) {
  const country = await prisma.matchCountry.update({
    where: { id: countryId },
    data: { ownerId: playerId },
    include: { template: true },
  });

  await logEvent(sessionId, "territory", playerId, {
    country: country.template.name,
    auto: opts.auto ?? false,
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
  const update = await prisma.matchCountry.updateMany({
    where: { id: random.id, ownerId: null },
    data: { ownerId: player.id, isCapital: true, armies: 3 },
  });
  if (update.count === 0) return;

  await logEvent(sessionId, "capital", player.id, {
    country: random.template.name,
    auto: true,
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
      expiresAt: new Date(Date.now() + 10000),
    },
  });
}

export async function submitAnswer(
  sessionId: string,
  playerId: string,
  answer: number,
) {
  const activeQuestion = await prisma.matchQuestion.findFirst({
    where: { gameSessionId: sessionId, isActive: true },
  });
  if (!activeQuestion) return;

  await prisma.playerAnswer.upsert({
    where: {
      matchQuestionId_playerId: {
        matchQuestionId: activeQuestion.id,
        playerId,
      },
    },
    create: { matchQuestionId: activeQuestion.id, playerId, answer },
    update: { answer },
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

  const sorted = matchQuestion.answers.sort(
    (a, b) =>
      Math.abs(a.answer - correctAnswer) - Math.abs(b.answer - correctAnswer),
  );

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: { include: { profile: true } } },
  });
  if (!session) return;
  const totalPlayers = session.players.length;

  const territoriesForPlace = (place: number) => {
    if (totalPlayers === 2) return place === 1 ? 1 : 0;
    return place === 1 ? 2 : place === 2 ? 1 : 0;
  };

  const pickOrder: string[] = [];
  type ResultEntry = {
    playerId: string;
    nickname: string;
    answer: number | null;
    diff: number;
    place: number;
    territories: number;
  };
  let results: ResultEntry[] = [];

  if (sorted.length === 0 && totalPlayers > 0) {
    // Nobody answered — randomly pick a "lucky winner" so the game keeps moving.
    const lucky = session.players[Math.floor(Math.random() * totalPlayers)];
    if (totalPlayers === 2) {
      pickOrder.push(lucky.id);
    } else if (totalPlayers >= 3) {
      pickOrder.push(lucky.id, lucky.id);
    }
    const others = session.players.filter((p) => p.id !== lucky.id);
    results = [
      {
        playerId: lucky.id,
        nickname: lucky.profile.nickname,
        answer: null,
        diff: 0,
        place: 1,
        territories: territoriesForPlace(1),
      },
      ...others.map((p, i) => ({
        playerId: p.id,
        nickname: p.profile.nickname,
        answer: null,
        diff: 0,
        place: i + 2,
        territories: 0,
      })),
    ];
  } else {
    if (totalPlayers === 2) {
      if (sorted[0]) pickOrder.push(sorted[0].playerId);
    } else if (totalPlayers >= 3) {
      if (sorted[0]) {
        pickOrder.push(sorted[0].playerId);
        pickOrder.push(sorted[0].playerId);
      }
      if (sorted[1]) pickOrder.push(sorted[1].playerId);
    }

    results = sorted.map((a, i) => ({
      playerId: a.playerId,
      nickname: a.player.profile.nickname,
      answer: a.answer,
      diff: Math.abs(a.answer - correctAnswer),
      place: i + 1,
      territories: territoriesForPlace(i + 1),
    }));
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
    data: { currentAttackId: attack.id },
  });

  await logEvent(sessionId, "attack_started", attackerId, {
    country: country.template.name,
    defenderId: country.ownerId,
  });
}

export async function submitWarAnswer(
  attackId: string,
  playerId: string,
  isCorrect: boolean,
) {
  const attack = await prisma.warAttack.findUnique({
    where: { id: attackId },
  });
  if (!attack || !attack.isActive || attack.tieQuestionId) return;
  if (playerId !== attack.attackerId && playerId !== attack.defenderId) return;

  await prisma.warAnswer.upsert({
    where: { attackId_playerId: { attackId, playerId } },
    create: { attackId, playerId, isCorrect },
    update: { isCorrect },
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

  await prisma.warAttack.update({
    where: { id: attackId },
    data:
      playerId === attack.attackerId
        ? { tieAttackerAnswer: answer }
        : { tieDefenderAnswer: answer },
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

  const correct = attack.tieQuestion.answer;
  const attackerDiff =
    attack.tieAttackerAnswer === null
      ? Number.POSITIVE_INFINITY
      : Math.abs(attack.tieAttackerAnswer - correct);
  const defenderDiff =
    attack.tieDefenderAnswer === null
      ? Number.POSITIVE_INFINITY
      : Math.abs(attack.tieDefenderAnswer - correct);

  if (attackerDiff === Number.POSITIVE_INFINITY && defenderDiff === Number.POSITIVE_INFINITY) {
    await endAttack(attack, "no_change");
  } else if (attackerDiff < defenderDiff) {
    await endAttack(attack, "attacker_won");
  } else {
    // Tie or defender closer — defender holds
    await endAttack(attack, "defender_held");
  }
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
    if (country.armies > 1) {
      // Damaged but didn't fall.
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
          isCapital: country.isCapital,
        },
      );
    } else if (country.isCapital) {
      // Capital falls — defender's whole empire transfers.
      const defenderLands = await prisma.matchCountry.findMany({
        where: {
          gameSessionId: attack.gameSessionId,
          ownerId: attack.defenderId,
        },
      });
      await prisma.matchCountry.updateMany({
        where: {
          gameSessionId: attack.gameSessionId,
          ownerId: attack.defenderId,
        },
        data: { ownerId: attack.attackerId, isCapital: false, armies: 1 },
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
    const updated = await prisma.matchCountry.update({
      where: { id: attack.countryId },
      data: { armies: { increment: 1 } },
      include: { template: true },
    });
    await logEvent(attack.gameSessionId, "attack_held", attack.defenderId, {
      country: updated.template.name,
      attackerId: attack.attackerId,
      newHp: updated.armies,
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
  });
}
