"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";

export async function claimCapital(formData: FormData) {
  const sessionId = formData.get("sessionId") as string;
  const playerId = formData.get("playerId") as string;
  const countryId = Number(formData.get("countryId"));

  if (!sessionId || !playerId || !countryId) return;

  const existingCapital = await prisma.matchCountry.findFirst({
    where: { gameSessionId: sessionId, ownerId: playerId, isCapital: true },
  });

  if (existingCapital) return;

  await prisma.matchCountry.update({
    where: {
      gameSessionId_templateId: {
        gameSessionId: sessionId,
        templateId: countryId,
      },
    },
    data: { ownerId: playerId, isCapital: true },
  });

  await advanceTurnAndStage(sessionId);

  revalidatePath(`/match/${sessionId}`);
}

export async function claimTerritory(formData: FormData) {
  const sessionId = formData.get("sessionId") as string;
  const playerId = formData.get("playerId") as string;
  const countryId = Number(formData.get("countryId"));

  if (!sessionId || !playerId || !countryId) return;

  const country = await prisma.matchCountry.findUnique({
    where: {
      gameSessionId_templateId: {
        gameSessionId: sessionId,
        templateId: countryId,
      },
    },
  });

  if (!country || country.ownerId) return;

  await prisma.matchCountry.update({
    where: {
      gameSessionId_templateId: {
        gameSessionId: sessionId,
        templateId: countryId,
      },
    },
    data: { ownerId: playerId },
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

  if (newStage === "setup" && capitalsPlaced === totalPlayers) {
    newStage = "expand";
  }

  if (newStage === "expand" && claimedCountries === totalCountries) {
    newStage = "war";
  }

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { turnIndex: nextIndex, stage: newStage },
  });
}
