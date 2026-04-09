"use server";

import { prisma } from "@/app/lib/prisma";

export async function claimCapital(
  sessionId: string,
  svgId: string,
  playerId: string,
) {
  if (!sessionId || !playerId || !svgId) return;

  const template = await prisma.countryTemplate.findFirst({
    where: { svgId },
  });

  if (!template) return;

  const existingCapital = await prisma.matchCountry.findFirst({
    where: {
      gameSessionId: sessionId,
      ownerId: playerId,
      isCapital: true,
    },
  });

  if (existingCapital) return;

  await prisma.matchCountry.update({
    where: {
      gameSessionId_templateId: {
        gameSessionId: sessionId,
        templateId: template.id,
      },
    },
    data: {
      ownerId: playerId,
      isCapital: true,
    },
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

async function capture(countryId: string, playerId: string, sessionId: string) {
  await prisma.matchCountry.update({
    where: { id: countryId },
    data: { ownerId: playerId },
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
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { pickOrder: [], picksRemaining: 0, stage: "war" },
    });
    return;
  }

  if (newPickOrder.length === 0) {
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { pickOrder: [], picksRemaining: 0 },
    });
    await startQuestion(sessionId);
  } else {
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { pickOrder: newPickOrder, picksRemaining: newPickOrder.length },
    });
  }

  if (newPickOrder[0]) {
    startPickTimer(sessionId, newPickOrder[0]);
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
    data: { turnIndex: nextIndex, stage: newStage },
  });

  if (shouldStartQuestion) {
    await new Promise((resolve) => setTimeout(resolve, 3500));
    await startQuestion(sessionId);
  }
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
    include: { players: true },
  });
  const totalPlayers = session!.players.length;

  const pickOrder: string[] = [];

  if (totalPlayers === 2) {
    if (sorted[0]) pickOrder.push(sorted[0].playerId);
  } else if (totalPlayers >= 3) {
    if (sorted[0]) {
      pickOrder.push(sorted[0].playerId);
      pickOrder.push(sorted[0].playerId);
    }
    if (sorted[1]) pickOrder.push(sorted[1].playerId);
  }

  const territoriesForPlace = (place: number) => {
    if (totalPlayers === 2) {
      return place === 1 ? 1 : 0;
    } else {
      return place === 1 ? 2 : place === 2 ? 1 : 0;
    }
  };

  const results = sorted.map((a, i) => ({
    playerId: a.playerId,
    nickname: a.player.profile.nickname,
    answer: a.answer,
    diff: Math.abs(a.answer - correctAnswer),
    place: i + 1,
    territories: territoriesForPlace(i + 1),
  }));

  await prisma.matchQuestion.update({
    where: { id: matchQuestionId },
    data: {
      isActive: false,
      results,
    },
  });

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { pickOrder, picksRemaining: pickOrder.length },
  });

  if (pickOrder[0]) {
    startPickTimer(sessionId, pickOrder[0]);
  }
}

async function startPickTimer(sessionId: string, playerId: string) {
  await new Promise((resolve) => setTimeout(resolve, 15000));

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.pickOrder[0] !== playerId) return;

  const freeNeighbors = await getFreeNeighbors(sessionId, playerId);
  if (freeNeighbors.length === 0) return;
  const random =
    freeNeighbors[Math.floor(Math.random() * freeNeighbors.length)];
  await capture(random.id, playerId, sessionId);
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
  console.log("attackTerritory called", { sessionId, attackerId, countryId });

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });
  console.log(
    "session stage:",
    session?.stage,
    "currentAttackId:",
    session?.currentAttackId,
  );

  if (!session || session.stage !== "war") return;
  if (session.currentAttackId) return;

  const country = await prisma.matchCountry.findUnique({
    where: { id: countryId },
  });
  console.log("country:", country?.id, "ownerId:", country?.ownerId);

  if (!country || !country.ownerId || country.ownerId === attackerId) return;

  const enemyNeighbors = await getEnemyNeighbors(sessionId, attackerId);
  console.log("enemyNeighbors count:", enemyNeighbors.length);
  console.log(
    "canAttack:",
    enemyNeighbors.some((c) => c.id === countryId),
  );

  const canAttack = enemyNeighbors.some((c) => c.id === countryId);
  if (!canAttack) return;

  const count = await prisma.warQuestion.count();
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
    },
  });

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { currentAttackId: attack.id },
  });
}

export async function submitWarAnswer(
  attackId: string,
  playerId: string,
  isCorrect: boolean,
) {
  await prisma.warAnswer.upsert({
    where: { attackId_playerId: { attackId, playerId } },
    create: { attackId, playerId, isCorrect },
    update: { isCorrect },
  });

  const answers = await prisma.warAnswer.findMany({
    where: { attackId },
  });

  const attack = await prisma.warAttack.findUnique({
    where: { id: attackId },
  });
  if (!attack) return;

  if (answers.length === 2) {
    await resolveAttack(attackId);
  }
}

async function resolveAttack(attackId: string) {
  const attack = await prisma.warAttack.findUnique({
    where: { id: attackId },
    include: { answers: true },
  });
  if (!attack) return;

  const attackerAnswer = attack.answers.find(
    (a) => a.playerId === attack.attackerId,
  );
  const defenderAnswer = attack.answers.find(
    (a) => a.playerId === attack.defenderId,
  );

  const attackerCorrect = attackerAnswer?.isCorrect ?? false;
  const defenderCorrect = defenderAnswer?.isCorrect ?? false;

  if (attackerCorrect && defenderCorrect) {
    await prisma.warAnswer.deleteMany({ where: { attackId } });
    await prisma.warAttack.update({
      where: { id: attackId },
      data: { isActive: true },
    });
    return;
  }

  if (attackerCorrect && !defenderCorrect) {
    await prisma.matchCountry.update({
      where: { id: attack.countryId },
      data: { ownerId: attack.attackerId },
    });
  }

  if (!attackerCorrect && defenderCorrect) {
    await prisma.matchCountry.update({
      where: { id: attack.countryId },
      data: { armies: { increment: 100 } },
    });
  }

  await prisma.warAttack.update({
    where: { id: attackId },
    data: { isActive: false },
  });

  await prisma.gameSession.update({
    where: { id: attack.gameSessionId },
    data: { currentAttackId: null },
  });

  await advanceTurnAndStage(attack.gameSessionId);
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
