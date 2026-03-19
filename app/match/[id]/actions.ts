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

  const myCountries = await prisma.matchCountry.findMany({
    where: {
      gameSessionId: sessionId,
      ownerId: playerId,
    },
    select: {
      templateId: true,
    },
  });

  const myIds = myCountries.map((c) => c.templateId);

  if (myIds.length === 0) {
    await capture(country.id, playerId, sessionId);
    return;
  }

  const templates = await prisma.countryTemplate.findMany({
    where: {
      id: { in: myIds },
    },
  });

  const neighborIds = new Set<number>();

  for (const t of templates) {
    t.neighbors.forEach((n) => neighborIds.add(n));
  }
  const freeNeighbors = await prisma.matchCountry.findMany({
    where: {
      gameSessionId: sessionId,
      templateId: { in: [...neighborIds] },
      ownerId: null,
    },
  });

  const freeNeighborIds = freeNeighbors.map((c) => c.templateId);

  if (freeNeighborIds.length > 0 && !freeNeighborIds.includes(template.id)) {
    return;
  }

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

  const totalPlayers = session!.players.length;
  let nextIndex = session!.turnIndex + 1;

  if (nextIndex >= totalPlayers) nextIndex = 0;

  if (!session) return;

  const allCountries = await prisma.matchCountry.findMany({
    where: { gameSessionId: sessionId },
  });

  const totalCountries = allCountries.length;
  const capitalsPlaced = allCountries.filter((c) => c.isCapital).length;
  const claimedCountries = allCountries.filter((c) => c.ownerId).length;

  if (nextIndex >= totalPlayers) nextIndex = 0;

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

{
  /* QUESTIONS */
}

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

  const myCountries = await prisma.matchCountry.findMany({
    where: { gameSessionId: sessionId, ownerId: playerId },
    select: { templateId: true },
  });

  const myIds = myCountries.map((c) => c.templateId);

  const templates = await prisma.countryTemplate.findMany({
    where: { id: { in: myIds } },
  });

  const neighborIds = new Set<number>();
  for (const t of templates) {
    t.neighbors.forEach((n) => neighborIds.add(n));
  }

  const freeNeighbors = await prisma.matchCountry.findMany({
    where: {
      gameSessionId: sessionId,
      templateId: { in: [...neighborIds] },
      ownerId: null,
    },
  });

  if (freeNeighbors.length === 0) return;

  const random =
    freeNeighbors[Math.floor(Math.random() * freeNeighbors.length)];
  await capture(random.id, playerId, sessionId);
}
