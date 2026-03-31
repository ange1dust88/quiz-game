"use server";

import { getProfile } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";

export async function startGame(formData: FormData) {
  const sessionId = formData.get("sessionId") as string;

  const profile = await getProfile();
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) throw new Error("Session not found");

  const currentPlayer = session.players.find((p) => p.profileId === profile.id);
  if (!currentPlayer) throw new Error("You are not in this session");

  if (currentPlayer.role !== "host")
    throw new Error("Only host can start the game");

  if (session.players.length < 1)
    // change in prod
    throw new Error("Not enough players to start the game");

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { status: "active" },
  });
  await initializeMap(sessionId);

  redirect(`/match/${sessionId}`);
}

export async function initializeMap(sessionId: string) {
  const templates = await prisma.countryTemplate.findMany();

  const countriesData = templates.map((t) => ({
    gameSessionId: sessionId,
    templateId: t.id,
    ownerId: null,
    isCapital: false,
  }));

  await prisma.matchCountry.createMany({ data: countriesData });
}

export async function joinGame(sessionId: string) {
  const profile = await getProfile();
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { players: true },
  });
  if (!session) throw new Error("Session not found");
  if (session.status !== "waiting") throw new Error("Game already started");

  const existing = session.players.find((p) => p.profileId === profile.id);
  if (existing) return;

  await prisma.playerInGame.create({
    data: {
      gameSessionId: sessionId,
      profileId: profile.id,
      role: "player",
    },
  });
}
