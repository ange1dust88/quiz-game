"use server";

import { getProfile } from "@/app/lib/auth";
import { prisma } from "@quiz/db";
import { isValidChoice } from "@quiz/shared/matchChoices";
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

  if (session.players.length < 2)
    throw new Error("Not enough players to start the game");

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      status: "active",
      capitalExpiresAt: new Date(Date.now() + 20000),
    },
  });
  // No initializeMap call — Colyseus hydrates from CountryTemplate at room
  // creation. The legacy MatchCountry table is no longer used during the
  // live match (final state is persisted in MatchSnapshot at game_over).

  redirect(`/match-new/${sessionId}`);
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

export async function setMatchChoice(
  sessionId: string,
  key: string,
  value: string,
) {
  if (!isValidChoice(key, value)) return;

  const profile = await getProfile();
  const player = await prisma.playerInGame.findUnique({
    where: {
      gameSessionId_profileId: {
        gameSessionId: sessionId,
        profileId: profile.id,
      },
    },
    include: { gameSession: true },
  });
  if (!player) return;
  // Choices lock once the game starts so they can't be changed mid-match.
  if (player.gameSession.status !== "waiting") return;

  await prisma.matchChoice.upsert({
    where: {
      playerInGameId_key: { playerInGameId: player.id, key },
    },
    create: { playerInGameId: player.id, key, value },
    update: { value },
  });
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
