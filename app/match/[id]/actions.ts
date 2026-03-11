"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";

export async function claimCapital(
  sessionId: string,
  svgId: string,
  playerId: string,
) {
  console.log(claimCapital);
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

  revalidatePath(`/match/${sessionId}`);
}

export async function claimTerritory(
  sessionId: string,
  svgId: string,
  playerId: string,
) {
  if (!sessionId || !playerId || !svgId) return;

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
    data: {
      ownerId: playerId,
    },
  });

  await advanceTurnAndStage(sessionId);

  revalidatePath(`/match/${sessionId}`);
}

export async function advanceTurnAndStage(sessionId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true, matchMap: true },
  });

  if (!session) return;

  const totalPlayers = session.players.length;

  let nextIndex = session.turnIndex + 1;
  if (nextIndex >= totalPlayers) nextIndex = 0;

  let newStage = session.stage;

  const capitalsPlaced = session.matchMap.filter((c) => c.isCapital).length;
  const totalCountries = session.matchMap.length;
  const claimedCountries = session.matchMap.filter((c) => c.ownerId).length;

  if (newStage === "capitals" && capitalsPlaced === totalPlayers) {
    newStage = "expand";
  }

  if (newStage === "expand" && claimedCountries === totalCountries) {
    newStage = "war";
  }

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      turnIndex: nextIndex,
      stage: newStage,
    },
  });
}
